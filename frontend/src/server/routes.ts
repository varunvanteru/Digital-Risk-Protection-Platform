/**
 * The REST API under /api, same paths and JSON as the Python reference
 * (backend/app/routes.py). Served by the Next.js app itself, so the website and
 * the API share one origin.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { ensureWorkspace } from "./init";
import { currentWorkspace, inWorkspace } from "./workspace";
import sharp from "sharp";
import { settings } from "./config";
import { exec, js, one, q } from "./db";
import { clearImageCache } from "./detection/images";
import { analyseName } from "./detection/lookalike";
import { scoreDetection } from "./detection/scoring";
import { runEvaluation } from "./evaluation";
import { appIdError, cleanHandle, domainError, handleError, nameError, SOCIAL_PLATFORMS } from "./inputRules";
import { saveMedia } from "./media";
import { allBrands, currentBrand, getBrand, ownBrand, type Brand } from "./repo";
import { brandContext, isScanning, startScan } from "./services/scan";
import { PLATFORMS, runSearch } from "./services/search";
import { validateBrandAssets } from "./services/validation";
import { brandOut, brandSummary, detectionOut, scanOut, sourceOut } from "./serializers";
import { allowKey } from "./detection/context";
import { badRequest, hexId, HttpError, iso, unique, utcnow } from "./util";

const FALSE_POSITIVE_PENALTY = 0.15;
const STATUSES = ["open", "confirmed", "takedown_requested", "false_positive", "official"];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Body = any;

// ---------- request validation (the 422 shapes FastAPI / pydantic return) ----------

function invalid(msg: string, loc: string[]): never {
  throw new HttpError(422, [{ type: "value_error", loc: ["body", ...loc], msg }]);
}

function str(body: Body, key: string, opts: { required?: boolean; min?: number; max?: number } = {}): string | undefined {
  const v = body?.[key];
  if (v === undefined || v === null) {
    if (opts.required) invalid("Field required", [key]);
    return undefined;
  }
  if (typeof v !== "string") invalid("Input should be a valid string", [key]);
  if (opts.min !== undefined && v.length < opts.min) invalid(`String should have at least ${opts.min} characters`, [key]);
  if (opts.max !== undefined && v.length > opts.max) invalid(`String should have at most ${opts.max} characters`, [key]);
  return v;
}

const list = (body: Body, key: string): any[] => {
  const v = body?.[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) invalid("Input should be a valid list", [key]);
  return v;
};

interface AccountIn { platform: string; handle: string; status: "official" | "partner"; displayName?: string; verified: boolean }
interface AppIn { platform: "google_play" | "app_store"; packageId: string; name?: string; publisher?: string; publisherId?: string }

function accountIn(a: Body): AccountIn {
  const status = a?.status ?? "official";
  if (!["official", "partner"].includes(status)) invalid("Input should be 'official' or 'partner'", ["status"]);
  return { platform: str(a, "platform", { required: true })!, handle: str(a, "handle", { required: true })!, status, displayName: str(a, "displayName"), verified: !!a?.verified };
}

function appIn(a: Body): AppIn {
  const platform = str(a, "platform", { required: true })!;
  if (platform !== "google_play" && platform !== "app_store") invalid("Input should be 'google_play' or 'app_store'", ["platform"]);
  return { platform, packageId: str(a, "packageId", { required: true })!, name: str(a, "name"), publisher: str(a, "publisher"), publisherId: str(a, "publisherId") };
}

interface BrandIn {
  name: string; legalName?: string; aliases: string[]; keywords: string[]; domains: string[]; description: string;
  publisher?: string; publisherAliases: string[]; accounts: AccountIn[]; apps: AppIn[];
}

function brandIn(b: Body): BrandIn {
  return {
    name: str(b, "name", { required: true })!,
    legalName: str(b, "legalName"),
    aliases: list(b, "aliases").map(String),
    keywords: list(b, "keywords").map(String),
    domains: list(b, "domains").map(String),
    description: str(b, "description", { required: true })!,
    publisher: str(b, "publisher"),
    publisherAliases: list(b, "publisherAliases").map(String),
    accounts: list(b, "accounts").map(accountIn),
    apps: list(b, "apps").map(appIn),
  };
}

// ---------- brand profile ----------

interface NewAsset {
  kind: "social" | "app"; platform: string; identifier: string; handle: string; canonical_id: string; display_name: string;
  status: string; verified: number; publisher: string | null; publisher_id: string | null; created_at: string;
  store_title?: string | null; icon_url?: string | null; validated_at?: string | null; validation_status?: string | null; validation_note?: string | null;
}

function socialAsset(brand: { name: string }, a: AccountIn): NewAsset {
  const handle = cleanHandle(a.handle);
  const err = handleError(a.platform, handle);
  if (err) badRequest("handle", err);
  return {
    kind: "social", platform: a.platform, identifier: handle.toLowerCase(), handle, canonical_id: `${a.platform}:${handle.toLowerCase()}`,
    display_name: a.displayName || brand.name, status: a.status, verified: a.verified ? 1 : 0, publisher: null, publisher_id: null, created_at: utcnow(),
  };
}

function appAsset(brand: { name: string }, a: AppIn, publisher: string | null | undefined): NewAsset {
  const pkg = a.packageId.trim();
  const err = appIdError(a.platform, pkg);
  if (err) badRequest("packageId", err);
  return {
    kind: "app", platform: a.platform, identifier: pkg.toLowerCase(), handle: pkg, canonical_id: `${a.platform}:${pkg}`,
    display_name: a.name || brand.name, status: "official", verified: 1, publisher: a.publisher || publisher || null,
    publisher_id: a.publisherId ?? null, created_at: utcnow(),
  };
}

async function insertAsset(brandId: string, a: NewAsset): Promise<void> {
  const row = { brand_id: brandId, ...a };
  const cols = Object.keys(row);
  await exec(`INSERT INTO official_assets (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, Object.values(row));
}

function checkBrandBody(body: BrandIn): void {
  const ne = nameError(body.name);
  if (ne) badRequest("name", ne);
  if (Array.from(body.description.trim()).length < 50) badRequest("description", "Add at least 50 characters");
  for (const d of body.domains) {
    const de = domainError(d);
    if (de) badRequest("domains", de);
  }
  if (!body.accounts.length && !body.apps.length) badRequest("assets", "Add at least one official account or app");
  if (body.apps.length && !(body.publisher ?? "").trim()) badRequest("publisher", "Required when apps are listed");
}

/** Write profile fields and official assets. Validation results of unchanged apps are kept. */
async function applyBrand(brand: Brand, body: BrandIn): Promise<void> {
  const name = body.name.trim();
  await exec(
    "UPDATE brands SET name = ?, legal_name = ?, aliases = ?, keywords = ?, domains = ?, description = ?, updated_at = ? WHERE id = ?",
    [
      name,
      (body.legalName ?? "").trim() || null,
      JSON.stringify(body.aliases.map((a) => a.trim()).filter((a) => a && a !== name)),
      JSON.stringify(body.keywords.map((k) => k.trim()).filter(Boolean)),
      JSON.stringify(body.domains.map((d) => d.trim().toLowerCase())),
      body.description.trim(),
      utcnow(),
      brand.id,
    ],
  );
  if (body.publisher) {
    const aliases = JSON.stringify(body.publisherAliases.map((a) => a.trim()).filter(Boolean));
    if (brand.publishers.length) {
      await exec("UPDATE publishers SET name = ?, aliases = ? WHERE id = ?", [body.publisher.trim(), aliases, brand.publishers[0].id]);
    } else {
      await exec("INSERT INTO publishers (brand_id, name, publisher_id, aliases) VALUES (?, ?, '', ?)", [brand.id, body.publisher.trim(), aliases]);
    }
  }

  const previous = new Map(brand.assets.map((a) => [allowKey(a.platform, a.identifier), a]));
  const seen = new Set<string>();
  const assets: NewAsset[] = [];
  const ref = { name };
  for (const a of body.accounts) {
    const asset = socialAsset(ref, a);
    const key = allowKey(asset.platform, asset.identifier);
    if (!seen.has(key)) {
      seen.add(key);
      assets.push(asset);
    }
  }
  for (const a of body.apps) {
    const asset = appAsset(ref, a, body.publisher);
    const key = allowKey(asset.platform, asset.identifier);
    if (seen.has(key)) continue;
    seen.add(key);
    const old = previous.get(key);
    if (old) {
      asset.publisher_id = asset.publisher_id || old.publisherId;
      asset.store_title = old.storeTitle;
      asset.icon_url = old.iconUrl;
      asset.validated_at = old.validatedAt;
      asset.validation_status = old.validationStatus;
      asset.validation_note = old.validationNote;
      asset.publisher = asset.publisher || old.publisher;
    }
    assets.push(asset);
  }
  await exec("DELETE FROM official_assets WHERE brand_id = ?", [brand.id]);
  for (const a of assets) await insertAsset(brand.id, a);
}

