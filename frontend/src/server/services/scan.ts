/**
 * Scan orchestration. Allowlist-first (port of services/scan.py):
 *
 *   1. validate the brand's official apps against their stores (cached 24 h)
 *   2. build the allowlist and verified identities (IDs, developer accounts, publishers)
 *   3. collect candidates from every source (live stores fall back to cache, labelled)
 *   4. official-asset verification: OFFICIAL / LIKELY_OFFICIAL candidates stop here
 *   5. risk signals and scoring for everything else
 *   6. Gate 2: re-check the allowlist in the database, then upsert detections
 *
 * A failing source is recorded and skipped; the scan always finishes.
 */

import { settings } from "../config";
import { candidate, firstChars, SourceUnavailable, type Candidate, type Connector } from "../connectors/base";
import { SocialDataset, StoreDataset } from "../connectors/datasets";
import { DiscordLive, NotConnected, SourceNotConnected, RedditLive, TelegramLive, WebSearchLive, YouTubeLive } from "../connectors/live";
import { AppStoreLive, GooglePlayLive } from "../connectors/stores";
import { exec, js, one, q } from "../db";
import { allowKey, emptyContext, type BrandContext } from "../detection/context";
import { features } from "../detection/images";
import { nameSimilarity } from "../detection/lookalike";
import { normalizePublisher, normalizeTitle, packageNamespace } from "../detection/official";
import { scoreDetection } from "../detection/scoring";
import { evaluate, excluded, isRelevant, type Evaluation } from "../detection/signals";
import { mediaExists } from "../media";
import { getBrand, type Brand } from "../repo";
import { inWorkspace } from "../workspace";
import { hexId, iso, mapLimit, pyRound, sleep, SourceTimeout, todayUtc, unique, utcnow, withTimeout } from "../util";

/** Live: every source searches the real platform, or says it is not connected. */
const LIVE_CONNECTORS: Record<string, Connector> = {
  src_play: new GooglePlayLive(),
  src_appstore: new AppStoreLive(),
  src_ig: new WebSearchLive("src_ig", "instagram"),
  src_x: new WebSearchLive("src_x", "x"),
  src_fb: new WebSearchLive("src_fb", "facebook"),
  src_tg: new TelegramLive(),
  src_wa: new WebSearchLive("src_wa", "whatsapp"),
  src_threads: new WebSearchLive("src_threads", "threads"),
  src_li: new WebSearchLive("src_li", "linkedin"),
  src_snap: new WebSearchLive("src_snap", "snapchat"),
  src_yt: new YouTubeLive(),
  src_sc: new WebSearchLive("src_sc", "sharechat"),
  src_moj: new WebSearchLive("src_moj", "moj"),
  src_josh: new WebSearchLive("src_josh", "josh"),
  src_pin: new WebSearchLive("src_pin", "pinterest"),
  src_reddit: new RedditLive(),
  src_quora: new WebSearchLive("src_quora", "quora"),
  src_discord: new DiscordLive(),
};

/** Automated tests only: curated fixtures stand in for the social sources, so runs are repeatable and offline. */
const FIXTURE_CONNECTORS: Record<string, Connector> = {
  src_play: new GooglePlayLive(),
  src_appstore: new AppStoreLive(),
  src_store_demo: new StoreDataset("src_store_demo", "store_snapshot.json"),
  src_apk: new StoreDataset("src_apk", "apk_sites.json"),
  src_ig: new SocialDataset("src_ig", "instagram"),
  src_x: new SocialDataset("src_x", "x"),
  src_fb: new SocialDataset("src_fb", "facebook"),
  src_tg: new SocialDataset("src_tg", "telegram"),
  src_wa: new SocialDataset("src_wa", "whatsapp"),
  src_threads: new SocialDataset("src_threads", "threads"),
  src_li: new SocialDataset("src_li", "linkedin"),
  src_snap: new SocialDataset("src_snap", "snapchat"),
  src_yt: new SocialDataset("src_yt", "youtube"),
  src_sc: new SocialDataset("src_sc", "sharechat"),
  src_moj: new SocialDataset("src_moj", "moj"),
  src_josh: new SocialDataset("src_josh", "josh"),
  src_pin: new SocialDataset("src_pin", "pinterest"),
  src_reddit: new SocialDataset("src_reddit", "reddit"),
  src_quora: new SocialDataset("src_quora", "quora"),
  src_discord: new SocialDataset("src_discord", "discord"),
};

