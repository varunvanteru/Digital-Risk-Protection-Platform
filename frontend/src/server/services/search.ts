/**
 * On-demand search (Quick check). Port of services/search.py.
 *
 * The analyst names a brand, or pastes an official profile / app URL, and picks
 * platforms. Each selected source is searched in parallel with the same timeout,
 * retry, allowlist and scoring rules as a full scan. Results are returned, not
 * stored; any that are already tracked carry their detection id.
 */

import type { Candidate } from "../connectors/base";
import { q } from "../db";
import { allowKey, emptyContext, type BrandContext } from "../detection/context";
import { analyseName, nameSimilarity } from "../detection/lookalike";
import { normalizePublisher, normalizeTitle } from "../detection/official";
import { evaluate, excluded, isRelevant } from "../detection/signals";
import { allBrands, getBrand, type Brand } from "../repo";
import { mapLimit, todayUtc, unique } from "../util";
import {
  CONNECTORS,
  brandContext,
  fetchWithRetries,
  officialEntry,
  prefetchImages,
  sourceState,
  type SourceRow,
} from "./scan";
import { parseQuery, type ParsedQuery } from "./urls";
import { validateBrandAssets } from "./validation";

const SOCIAL_SOURCES: Record<string, string> = {
  instagram: "src_ig", facebook: "src_fb", whatsapp: "src_wa", x: "src_x", threads: "src_threads",
  linkedin: "src_li", telegram: "src_tg", snapchat: "src_snap", youtube: "src_yt", sharechat: "src_sc",
  moj: "src_moj", josh: "src_josh", pinterest: "src_pin", reddit: "src_reddit", quora: "src_quora", discord: "src_discord",
};

// Which sources answer for which platform. The demo store snapshot holds both Play and App Store items.
export const PLATFORM_SOURCES: Record<string, string[]> = {
  ...Object.fromEntries(Object.entries(SOCIAL_SOURCES).map(([p, sid]) => [p, [sid]])),
  google_play: ["src_play", "src_store_demo"],
  app_store: ["src_appstore", "src_store_demo"],
  apk_site: ["src_apk"],
};
export const PLATFORMS = Object.keys(PLATFORM_SOURCES);

/**
 * Compare against the registered brand the query refers to (any brand, active first);
 * otherwise against the typed name alone, with nothing known to be official.
 */
async function reference(qy: ParsedQuery): Promise<[BrandContext, Brand | null]> {
  for (const brand of await allBrands()) {
    const ctx = await brandContext(brand);
    const isOfficialUrl = qy.platform !== null && ctx.allowlist.has(allowKey(qy.platform, qy.identifier ?? ""));
    if (isOfficialUrl || nameSimilarity([qy.name], ctx.aliases)[0] >= 0.85) return [ctx, brand];
  }
  const allow = new Set(qy.platform && qy.identifier ? [allowKey(qy.platform, qy.identifier)] : []);
  const words = qy.name.replace(/[_.\-]+/g, " ").trim();
  return [emptyContext({ brandId: "adhoc", name: words, aliases: unique([words, qy.name]), allowlist: allow }), null];
}

const LIVE_STORE_SOURCES = new Set(["src_play", "src_appstore"]);

interface Suggested {
  platform: string;
  packageId: string;
  name: string;
  publisher: string | null;
  publisherId: string | null;
  audience: number;
  iconUrl: string | null;
}

/**
 * For a brand that is not registered: propose its probable official publisher and apps,
 * for the analyst to confirm. Never trusted automatically.
 */