async function validateQuietly(brandId: string): Promise<void> {
  const brand = await getBrand(brandId);
  if (brand) await validateBrandAssets(brand);
}

const reload = async (id: string) => brandOut((await getBrand(id))!);

async function putBrand(raw: Body) {
  const body = brandIn(raw);
  checkBrandBody(body);
  const brand = await currentBrand();
  // A different brand name means a different brand: start its monitoring from a clean slate,
  // so detections found for the previous brand never appear under the new one.
  if (brand.name.trim().toLowerCase() !== body.name.trim().toLowerCase()) {
    await exec("DELETE FROM detections WHERE brand_id = ?", [brand.id]);
    await exec("DELETE FROM scans WHERE brand_id = ?", [brand.id]);
    clearImageCache();
  }
  await applyBrand(brand, body);
  await validateQuietly(brand.id);
  return reload(brand.id);
}

async function listBrands() {
  return (await allBrands("is_active DESC, name")).map(brandSummary);
}

/** Register another brand and make it the active one. */
async function createBrand(body: BrandIn) {
  checkBrandBody(body);
  if (await one("SELECT id FROM brands WHERE LOWER(name) = ? AND workspace_id <=> ?", [body.name.trim().toLowerCase(), currentWorkspace()])) {
    badRequest("name", "A brand with this name already exists. Switch to it instead.");
  }
  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "brand";
  const id = `brd_${slug}_${hexId(12)}`; // long enough not to be guessed
  await exec("UPDATE brands SET is_active = 0 WHERE workspace_id <=> ?", [currentWorkspace()]);
  await exec(
    "INSERT INTO brands (id, name, aliases, keywords, domains, description, logo_path, legal_name, is_active, updated_at, workspace_id) VALUES (?, ?, '[]', '[]', '[]', '', NULL, NULL, 1, ?, ?)",
    [id, body.name.trim(), utcnow(), currentWorkspace()],
  );
  await applyBrand((await getBrand(id))!, body);
  await validateQuietly(id);
  return reload(id);
}