export const CONNECTORS: Record<string, Connector> = settings.dataMode === "fixtures" ? FIXTURE_CONNECTORS : LIVE_CONNECTORS;

/** Sources whose results come from a live search (cached on success, served from cache on failure). */
export const LIVE_SOURCES = new Set(
  settings.dataMode === "fixtures" ? ["src_play", "src_appstore"] : Object.keys(LIVE_CONNECTORS).filter((id) => !(LIVE_CONNECTORS[id] instanceof NotConnected)),
);

/** Why a source cannot run right now (no public API, key not set), or null. */
export const notConnectedReason = (sourceId: string) => CONNECTORS[sourceId]?.notConnected?.() ?? null;

export interface SourceRow {
  id: string;
  name: string;
  platform: string;
  channel: string;
  mode: string;
  health: string;
  simulate_outage: number;
}

/** Everything the engine knows about what is genuinely the brand's. */
export async function brandContext(brand: Brand): Promise<BrandContext> {
  const assets = brand.assets;
  const byPlatform = new Map<string, Set<string>>();
  for (const a of assets) {
    if (a.kind === "app" && a.publisherId) {
      if (!byPlatform.has(a.platform)) byPlatform.set(a.platform, new Set());
      byPlatform.get(a.platform)!.add(a.publisherId);
    }
  }
  const names = new Set<string>();
  for (const p of brand.publishers) {
    names.add(normalizePublisher(p.name));
    for (const x of p.aliases ?? []) names.add(normalizePublisher(x));
  }
  if (brand.legalName) names.add(normalizePublisher(brand.legalName));
  // Publisher names the stores report for the brand's own validated apps are trustworthy too.
  for (const a of assets) if (a.kind === "app" && a.publisher && a.validationStatus === "verified") names.add(normalizePublisher(a.publisher));
  names.delete("");

  const logoRel = brand.logoPath?.replace(/^\/media\//, "");
  return emptyContext({
    brandId: brand.id,
    name: brand.name,
    aliases: unique([brand.name, ...brand.aliases]),
    domains: brand.domains.map((d) => d.toLowerCase()),
    description: brand.description,
    logoRef: logoRel && (await mediaExists(logoRel)) ? brand.logoPath : null,
    publisherIds: new Set(brand.publishers.map((p) => p.publisherId).filter(Boolean)),
    publisherNames: names,
    allowlist: new Set(assets.map((a) => allowKey(a.platform, a.identifier))),
    publisherIdsByPlatform: byPlatform,
    officialNamespaces: new Set(
      assets.filter((a) => a.platform === "google_play").map((a) => packageNamespace(a.identifier)).filter((n): n is string => !!n),
    ),
    officialIcons: assets.filter((a) => a.kind === "app" && a.iconUrl).map((a) => a.iconUrl as string),
    officialTitles: new Set(
      assets.filter((a) => a.kind === "app" && a.storeTitle && a.validationStatus === "verified").map((a) => normalizeTitle(a.storeTitle)),
    ),
  });
}

// ---------- live-source cache (same payload format as the Python engine) ----------

const cacheKey = (sourceId: string, keywords: string[]) =>
  firstChars(`${sourceId}|${keywords.map((k) => k.toLowerCase()).sort().join("|")}`, 255);

function encode(c: Candidate) {
  return {
    source_id: c.sourceId, channel: c.channel, platform: c.platform, identifier: c.identifier, handle: c.handle,
    display_name: c.displayName, url: c.url, bio: c.bio, audience: c.audience, created_on: c.createdOn,
    publisher: c.publisher, publisher_id: c.publisherId, links: c.links, verified: c.verified, image: c.image,
    mark: c.mark, privacy_url: c.privacyUrl, first_seen: c.firstSeen ? c.firstSeen.replace(" ", "T") : null,
    seed_status: c.seedStatus,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decode(d: any): Candidate {
  return candidate({
    sourceId: d.source_id, channel: d.channel, platform: d.platform, identifier: d.identifier, handle: d.handle,
    displayName: d.display_name, url: d.url, bio: d.bio ?? "", audience: d.audience ?? 0, createdOn: d.created_on ?? null,
    publisher: d.publisher ?? null, publisherId: d.publisher_id ?? null, links: d.links ?? [], verified: !!d.verified,
    image: d.image ?? null, mark: d.mark ?? "unrelated", privacyUrl: d.privacy_url ?? null,
    firstSeen: d.first_seen ? String(d.first_seen).replace("T", " ").slice(0, 19) : null, seedStatus: d.seed_status ?? null,
  });
}

async function saveCache(sourceId: string, keywords: string[], items: Candidate[]): Promise<void> {
  await exec(
    `INSERT INTO source_cache (source_id, query_key, fetched_at, payload) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE fetched_at = VALUES(fetched_at), payload = VALUES(payload)`,
    [sourceId, cacheKey(sourceId, keywords), utcnow(), JSON.stringify(items.map(encode))],
  );
}

async function loadCache(sourceId: string, keywords: string[]): Promise<[Candidate[], string] | null> {
  const row = await one<{ fetched_at: string; payload: unknown }>(
    "SELECT fetched_at, payload FROM source_cache WHERE source_id = ? AND query_key = ?",
    [sourceId, cacheKey(sourceId, keywords)],
  );
  if (!row) return null;
  return [js<unknown[]>(row.payload, []).map(decode), row.fetched_at];
}

/**
 * Candidates, latency in ms, retries needed, and cachedAt (set only when a live
 * source failed and its last good results were served from cache).
 */
export async function fetchWithRetries(
  source: SourceRow,
  keywords: string[],
): Promise<[Candidate[], number | null, number, string | null, string | null]> {
  const connector = CONNECTORS[source.id];
  const reason = notConnectedReason(source.id);
  if (reason) throw new SourceNotConnected(reason); // no retries, no cache: there is nothing to fetch
  // Sources with a tight daily quota reuse a recent successful search (from any workspace).
  // The 5th value is when that search ran, so the Sources page can say so.
  if (connector.shareResultsMs && LIVE_SOURCES.has(source.id) && !source.simulate_outage) {
    const recent = await loadCache(source.id, keywords);
    if (recent && Date.now() - Date.parse(`${recent[1].replace(" ", "T")}Z`) < connector.shareResultsMs) return [recent[0], null, 0, null, recent[1]];
  }
  const timeout = connector.timeoutMs ?? settings.sourceTimeoutMs;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= settings.sourceRetries; attempt++) {
    if (source.simulate_outage) {
      lastError = new SourceUnavailable("Paused for a test");
      break;
    }
    const start = performance.now();
    try {
      const items = await withTimeout(connector.fetch(keywords), timeout, source.id);
      if (LIVE_SOURCES.has(source.id)) await saveCache(source.id, keywords, items);
      return [items, pyRound(performance.now() - start), attempt, null, null];
    } catch (e) {
      if (e instanceof SourceNotConnected) throw e; // a setup problem: retrying or serving the cache would hide it
      lastError = e instanceof SourceTimeout ? new SourceUnavailable(e.message) : (e as Error);
    }
    await sleep(500 * (attempt + 1));
  }
  if (LIVE_SOURCES.has(source.id) && !source.simulate_outage) {
    const cached = await loadCache(source.id, keywords);
    if (cached) return [cached[0], null, settings.sourceRetries, cached[1], null];
  }
  throw new SourceUnavailable(lastError ? lastError.message : "Unknown error");
}

/** Download remote icons in parallel so scoring is not bound by sequential HTTP. */
export async function prefetchImages(cands: Candidate[]): Promise<void> {
  const remote = unique(cands.map((c) => c.image).filter((u): u is string => !!u && u.startsWith("http")));
  await mapLimit(remote, 16, (u) => features(u));
}

export function sourceState(source: SourceRow, ok: boolean, cachedAt: string | null, notConnected = false): string {
  if (notConnected) return "not_connected";
  if (!ok) return "down";
  if (cachedAt !== null) return "cached";
  return LIVE_SOURCES.has(source.id) ? "live" : "simulated";
}

export function officialEntry(c: Candidate, ev: Evaluation) {
  const o = ev.official!;
  return {
    platform: c.platform, channel: c.channel, handle: c.handle, displayName: c.displayName, url: c.url,
    iconUrl: c.image, publisher: c.publisher, publisherId: c.publisherId, status: o.status, level: o.level,
    confidence: o.confidence, evidence: o.evidence, inProfile: o.inProfile, riskScore: 0, excluded: true,
    checks: ev.checks,
  };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtCached = (t: string) => `${t.slice(8, 10)} ${MON[Number(t.slice(5, 7)) - 1]} ${t.slice(11, 16)}`;

// ---------- scan ----------

// Each workspace scans its own brand; a few scans run at once and the rest wait their turn,
// so many visitors do not hammer the stores together.
const MAX_PARALLEL_SCANS = 3;
const g = globalThis as unknown as { __bsPending?: Map<string, number>; __bsRunning?: number; __bsQueue?: (() => void)[] };
const pending = () => (g.__bsPending ??= new Map());

/** A scan for this brand is queued or running in this process. */
export const isScanning = (brandId: string) => (pending().get(brandId) ?? 0) > 0;

async function slot(): Promise<void> {
  g.__bsRunning ??= 0;
  if (g.__bsRunning < MAX_PARALLEL_SCANS) {
    g.__bsRunning++;
    return;
  }
  await new Promise<void>((resolve) => (g.__bsQueue ??= []).push(resolve));
}

function release() {
  const next = g.__bsQueue?.shift();
  if (next) next(); // hand the slot straight to the next scan
  else g.__bsRunning = Math.max(0, (g.__bsRunning ?? 1) - 1);
}

export async function runScan(scanId: string, brandId: string): Promise<void> {
  const p = pending();
  p.set(brandId, (p.get(brandId) ?? 0) + 1);
  await slot();
  try {
    await runOne(scanId, brandId);
  } finally {
    release();
    const n = (p.get(brandId) ?? 1) - 1;
    if (n > 0) p.set(brandId, n);
    else p.delete(brandId);
  }
}

async function runOne(scanId: string, brandId: string): Promise<void> {
  const scan = await one("SELECT id FROM scans WHERE id = ?", [scanId]);
  const brand = await getBrand(brandId);
  if (!scan || !brand) return;
  let status = "done";
  try {
    // Run in the brand's workspace, so workspace-scoped lookups (demo avatars) see its brands.
    if (brand.workspaceId) await inWorkspace(brand.workspaceId, () => run(scanId, brand));
    else await run(scanId, brand);
  } catch (e) {
    console.error(`scan ${scanId} failed`, e);
    status = "failed";
  }
  await exec("UPDATE scans SET status = ?, finished_at = ? WHERE id = ?", [status, utcnow(), scanId]);
}

async function run(scanId: string, brand: Brand): Promise<void> {
  const { validateBrandAssets } = await import("./validation");
  const validation = await validateBrandAssets(brand);
  brand = (await getBrand(brand.id))!;
  const ctx = await brandContext(brand);
  // The brand name first: connectors with a tight query budget (YouTube, web search) use the first terms.
  const keywords = unique([brand.name, ...(brand.keywords ?? [])]);
  const today = todayUtc();
  const status: Record<string, unknown> = {};
  const officialFound: ReturnType<typeof officialEntry>[] = [];
  const totals = { candidates: 0, skipped: 0, new: 0 };

  for (const source of await q<SourceRow>("SELECT * FROM sources ORDER BY id")) {
    if (!(source.id in CONNECTORS)) continue;
    let items: Candidate[], latency: number | null, retries: number, cachedAt: string | null, sharedAt: string | null;
    try {
      [items, latency, retries, cachedAt, sharedAt] = await fetchWithRetries(source, keywords);
    } catch (e) {
      const msg = (e as Error).message;
      if (e instanceof SourceNotConnected) {
        await exec("UPDATE sources SET health = 'not_connected', state = 'not_connected', note = ?, latency_ms = NULL, items_last_scan = 0 WHERE id = ?", [
          firstChars(msg, 255),
          source.id,
        ]);
        status[source.id] = { ok: false, state: "not_connected", error: msg };
        continue;
      }
      await exec("UPDATE sources SET health = 'unavailable', state = 'down', note = ?, latency_ms = NULL WHERE id = ?", [
        firstChars(`${msg}. Showing the last good results.`, 255),
        source.id,
      ]);
      status[source.id] = { ok: false, state: "down", error: msg };
      continue;
    }

    const state = sourceState(source, true, cachedAt);
    if (cachedAt !== null) {
      await exec("UPDATE sources SET state = ?, health = 'degraded', note = ?, latency_ms = NULL, items_last_scan = ? WHERE id = ?", [
        state, `Live search failed; using cached results from ${fmtCached(cachedAt)} UTC`, items.length, source.id,
      ]);
    } else {
      // A connector can explain how it answered (e.g. which web search provider, and why another was skipped).
      const how = sharedAt
        ? `From the live search at ${fmtCached(sharedAt)} UTC, reused for 12 hours to save the daily API quota`
        : (CONNECTORS[source.id].statusNote?.() ?? null);
      await exec("UPDATE sources SET state = ?, health = ?, note = ?, latency_ms = ?, last_success = ?, items_last_scan = ? WHERE id = ?", [
        state, retries ? "degraded" : "operational",
        firstChars([retries ? `Succeeded after ${retries} retr${retries === 1 ? "y" : "ies"}` : null, how].filter(Boolean).join(". "), 255) || null,
        latency, utcnow(), items.length, source.id,
      ]);
    }
    totals.candidates += items.length;

    const connector = CONNECTORS[source.id];
    if (connector.enrich && cachedAt === null) {
      // Live Play results: fetch detail (developer ID, dates) only for plausible matches.
      const relevant = items.filter((c) => nameSimilarity([c.displayName, c.handle], ctx.aliases)[0] >= 0.6);
      await mapLimit(relevant, 4, (c) => connector.enrich!(c));
    }
    await prefetchImages(items);

    let kept = 0;
    for (const c of items) {
      const ev = await evaluate(c, ctx, today);
      // Official-asset exclusion: verified official candidates never reach scoring or storage as threats.
      if (excluded(ev)) {
        totals.skipped++;
        officialFound.push(officialEntry(c, ev));
        await retractIfTracked(brand.id, c);
        continue;
      }
      if (!isRelevant(ev.signals)) continue;
      // Gate 2: the profile may have changed during the scan.
      if (await one("SELECT id FROM official_assets WHERE brand_id = ? AND platform = ? AND identifier = ?", [brand.id, c.platform, c.identifier])) {
        totals.skipped++;
        continue;
      }
      kept++;
      if (await upsert(brand.id, scanId, c, ev)) totals.new++;
    }
    status[source.id] = {
      ok: true, state, items: items.length, kept, latencyMs: latency, retries, cachedAt: cachedAt ? iso(cachedAt) : null,
    };
  }

  const allow = (await brandContext((await getBrand(brand.id))!)).allowlist;
  const flagged = await q<{ platform: string; identifier: string; status: string }>(
    "SELECT platform, identifier, status FROM detections WHERE brand_id = ?",
    [brand.id],
  );
  const officialFlagged = flagged.filter((d) => allow.has(allowKey(d.platform, d.identifier)) && d.status !== "official").length;
  const uniq = new Map<string, ReturnType<typeof officialEntry>>();
  for (const o of officialFound) uniq.set(`${o.platform}|${o.handle.toLowerCase()}`, o);
  const uniqueOfficial = [...uniq.values()];
  const sourceStatus = {
    sources: status,
    officialFound: uniqueOfficial,
    // Verified official but not yet listed in the profile: offer to add them.
    possiblyOfficial: uniqueOfficial
      .filter((o) => !o.inProfile && o.channel === "app")
      .map((o) => ({
        platform: o.platform, name: o.displayName, packageId: o.handle, publisher: o.publisher,
        publisherId: o.publisherId, status: o.status, evidence: o.evidence,
      })),
    validation,
  };
  await exec(
    "UPDATE scans SET official_flagged = ?, candidates = ?, official_skipped = ?, new_detections = ?, source_status = ? WHERE id = ?",
    [officialFlagged, totals.candidates, totals.skipped, totals.new, JSON.stringify(sourceStatus), scanId],
  );
}

/** A detection created before an asset was known to be official is closed, with an audit event. */
async function retractIfTracked(brandId: string, c: Candidate): Promise<void> {
  const d = await one<{ id: string; status: string }>(
    "SELECT id, status FROM detections WHERE brand_id = ? AND platform = ? AND identifier = ?",
    [brandId, c.platform, c.identifier],
  );
  if (d && d.status !== "official") {
    await exec("INSERT INTO detection_events (detection_id, at, action, from_status, to_status) VALUES (?, ?, 'verified_official', ?, 'official')", [
      d.id, utcnow(), d.status,
    ]);
    await exec("UPDATE detections SET status = 'official' WHERE id = ?", [d.id]);
  }
}

async function upsert(brandId: string, scanId: string, c: Candidate, ev: Evaluation): Promise<boolean> {
  const now = utcnow();
  const existing = await one<{ id: string; feedback_penalty: number }>(
    "SELECT id, feedback_penalty FROM detections WHERE brand_id = ? AND platform = ? AND identifier = ?",
    [brandId, c.platform, c.identifier],
  );
  let bd = ev.breakdown!;
  const penalty = existing ? Number(existing.feedback_penalty) : 0;
  if (penalty) bd = scoreDetection(c.channel, ev.signals, ev.lookalikeDomain, ev.contextLabel, penalty);

  const fields = {
    source_id: c.sourceId, channel: c.channel, cls: ev.cls, display_name: firstChars(c.displayName, 200), handle: c.handle,
    // icon_url holds up to 500 characters; a longer address (e.g. an inline image) is dropped, not truncated.
    url: firstChars(c.url, 500), mark: ev.mark, icon_url: c.image && c.image.length <= 500 ? c.image : null, bio: c.bio,
    audience: Math.min(Math.max(0, Math.trunc(c.audience)), 2_000_000_000), // 32-bit column created_on: c.createdOn,
    publisher: c.publisher, publisher_id: c.publisherId, links: JSON.stringify(c.links), last_seen: now, scan_id: scanId,
    signals: JSON.stringify(ev.signals), reasons: JSON.stringify(ev.reasons), checks: JSON.stringify(ev.checks),
    lookalike_domain: ev.lookalikeDomain ? 1 : 0, context_label: ev.contextLabel, score: bd.score, severity: bd.severity,
  };
  if (existing) {
    const cols = Object.keys(fields);
    await exec(`UPDATE detections SET ${cols.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...Object.values(fields), existing.id]);
    return false;
  }
  const row = {
    id: `det_${hexId(10)}`, brand_id: brandId, platform: c.platform, identifier: c.identifier,
    first_seen: c.firstSeen ?? now, status: c.seedStatus ?? "open", feedback_penalty: 0.0, ...fields,
  };
  const cols = Object.keys(row);
  await exec(`INSERT INTO detections (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, Object.values(row));
  return true;
}

export async function startScan(brandId: string): Promise<string> {
  const id = `scn_${hexId(8)}`;
  await exec(
    "INSERT INTO scans (id, brand_id, status, started_at, candidates, official_skipped, official_flagged, new_detections, source_status) VALUES (?, ?, 'running', ?, 0, 0, 0, 0, '{}')",
    [id, brandId, utcnow()],
  );
  void runScan(id, brandId).catch((e) => console.error("scan crashed", e));
  return id;
}