export function suggestOfficial(query: string, candidates: Candidate[], ctx: BrandContext) {
  const qn = normalizePublisher(query);
  if (!qn) return null;
  const qTokens = qn.split(" ");
  const picked: Suggested[] = [];
  const publishers: { platform: string; name: string | null; id: string | null }[] = [];
  const asSuggested = (a: Candidate): Suggested => ({
    platform: a.platform, packageId: a.handle, name: a.displayName, publisher: a.publisher,
    publisherId: a.publisherId, audience: a.audience, iconUrl: a.image,
  });
  for (const platform of ["google_play", "app_store"]) {
    const groups = new Map<string, Candidate[]>();
    for (const c of candidates) {
      if (c.platform !== platform || !LIVE_STORE_SOURCES.has(c.sourceId) || !c.publisher) continue;
      const pub = normalizePublisher(c.publisher).split(" ").filter(Boolean);
      // brand name as whole words in the publisher name, e.g. "hdfc bank" in "hdfc bank"
      let found = false;
      for (let i = 0; i < pub.length && !found; i++) found = qTokens.every((t, j) => pub[i + j] === t);
      if (!found) continue;
      if (nameSimilarity([c.displayName, c.handle], ctx.aliases)[0] < 0.6) continue;
      const key = c.publisherId || normalizePublisher(c.publisher);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    if (!groups.size) continue;
    let best: Candidate[] = [];
    let bestTotal = -1;
    for (const apps of groups.values()) {
      const total = apps.reduce((s, a) => s + a.audience, 0);
      if (total > bestTotal) [best, bestTotal] = [apps, total];
    }
    best = [...best].sort((a, b) => b.audience - a.audience);
    publishers.push({ platform, name: best[0].publisher, id: best[0].publisherId });
    picked.push(...best.slice(0, 6).map(asSuggested));
  }
  // The same app on the other store often has the legal entity as publisher (not containing the
  // brand name). Offer exact-title twins of the picked apps too; the analyst confirms them.
  const titles = new Set(picked.map((a) => `${a.platform}|${normalizeTitle(a.name)}`));
  const have = new Set(picked.map((a) => `${a.platform}|${a.packageId}`));
  for (const c of candidates) {
    if (!LIVE_STORE_SOURCES.has(c.sourceId) || have.has(`${c.platform}|${c.handle}`)) continue;
    const other = c.platform === "google_play" ? "app_store" : "google_play";
    if (titles.has(`${other}|${normalizeTitle(c.displayName)}`)) {
      have.add(`${c.platform}|${c.handle}`);
      picked.push(asSuggested(c));
      if (c.publisher && !publishers.some((p) => p.platform === c.platform && p.name === c.publisher)) {
        publishers.push({ platform: c.platform, name: c.publisher, id: c.publisherId });
      }
    }
  }
  if (!picked.length) return null;
  let top = picked[0];
  for (const a of picked) if (a.audience > top.audience) top = a;
  const desc = candidates.find((c) => c.handle === top.packageId && c.bio)?.bio ?? "";
  return {
    brandName: query.trim(),
    publishers,
    apps: picked,
    description: Array.from(desc).slice(0, 600).join(""),
    note: "Suggested from live store results: the developer named like the brand with the most installs. Confirm before registering.",
  };
}

export async function runSearch(raw: string, platforms: string[]) {
  const qy = parseQuery(raw);
  const wanted = !platforms.length || platforms.includes("all") ? PLATFORMS : PLATFORMS.filter((p) => platforms.includes(p));
  let [ctx, brand] = await reference(qy);
  if (brand) {
    // Make sure official apps are validated (cached for 24 h) before judging candidates.
    await validateBrandAssets(brand);
    brand = (await getBrand(brand.id))!;
    ctx = await brandContext(brand);
  }
  const today = todayUtc();
  const keywords = unique([qy.name, ...ctx.aliases]);

  const sourceIds = unique(wanted.flatMap((p) => PLATFORM_SOURCES[p]));
  const rows = sourceIds.length ? await q<SourceRow>(`SELECT * FROM sources WHERE id IN (${sourceIds.map(() => "?").join(",")})`, sourceIds) : [];
  const sources = new Map(rows.map((s) => [s.id, s]));

  type PlatformStatus = { platform: string; ok: boolean; found: number; official: number; sources: Record<string, unknown>[] };
  const status: Record<string, PlatformStatus> = Object.fromEntries(
    wanted.map((p) => [p, { platform: p, ok: false, found: 0, official: 0, sources: [] }]),
  );
  const candidates: Candidate[] = [];

  // Fan out; record each source as it completes (completion order, like as_completed).
  await Promise.all(
    sourceIds
      .filter((sid) => sources.has(sid))
      .map(async (sid) => {
        const src = sources.get(sid)!;
        let items: Candidate[] = [];
        let latency: number | null = null;
        let cachedAt: string | null = null;
        let ok = true;
        let error: string | null = null;
        try {
          [items, latency, , cachedAt] = await fetchWithRetries(src, keywords);
        } catch (e) {
          ok = false;
          error = (e as Error).message;
        }
        const state = sourceState(src, ok, cachedAt);
        for (const p of wanted) {
          if (PLATFORM_SOURCES[p].includes(sid)) {
            status[p].sources.push({
              id: sid, name: src.name, mode: src.mode, state, ok, error, latencyMs: latency,
              cachedAt: cachedAt ? cachedAt.replace(" ", "T") + "Z" : null,
            });
          }
        }
        candidates.push(...items.filter((c) => wanted.includes(c.platform)));
      }),
  );
  for (const p of wanted) status[p].ok = status[p].sources.some((s) => s.ok);

  const play = CONNECTORS.src_play;
  const toEnrich = candidates.filter((c) => c.sourceId === "src_play" && nameSimilarity([c.displayName, c.handle], ctx.aliases)[0] >= 0.6);
  await mapLimit(toEnrich, 4, (c) => play.enrich!(c));
  await prefetchImages(candidates);

  const tracked = new Map(
    (await q<{ id: string; platform: string; identifier: string }>(
      "SELECT id, platform, identifier FROM detections WHERE brand_id = ?",
      [brand ? brand.id : ""],
    )).map((d) => [allowKey(d.platform, d.identifier), d.id]),
  );

  const results: Record<string, unknown>[] = [];
  const official: ReturnType<typeof officialEntry>[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = allowKey(c.platform, c.identifier);
    if (seen.has(key)) continue;
    seen.add(key);
    const ev = await evaluate(c, ctx, today);
    // Official assets were verified before scoring and are reported separately, with zero risk.
    if (excluded(ev)) {
      status[c.platform].official++;
      official.push(officialEntry(c, ev));
      continue;
    }
    if (!isRelevant(ev.signals)) continue;
    status[c.platform].found++;
    results.push({
      status: ev.status,
      riskScore: ev.breakdown!.score,
      excluded: false,
      platform: c.platform,
      channel: c.channel,
      cls: ev.cls,
      displayName: c.displayName,
      handle: c.handle,
      url: c.url,
      mark: ev.mark,
      iconUrl: c.image,
      publisher: c.publisher,
      publisherId: c.publisherId,
      audience: c.audience,
      reasons: ev.reasons,
      signals: ev.signals,
      checks: ev.checks,
      breakdown: ev.breakdown,
      detectionId: tracked.get(key) ?? null,
    });
  }

  results.sort((a, b) => (b.riskScore as number) - (a.riskScore as number));
  official.sort((a, b) => a.level - b.level || (a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0));
  return {
    query: raw,
    searchedFor: qy.name,
    pastedUrl: qy.platform ? { platform: qy.platform, identifier: qy.identifier } : null,
    reference: brand ? { type: "brand", name: brand.name, id: brand.id } : { type: "query", name: ctx.name },
    platforms: wanted.map((p) => status[p]),
    results,
    official,
    // Kept for older clients: same entries, short form.
    officialSkipped: official.map((o) => ({ platform: o.platform, handle: o.handle, displayName: o.displayName, url: o.url })),
    nameAnalysis: analyseName(qy.name, ctx.aliases),
    // Only for brands that are not registered yet.
    suggestedOfficial: brand === null ? suggestOfficial(qy.name, candidates, ctx) : null,
  };
}