/**
 * Register a brand from Quick check suggestions the analyst confirmed. The brand is not made
 * active, so the dashboard stays on the current brand. Its apps are validated on the stores.
 */
async function registerFromSearch(raw: Body) {
  const name = str(raw, "name", { required: true, min: 2, max: 60 })!;
  const apps = list(raw, "apps").map(appIn);
  const publishersIn = list(raw, "publishers").map(String);
  if (!apps.length) badRequest("apps", "Pick at least one official app");
  const titles = unique(apps.map((a) => a.name).filter((n): n is string => !!n)).join(", ");
  let description = (str(raw, "description") ?? "").trim();
  if (Array.from(description).length < 50) {
    description = Array.from(`${name.trim()} official apps registered from Quick check: ${titles}.`).slice(0, 2000).join("");
    if (description.length < 50) description = description.padEnd(50, ".");
  }
  const publishers = unique(publishersIn.map((p) => p.trim()).filter(Boolean));
  const body: BrandIn = {
    name: name.trim(), aliases: [], keywords: [name.trim().toLowerCase()], domains: [], description,
    publisher: publishers[0], publisherAliases: publishers.slice(1), accounts: [], apps,
  };
  const active = await currentBrand();
  const created = await createBrand(body);
  // keep the dashboard on the brand the analyst was working on
  await setActive(active.id);
  return created;
}

/** Make one brand of the current workspace active (one at a time). */
async function setActive(id: string) {
  await exec("UPDATE brands SET is_active = (id = ?) WHERE workspace_id <=> ?", [id, currentWorkspace()]);
}

async function activateBrand(id: string) {
  if (!(await ownBrand(id))) throw new HttpError(404, "Brand not found");
  await setActive(id);
  return reload(id);
}

/** Remove a brand with its profile, detections and scans. Another brand becomes active if needed. */
async function deleteBrand(id: string) {
  const brand = await ownBrand(id);
  if (!brand) throw new HttpError(404, "Brand not found");
  const count = Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM brands WHERE workspace_id <=> ?", [currentWorkspace()]))!.n);
  if (count <= 1) badRequest("brand", "Keep at least one brand");
  await exec("DELETE FROM detections WHERE brand_id = ?", [id]);
  await exec("DELETE FROM scans WHERE brand_id = ?", [id]);
  await exec("DELETE FROM official_assets WHERE brand_id = ?", [id]);
  await exec("DELETE FROM publishers WHERE brand_id = ?", [id]);
  await exec("DELETE FROM brands WHERE id = ?", [id]);
  if (brand.isActive) {
    const next = await one<{ id: string }>("SELECT id FROM brands WHERE workspace_id <=> ? ORDER BY updated_at DESC LIMIT 1", [currentWorkspace()]);
    if (next) await exec("UPDATE brands SET is_active = 1 WHERE id = ?", [next.id]);
  }
  return listBrands();
}

/** Re-check every official app against its live store now. */
async function validateBrand() {
  const brand = await currentBrand();
  const summary = await validateBrandAssets(brand, true);
  return { brand: await reload(brand.id), summary };
}

async function uploadLogo(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    invalid("Field required", ["file"]);
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) invalid("Field required", ["file"]);
  if (!["image/png", "image/jpeg"].includes(file.type)) badRequest("logo", "Use a PNG or JPG file");
  const raw = Buffer.from(await file.arrayBuffer());
  let meta: { width?: number; height?: number };
  try {
    meta = await sharp(raw).metadata();
  } catch {
    badRequest("logo", "This file is not a readable image");
  }
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 64 || h < 64) badRequest("logo", `Image is ${w}×${h} px. Use at least 64×64 px.`);
  const brand = await currentBrand();
  const png = await sharp(raw, { ignoreIcc: true }).toColourspace("srgb").ensureAlpha().png().toBuffer();
  const path = await saveMedia(`brand/${brand.id}.png`, png);
  await exec("UPDATE brands SET logo_path = ?, updated_at = ? WHERE id = ?", [path, utcnow(), brand.id]);
  clearImageCache();
  return reload(brand.id);
}

async function retractAlerts(brandId: string, platform: string, identifier: string): Promise<void> {
  const det = await one<{ id: string; status: string }>(
    "SELECT id, status FROM detections WHERE brand_id = ? AND platform = ? AND identifier = ?",
    [brandId, platform, identifier],
  );
  if (det) {
    await exec("INSERT INTO detection_events (detection_id, at, action, from_status, to_status) VALUES (?, ?, 'allowlisted', ?, 'official')", [det.id, utcnow(), det.status]);
    await exec("UPDATE detections SET status = 'official' WHERE id = ?", [det.id]);
  }
}

const isDuplicate = (e: unknown) => (e as { code?: string }).code === "ER_DUP_ENTRY";

async function addAccount(raw: Body) {
  const brand = await currentBrand();
  const asset = socialAsset(brand, accountIn(raw));
  try {
    await insertAsset(brand.id, asset);
  } catch (e) {
    if (isDuplicate(e)) badRequest("handle", "This account is already in the profile");
    throw e;
  }
  await retractAlerts(brand.id, asset.platform, asset.identifier);
  return reload(brand.id);
}

async function deleteAccount(assetId: number) {
  const brand = await currentBrand();
  const asset = brand.assets.find((a) => a.id === assetId);
  if (!asset) throw new HttpError(404, "Asset not found");
  await exec("DELETE FROM official_assets WHERE id = ?", [assetId]);
  // An asset removed from the allowlist is monitored again.
  await exec("UPDATE detections SET status = 'open' WHERE brand_id = ? AND platform = ? AND identifier = ? AND status = 'official'", [
    brand.id, asset.platform, asset.identifier,
  ]);
  return reload(brand.id);
}

async function addApp(raw: Body) {
  const brand = await currentBrand();
  const asset = appAsset(brand, appIn(raw), brand.publishers[0]?.name ?? null);
  try {
    await insertAsset(brand.id, asset);
  } catch (e) {
    if (isDuplicate(e)) badRequest("packageId", "This app is already in the profile");
    throw e;
  }
  await retractAlerts(brand.id, asset.platform, asset.identifier);
  await validateQuietly(brand.id);
  return reload(brand.id);
}

// ---------- detections ----------

async function listDetections() {
  const brand = await currentBrand();
  const allow = (await brandContext(brand)).allowlist;
  const rows = await q("SELECT * FROM detections WHERE brand_id = ?", [brand.id]);
  const out = rows.filter((d: any) => !allow.has(allowKey(d.platform, d.identifier)) && d.status !== "official").map(detectionOut);
  return out.sort((a, b) => b.breakdown.score - a.breakdown.score);
}

async function getDetection(id: string) {
  const brand = await currentBrand();
  const d: any = await one("SELECT * FROM detections WHERE id = ?", [id]);
  if (!d || d.brand_id !== brand.id) throw new HttpError(404, "Detection not found");
  const allow = (await brandContext(brand)).allowlist;
  const events = await q<any>("SELECT * FROM detection_events WHERE detection_id = ? ORDER BY at, id", [d.id]);
  const asset = await one<{ id: number }>("SELECT id FROM official_assets WHERE brand_id = ? AND platform = ? AND identifier = ?", [brand.id, d.platform, d.identifier]);
  return {
    ...detectionOut(d),
    allowlisted: allow.has(allowKey(d.platform, d.identifier)),
    allowlistAssetId: asset ? Number(asset.id) : null,
    events: events.map((e) => ({ at: iso(e.at), action: e.action, from: e.from_status, to: e.to_status })),
  };
}

async function setStatus(id: string, raw: Body) {
  const status = raw?.status;
  if (!STATUSES.includes(status)) invalid(`Input should be ${STATUSES.map((s) => `'${s}'`).join(", ")}`, ["status"]);
  const brand = await currentBrand();
  const d: any = await one("SELECT * FROM detections WHERE id = ?", [id]);
  if (!d || d.brand_id !== brand.id) throw new HttpError(404, "Detection not found");
  const prev = d.status;
  if (status === "official") {
    // Analyst says it is genuinely ours: add to the allowlist (Gate 1 and 2 skip it from now on).
    const exists = await one("SELECT id FROM official_assets WHERE brand_id = ? AND platform = ? AND identifier = ?", [brand.id, d.platform, d.identifier]);
    if (!exists && d.channel === "social" && SOCIAL_PLATFORMS.includes(d.platform)) {
      await insertAsset(brand.id, {
        kind: "social", platform: d.platform, identifier: d.identifier, handle: d.handle, canonical_id: `${d.platform}:${d.identifier}`,
        display_name: d.display_name, status: "official", verified: 0, publisher: null, publisher_id: null, created_at: utcnow(),
      });
    } else if (!exists && d.channel === "app" && (d.platform === "google_play" || d.platform === "app_store")) {
      await insertAsset(brand.id, {
        kind: "app", platform: d.platform, identifier: d.identifier, handle: d.handle, canonical_id: `${d.platform}:${d.handle}`,
        display_name: d.display_name, status: "official", verified: 0, publisher: d.publisher, publisher_id: d.publisher_id, created_at: utcnow(),
      });
    }
  }
  let penalty = Number(d.feedback_penalty);
  if (status === "false_positive") penalty = FALSE_POSITIVE_PENALTY;
  else if (prev === "false_positive") penalty = 0.0;
  const bd = scoreDetection(d.channel, js(d.signals, {}), !!Number(d.lookalike_domain), d.context_label, penalty);
  await exec("UPDATE detections SET feedback_penalty = ?, score = ?, severity = ?, status = ? WHERE id = ?", [penalty, bd.score, bd.severity, status, id]);
  await exec("INSERT INTO detection_events (detection_id, at, action, from_status, to_status) VALUES (?, ?, 'status', ?, ?)", [id, utcnow(), prev, status]);
  return getDetection(id);
}

async function undoAllowlist(id: string) {
  const brand = await currentBrand();
  const d: any = await one("SELECT * FROM detections WHERE id = ?", [id]);
  if (!d || d.brand_id !== brand.id) throw new HttpError(404, "Detection not found");
  await exec("DELETE FROM official_assets WHERE brand_id = ? AND platform = ? AND identifier = ?", [brand.id, d.platform, d.identifier]);
  await exec("INSERT INTO detection_events (detection_id, at, action, from_status, to_status) VALUES (?, ?, 'status', ?, 'open')", [id, utcnow(), d.status]);
  await exec("UPDATE detections SET status = 'open' WHERE id = ?", [id]);
  return getDetection(id);
}

// ---------- quick check ----------

async function quickCheck(raw: Body) {
  const value = str(raw, "value", { required: true, min: 1, max: 300 })!;
  const brand = await currentBrand();
  const input = value.trim();
  const parts = input.replace(/^@/, "").split("/").filter(Boolean);
  const handle = (parts.length ? parts[parts.length - 1] : input).split("?")[0].toLowerCase();
  const official = brand.assets.find((a) => a.identifier === handle);
  return {
    result: analyseName(input, [brand.name, ...brand.aliases]),
    official: official ? { platform: official.platform, handle: official.handle, status: official.status } : null,
  };
}

async function search(raw: Body) {
  const query = str(raw, "query", { required: true, min: 2, max: 300 })!;
  const platforms = raw?.platforms === undefined ? ["all"] : list(raw, "platforms").map(String);
  const unknown = platforms.filter((p) => p !== "all" && !PLATFORMS.includes(p));
  if (unknown.length) badRequest("platforms", `Unknown platform: ${unknown.join(", ")}`);
  return runSearch(query, platforms);
}

// ---------- sources and scans ----------

async function listSources() {
  return (await q("SELECT * FROM sources ORDER BY channel, id")).map(sourceOut);
}

async function patchSource(id: string, raw: Body) {
  if (typeof raw?.simulateOutage !== "boolean") invalid("Input should be a valid boolean", ["simulateOutage"]);
  if (!(await one("SELECT id FROM sources WHERE id = ?", [id]))) throw new HttpError(404, "Source not found");
  if (raw.simulateOutage) {
    await exec("UPDATE sources SET simulate_outage = 1, health = 'unavailable', note = ? WHERE id = ?", [
      "Simulated outage. The scan continues with other sources; showing the last good results.", id,
    ]);
  } else {
    await exec("UPDATE sources SET simulate_outage = 0, health = 'operational', note = ? WHERE id = ?", ["Restored. Results refresh on the next scan.", id]);
  }
  return sourceOut(await one("SELECT * FROM sources WHERE id = ?", [id]));
}

async function createScan() {
  const brand = await currentBrand();
  if (isScanning(brand.id)) throw new HttpError(409, "A scan is already running");
  const id = await startScan(brand.id);
  return scanOut(await one("SELECT * FROM scans WHERE id = ?", [id]));
}

async function latestScan() {
  const brand = await currentBrand();
  const running = await one("SELECT * FROM scans WHERE brand_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1", [brand.id]);
  const done = await one("SELECT * FROM scans WHERE brand_id = ? AND status <> 'running' ORDER BY started_at DESC LIMIT 1", [brand.id]);
  const total = Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM scans WHERE brand_id = ?", [brand.id]))!.n);
  return { running: running && isScanning(brand.id) ? scanOut(running) : null, last: scanOut(done), total };
}

async function getScan(id: string) {
  // Only scans of the current workspace's brands.
  const s = await one(
    "SELECT s.* FROM scans s JOIN brands b ON b.id = s.brand_id WHERE s.id = ? AND b.workspace_id <=> ?",
    [id, currentWorkspace()],
  );
  if (!s) throw new HttpError(404, "Scan not found");
  return scanOut(s);
}

async function health() {
  const row = await one<{ v: string }>("SELECT VERSION() AS v");
  return { status: "ok", database: settings.mysqlDb, mysql: row?.v };
}

// ---------- routing ----------

type Handler = (m: string[], req: Request) => Promise<unknown>;
const body = async (req: Request): Promise<Body> => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

const ROUTES: [string, RegExp, Handler, number?][] = [
  ["GET", /^health$/, () => health()],
  ["GET", /^brand$/, async () => brandOut(await currentBrand())],
  ["PUT", /^brand$/, async (_, r) => putBrand(await body(r))],
  ["GET", /^brands$/, () => listBrands()],
  ["POST", /^brands$/, async (_, r) => createBrand(brandIn(await body(r))), 201],
  ["POST", /^brands\/from-search$/, async (_, r) => registerFromSearch(await body(r)), 201],
  ["POST", /^brands\/([^/]+)\/activate$/, ([id]) => activateBrand(id)],
  ["DELETE", /^brands\/([^/]+)$/, ([id]) => deleteBrand(id)],
  ["POST", /^brand\/validate$/, () => validateBrand()],
  ["POST", /^brand\/logo$/, (_, r) => uploadLogo(r)],
  ["POST", /^brand\/accounts$/, async (_, r) => addAccount(await body(r)), 201],
  ["DELETE", /^brand\/accounts\/(\d+)$/, ([id]) => deleteAccount(Number(id))],
  ["POST", /^brand\/apps$/, async (_, r) => addApp(await body(r)), 201],
  ["GET", /^detections$/, () => listDetections()],
  ["GET", /^detections\/([^/]+)$/, ([id]) => getDetection(id)],
  ["PATCH", /^detections\/([^/]+)$/, async ([id], r) => setStatus(id, await body(r))],
  ["DELETE", /^detections\/([^/]+)\/allowlist$/, ([id]) => undoAllowlist(id)],
  ["POST", /^check$/, async (_, r) => quickCheck(await body(r))],
  ["POST", /^search$/, async (_, r) => search(await body(r))],
  ["GET", /^sources$/, () => listSources()],
  ["PATCH", /^sources\/([^/]+)$/, async ([id], r) => patchSource(id, await body(r))],
  ["POST", /^scans$/, () => createScan(), 202],
  ["GET", /^scans\/latest$/, () => latestScan()],
  ["GET", /^scans\/([^/]+)$/, ([id]) => getScan(id)],
  ["GET", /^accuracy$/, () => runEvaluation()],
];

// ---------- demo password for actions that change data ----------

/**
 * Writes anyone may make: searching, Quick check, running a scan and switching the
 * active brand change no profile or verdict, so visitors can still explore the demo.
 */
const OPEN_WRITES = [/^search$/, /^check$/, /^scans$/, /^brands\/[^/]+\/activate$/];

function keyMatches(given: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(settings.adminPassword).digest();
  return timingSafeEqual(a, b);
}

function authorised(method: string, path: string, req: Request): boolean {
  if (!settings.adminPassword || method === "GET") return true;
  if (OPEN_WRITES.some((p) => p.test(path))) return true;
  return keyMatches(req.headers.get("x-admin-key") ?? "");
}

const LOCKED = { detail: { field: "auth", message: "This action needs the admin password." } };

/** Routes that read or write no workspace data. */
const SHARED = new Set(["health", "auth", "accuracy"]);

/**
 * Dispatch one /api request in the caller's workspace. `path` is the part after /api/.
 * Without `ws` (scripts) only data that belongs to no workspace is visible.
 */
export async function handle(method: string, path: string, req: Request, ws?: string): Promise<{ status: number; body: unknown }> {
  if (!ws || SHARED.has(path)) return dispatch(method, path, req);
  return inWorkspace(ws, async () => {
    try {
      await ensureWorkspace(ws);
    } catch (e) {
      console.error("workspace setup failed", e);
      return { status: 503, body: { detail: "Could not prepare your workspace. Try again." } };
    }
    return dispatch(method, path, req);
  });
}

async function dispatch(method: string, path: string, req: Request): Promise<{ status: number; body: unknown }> {
  if (path === "auth") {
    if (method === "GET") return { status: 200, body: { required: !!settings.adminPassword } };
    if (method === "POST") {
      const ok = !settings.adminPassword || keyMatches(req.headers.get("x-admin-key") ?? "");
      return ok ? { status: 200, body: { ok: true } } : { status: 401, body: { detail: { field: "auth", message: "Wrong password." } } };
    }
  }
  if (!authorised(method, path, req)) return { status: 401, body: LOCKED };
  for (const [m, pattern, fn, ok] of ROUTES) {
    if (m !== method) continue;
    const match = path.match(pattern);
    if (!match) continue;
    try {
      return { status: ok ?? 200, body: await fn(match.slice(1).map(decodeURIComponent), req) };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { detail: e.detail } };
      console.error(`${method} /api/${path} failed`, e);
      return { status: 500, body: { detail: "Internal Server Error" } };
    }
  }
  const known = ROUTES.some(([, p]) => p.test(path));
  return known ? { status: 405, body: { detail: "Method Not Allowed" } } : { status: 404, body: { detail: "Not Found" } };
}
