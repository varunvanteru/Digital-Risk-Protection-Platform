/** First-run data: the source registry and the demo brand profiles. Port of backend/app/seed.py. */

import fs from "node:fs";
import path from "node:path";
import { settings } from "./config";
import { exec, one, q } from "./db";
import { ensureBrandLogo } from "./demoAssets";
import { mediaExists, saveMedia } from "./media";
import { LIVE_SOURCES, notConnectedReason } from "./services/scan";
import { playIconPng } from "./services/validation";
import { utcnow, withTimeout } from "./util";

// Live mode: every source searches the real platform (or is not connected). No sample data.
const LIVE_SOURCE_ROWS: [string, string, string, string][] = [
  // id, name, platform, channel
  ["src_play", "Google Play", "google_play", "app"],
  ["src_appstore", "Apple App Store", "app_store", "app"],
  ["src_ig", "Instagram", "instagram", "social"],
  ["src_x", "X", "x", "social"],
  ["src_fb", "Facebook", "facebook", "social"],
  ["src_tg", "Telegram", "telegram", "social"],
  ["src_wa", "WhatsApp Channels", "whatsapp", "social"],
  ["src_threads", "Threads", "threads", "social"],
  ["src_li", "LinkedIn", "linkedin", "social"],
  ["src_snap", "Snapchat", "snapchat", "social"],
  ["src_yt", "YouTube", "youtube", "social"],
  ["src_sc", "ShareChat", "sharechat", "social"],
  ["src_moj", "Moj", "moj", "social"],
  ["src_josh", "Josh", "josh", "social"],
  ["src_pin", "Pinterest", "pinterest", "social"],
  ["src_quora", "Quora", "quora", "social"],
  ["src_discord", "Discord", "discord", "social"],
];

// Fixture mode (automated tests only): the original registry, with the curated datasets.
const SOURCES: [string, string, string, string, string][] = [
  // id, name, platform, channel, mode
  ["src_play", "Google Play", "google_play", "app", "live"],
  ["src_appstore", "Apple App Store", "app_store", "app", "live"],
  ["src_store_demo", "Store snapshot (simulated)", "google_play", "app", "dataset"],
  ["src_apk", "APK mirror sites", "apk_site", "app", "dataset"],
  ["src_ig", "Instagram", "instagram", "social", "dataset"],
  ["src_x", "X", "x", "social", "dataset"],
  ["src_fb", "Facebook Pages", "facebook", "social", "dataset"],
  ["src_tg", "Telegram", "telegram", "social", "dataset"],
  ["src_wa", "WhatsApp Channels", "whatsapp", "social", "dataset"],
  ["src_threads", "Threads", "threads", "social", "dataset"],
  ["src_li", "LinkedIn", "linkedin", "social", "dataset"],
  ["src_snap", "Snapchat", "snapchat", "social", "dataset"],
  ["src_yt", "YouTube", "youtube", "social", "dataset"],
  ["src_sc", "ShareChat", "sharechat", "social", "dataset"],
  ["src_moj", "Moj", "moj", "social", "dataset"],
  ["src_josh", "Josh", "josh", "social", "dataset"],
  ["src_pin", "Pinterest", "pinterest", "social", "dataset"],
  ["src_quora", "Quora", "quora", "social", "dataset"],
  ["src_discord", "Discord", "discord", "social", "dataset"],
];

/** Short, stable suffix that keeps each workspace's demo brand IDs unique. */
const suffix = (ws: string) => ws.replace(/-/g, "").slice(0, 16);
const testBrandId = (ws: string) => `brd_test_${suffix(ws)}`;
const phonepeId = (ws: string) => `brd_phonepe_${suffix(ws)}`;

type AssetSeed = {
  kind: "social" | "app"; platform: string; handle: string; canonicalId: string; displayName: string; status: string;
  verified: boolean; publisher?: string; publisherId?: string;
};

async function insertAsset(brandId: string, a: AssetSeed, now: string) {
  await exec(
    `INSERT INTO official_assets (brand_id, kind, platform, identifier, handle, canonical_id, display_name, status, verified,
     publisher, publisher_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [brandId, a.kind, a.platform, a.handle.toLowerCase(), a.handle, a.canonicalId, a.displayName, a.status, a.verified ? 1 : 0,
      a.publisher ?? null, a.publisherId ?? null, now],
  );
}

/** The source registry, shared by every workspace. */
export async function seed(): Promise<void> {
  await removeReddit();
  if (settings.dataMode === "live") return seedLive();
  for (const [sid, name, platform, channel, mode] of SOURCES) {
    await exec(
      `INSERT INTO sources (id, name, platform, channel, mode, health, items_last_scan, simulate_outage)
       VALUES (?, ?, ?, ?, ?, 'operational', 0, 0) ON DUPLICATE KEY UPDATE name = VALUES(name), mode = VALUES(mode)`,
      [sid, name, platform, channel, mode],
    );
  }
}

async function seedLive(): Promise<void> {
  for (const [sid, name, platform, channel] of LIVE_SOURCE_ROWS) {
    const mode = LIVE_SOURCES.has(sid) ? "live" : "off";
    await exec(
      `INSERT INTO sources (id, name, platform, channel, mode, health, items_last_scan, simulate_outage)
       VALUES (?, ?, ?, ?, ?, 'operational', 0, 0) ON DUPLICATE KEY UPDATE name = VALUES(name), mode = VALUES(mode)`,
      [sid, name, platform, channel, mode],
    );
    // A source without its API key (or with no public API at all) is shown as not connected
    // until a scan can actually reach it; once its key is set the next scan reports live health.
    const reason = notConnectedReason(sid);
    if (reason) {
      await exec("UPDATE sources SET health = 'not_connected', state = 'not_connected', note = ?, latency_ms = NULL, items_last_scan = 0 WHERE id = ?", [reason, sid]);
    } else {
      await exec("UPDATE sources SET health = 'operational', state = NULL, note = NULL WHERE id = ? AND (state = 'not_connected' OR state = 'simulated')", [sid]);
    }
  }
  await removeSampleData();
  await updateDemoBrands();
  await removeTestImages();
  await cleanStart();
  await syncOfficialAccounts();
}

/**
 * One-time clean start for judging: every tab starts empty. All detections, their history, scans,
 * cached search results and source statistics are cleared, and every brand except the demo brands
 * (PhonePe, SBI, Airtel) is removed. Their profiles and user accounts are kept, and PhonePe becomes the
 * active brand wherever another brand was. Runs once (app_meta records it).
 */
const CLEAN_START = "2026-10-24";
async function cleanStart(): Promise<void> {
  if ((await one<{ v: string }>("SELECT v FROM app_meta WHERE k = 'clean_start'"))?.v === CLEAN_START) return;
  await exec("DELETE FROM brands WHERE id NOT LIKE 'brd\\_phonepe\\_%' AND id NOT LIKE 'brd\\_sbi\\_%' AND id NOT LIKE 'brd\\_airtel\\_%'");
  await exec("DELETE FROM detections");
  await exec("DELETE FROM scans");
  await exec("DELETE FROM source_cache");
  await exec("UPDATE sources SET last_success = NULL, latency_ms = NULL, items_last_scan = 0, simulate_outage = 0, note = NULL, state = NULL, health = 'operational' WHERE state IS NULL OR state <> 'not_connected'");
  await exec(
    `UPDATE brands b SET is_active = 1 WHERE b.id LIKE 'brd\\_phonepe\\_%'
     AND NOT EXISTS (SELECT 1 FROM (SELECT workspace_id FROM brands WHERE is_active = 1) a WHERE a.workspace_id <=> b.workspace_id)`,
  );
  await exec("INSERT INTO app_meta (k, v) VALUES ('clean_start', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [CLEAN_START]);
}

/**
 * Images left in the database by the old demo brands and sample data: the fictional brand's logos
 * and the sample avatars. Live data never stores either, so this only clears old rows.
 */
async function removeTestImages(): Promise<void> {
  await exec("DELETE FROM media_files WHERE path LIKE 'dataset/%' OR path LIKE 'brand/brd\\_zentrapay\\_%' OR path = 'brand/demo-logo.png'");
}

/** Reddit is no longer a supported platform: drop its source row, cached results and anything recorded for it. */
async function removeReddit(): Promise<void> {
  await exec("DELETE FROM sources WHERE id = 'src_reddit'");
  await exec("DELETE FROM source_cache WHERE source_id = 'src_reddit'");
  await exec("DELETE FROM detections WHERE platform = 'reddit'");
  await exec("DELETE FROM official_assets WHERE platform = 'reddit'");
}

/** Official accounts added to the list later reach every workspace's copy of the real demo brands. */
async function syncOfficialAccounts(): Promise<void> {
  const now = utcnow();
  for (const b of REAL_BRANDS) {
    for (const [platform, handle] of b.socials) {
      await exec(
        `INSERT IGNORE INTO official_assets (brand_id, kind, platform, identifier, handle, canonical_id, display_name, status, verified, created_at)
         SELECT id, 'social', ?, ?, ?, ?, ?, 'official', 1, ? FROM brands WHERE id LIKE ?`,
        [platform, handle.toLowerCase(), handle, `${platform}:${handle}`, b.name, now, `brd\\_${b.key}\\_%`],
      );
    }
  }
}

/**
 * One-time cleanup when a database that held the sample data switches to live data: the sample-only
 * sources, every result they produced, and the fictional demo brand go; each workspace gets the real
 * demo brands instead. Runs once (app_meta records it); a brand a visitor added is never touched.
 */
async function removeSampleData(): Promise<void> {
  if ((await one<{ v: string }>("SELECT v FROM app_meta WHERE k = 'data_mode'"))?.v === "live") return;
  const live = [...LIVE_SOURCES];
  const marks = live.map(() => "?").join(",");
  await exec("DELETE FROM sources WHERE id IN ('src_store_demo', 'src_apk')");
  // Sample results; live store results of the old registry stay.
  await exec(`DELETE FROM detections WHERE source_id NOT IN ('src_play', 'src_appstore')`);
  await exec(`DELETE FROM source_cache WHERE source_id NOT IN (${marks})`, live);
  const workspaces = await q<{ ws: string }>("SELECT DISTINCT workspace_id AS ws FROM brands WHERE id LIKE 'brd\\_zentrapay\\_%' AND workspace_id IS NOT NULL");
  await exec("DELETE FROM brands WHERE id LIKE 'brd\\_zentrapay\\_%'");
  for (const { ws } of workspaces) await addRealDemoBrands(ws);
  await exec("INSERT INTO app_meta (k, v) VALUES ('data_mode', 'live') ON DUPLICATE KEY UPDATE v = VALUES(v)");
}

/**
 * A new workspace starts with its own copy of the demo brand (PhonePe), so every visitor sees a
 * working demo and nothing another visitor added. Returns the active brand's ID.
 * Fixture mode (automated tests) uses the fictional test brand of tests/fixtures/test_brand.json.
 */
export async function seedWorkspace(ws: string): Promise<string> {
  if (settings.dataMode === "live") {
    await addRealDemoBrands(ws);
    return phonepeId(ws);
  }
  const id = await addTestBrand(ws);
  await seedPhonepeDemo(ws);
  return id;
}

/** The automated tests' fictional brand (fixture mode only), read from tests/fixtures/test_brand.json. */
async function addTestBrand(ws: string): Promise<string> {
  const id = testBrandId(ws);
  if (await one("SELECT id FROM brands WHERE id = ?", [id])) return id;
  const b = JSON.parse(fs.readFileSync(path.join(settings.fixturesDir, "test_brand.json"), "utf8"));
  const now = utcnow();
  await exec(
    `INSERT INTO brands (id, name, aliases, keywords, domains, description, logo_path, legal_name, is_active, updated_at, workspace_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
    [id, b.name, JSON.stringify(b.aliases), JSON.stringify(b.keywords), JSON.stringify(b.domains), b.description, await ensureBrandLogo(id), now, ws],
  );
  await exec("INSERT INTO publishers (brand_id, name, publisher_id, aliases) VALUES (?, ?, ?, '[]')", [id, b.publisher.name, b.publisher.id]);
  for (const [platform, handle, canonicalId, displayName, status, verified] of b.socials as [string, string, string, string, string, boolean][]) {
    await insertAsset(id, { kind: "social", platform, handle, canonicalId, displayName, status, verified }, now);
  }
  for (const [platform, pkg, name, pid] of b.apps as [string, string, string, string][]) {
    await insertAsset(id, {
      kind: "app", platform, handle: pkg, canonicalId: `${platform}:${pkg}`, displayName: name, status: "official",
      verified: true, publisher: b.publisher.name, publisherId: pid,
    }, now);
  }
  return id;
}

// ---------- live mode: real brands only ----------

interface RealBrand {
  key: string;
  name: string;
  aliases: string[];
  keywords: string[];
  domains: string[];
  legalName: string;
  description: string;
  publisher: string;
  publisherAliases: string[];
  apps: [platform: string, appId: string, title: string][];
  // Official accounts as listed in the footer of the brand's own website (phonepe.com, onlinesbi.sbi, airtel.in).
  socials: [platform: string, handle: string][];
}

const REAL_BRANDS: RealBrand[] = [
  {
    key: "phonepe",
    name: "PhonePe",
    aliases: ["Phone Pe"],
    keywords: ["phonepe"],
    domains: ["phonepe.com"],
    legalName: "PhonePe Private Limited",
    description:
      "PhonePe is a digital payments app for UPI money transfers, bill payments, mobile recharges, " +
      "insurance and investments. PhonePe never asks for your UPI PIN or OTP.",
    publisher: "PhonePe Private Limited",
    publisherAliases: ["PhonePe"],
    apps: [
      ["google_play", "com.phonepe.app", "PhonePe"],
      ["app_store", "id1170055821", "PhonePe"],
    ],
    socials: [
      ["instagram", "phonepe"],
      ["x", "PhonePe"],
      ["facebook", "OfficialPhonePe"],
      ["linkedin", "phonepe-internet"],
      ["youtube", "PhonePe_"],
      ["youtube", "UCe0domeQWPT2ZeIQDJg9XkA"],
    ],
  },
  {
    // Apps checked on Google Play and the App Store (publisher State Bank of India); accounts from the
    // footer of onlinesbi.sbi; YouTube resolved with the YouTube Data API.
    key: "sbi",
    name: "SBI",
    aliases: ["State Bank of India", "State Bank", "YONO SBI"],
    keywords: ["sbi", "yono sbi"],
    domains: ["sbi.co.in", "onlinesbi.sbi"],
    legalName: "State Bank of India",
    description:
      "State Bank of India (SBI) is India's largest bank. YONO SBI offers mobile banking, UPI payments, " +
      "loans, deposits and investments. SBI never asks for your OTP, PIN, CVV or password.",
    publisher: "State Bank of India",
    publisherAliases: ["SBI"],
    apps: [
      ["google_play", "com.sbi.lotusintouch", "YONO SBI"],
      ["app_store", "id1231393474", "YONO SBI"],
    ],
    socials: [
      ["instagram", "theofficialsbi"],
      ["x", "TheOfficialSBI"],
      ["facebook", "StateBankofIndia"],
      ["linkedin", "state-bank-of-india"],
      ["youtube", "theofficialsbi"],
      ["youtube", "UCGYygfy61VHLjdxahKlGPkw"],
    ],
  },
  {
    // Apps checked on Google Play (developer Airtel) and the App Store (seller Bharti Airtel Limited);
    // accounts from the footer of airtel.in; YouTube resolved with the YouTube Data API.
    key: "airtel",
    name: "Airtel",
    aliases: ["Bharti Airtel", "Airtel Thanks"],
    keywords: ["airtel"],
    domains: ["airtel.in", "airtel.com"],
    legalName: "Bharti Airtel Limited",
    description:
      "Airtel is an Indian telecom provider: mobile recharges, postpaid, broadband, DTH, Airtel Payments Bank " +
      "and the Airtel Thanks app. Airtel never asks for your OTP, PIN or password.",
    publisher: "Bharti Airtel Limited",
    publisherAliases: ["Airtel", "Bharti Airtel"],
    apps: [
      ["google_play", "com.myairtelapp", "Airtel Thanks"],
      ["app_store", "id543184334", "Airtel Thanks"],
    ],
    socials: [
      ["instagram", "airtelindia"],
      ["x", "airtelindia"],
      ["facebook", "AirtelIndia"],
      ["linkedin", "airtel"],
      ["youtube", "airtel"],
      ["youtube", "UCY-gUWSJX6xcrEqH4LExALQ"],
      ["youtube", "airtelcares"],
      ["youtube", "UCKuPTRtaBKYgPANBVANz2Iw"],
    ],
  },
];

const realBrandId = (key: string, ws: string) => `brd_${key}_${suffix(ws)}`;

const g = globalThis as unknown as { __bsDemoLogo?: Map<string, Promise<string | null>> };

/**
 * A real demo brand's logo: its official Play app's icon, fetched once and stored as one shared
 * image, so a new workspace shows the logo at once instead of after its first scan.
 * Null (the first scan's store check then sets it) when the store cannot be reached.
 */
function demoLogo(key: string, playApp: string): Promise<string | null> {
  const memo = (g.__bsDemoLogo ??= new Map());
  let p = memo.get(key);
  if (!p) {
    const rel = `brand/demo-${key}.png`;
    p = (async (): Promise<string | null> => {
      if (await mediaExists(rel)) return `/media/${rel}`;
      if (!settings.validateAssets) return null; // offline tests
      const png = await withTimeout(playIconPng(playApp), 10_000, "logo").catch(() => null);
      return png ? saveMedia(rel, png) : null;
    })();
    p.then((v: string | null) => v ?? memo.delete(key)); // a failed fetch is tried again next time
    memo.set(key, p);
  }
  return p;
}

/** Give a workspace its demo brands, PhonePe (active), SBI and Airtel, with their official apps and accounts. */
export async function addRealDemoBrands(ws: string): Promise<void> {
  const now = utcnow();
  for (const b of REAL_BRANDS) {
    const id = realBrandId(b.key, ws);
    const playApp = b.apps.find(([platform]) => platform === "google_play")?.[1];
    const logo = playApp ? await demoLogo(b.key, playApp) : null;
    if (!(await one("SELECT id FROM brands WHERE id = ?", [id]))) {
      await exec(
        `INSERT INTO brands (id, name, aliases, keywords, domains, description, logo_path, legal_name, is_active, updated_at, workspace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [id, b.name, JSON.stringify(b.aliases), JSON.stringify(b.keywords), JSON.stringify(b.domains), b.description, logo, b.legalName, now, ws],
      );
      await exec("INSERT INTO publishers (brand_id, name, publisher_id, aliases) VALUES (?, ?, '', ?)", [id, b.publisher, JSON.stringify(b.publisherAliases)]);
      for (const [platform, appId, title] of b.apps) {
        await insertAsset(id, {
          kind: "app", platform, handle: appId, canonicalId: `${platform}:${appId}`, displayName: title, status: "official",
          verified: true, publisher: b.publisher,
        }, now);
      }
    } else if (logo) {
      await exec("UPDATE brands SET logo_path = ? WHERE id = ? AND logo_path IS NULL", [logo, id]);
    }
    // Official accounts (also added to a PhonePe demo profile created before live data).
    for (const [platform, handle] of b.socials) {
      await exec(
        `INSERT IGNORE INTO official_assets (brand_id, kind, platform, identifier, handle, canonical_id, display_name, status, verified, created_at)
         VALUES (?, 'social', ?, ?, ?, ?, ?, 'official', 1, ?)`,
        [id, platform, handle.toLowerCase(), handle, `${platform}:${handle}`, b.name, now],
      );
    }
  }
  if (!(await one("SELECT id FROM brands WHERE workspace_id = ? AND is_active = 1", [ws]))) {
    await exec("UPDATE brands SET is_active = 1 WHERE id = ?", [realBrandId("phonepe", ws)]);
  }
}

/**
 * One-time update of existing workspaces to the current demo brands, PhonePe, SBI and Airtel: the old
 * Paytm and fictional-brand demo copies go (only the copies this app added, matched by their exact IDs),
 * SBI and Airtel are added, and PhonePe becomes active where no brand is. Brands a visitor registered
 * are never touched.
 */
const DEMO_BRANDS = "phonepe+sbi+airtel";
async function updateDemoBrands(): Promise<void> {
  if ((await one<{ v: string }>("SELECT v FROM app_meta WHERE k = 'demo_brands'"))?.v === DEMO_BRANDS) return;
  for (const key of ["paytm", "zentrapay"]) {
    await exec(
      `DELETE FROM brands WHERE id LIKE 'brd\\_${key}\\_%' AND workspace_id IS NOT NULL AND id = CONCAT('brd_${key}_', LEFT(REPLACE(workspace_id, '-', ''), 16))`,
    );
  }
  const workspaces = await q<{ ws: string }>("SELECT DISTINCT workspace_id AS ws FROM brands WHERE id LIKE 'brd\\_phonepe\\_%' AND workspace_id IS NOT NULL");
  for (const { ws } of workspaces) await addRealDemoBrands(ws);
  await exec("INSERT INTO app_meta (k, v) VALUES ('demo_brands', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [DEMO_BRANDS]);
}

/**
 * A real-brand demo profile, entered the way a customer would: the main app on each
 * store and the publisher name, nothing else. Variants (business, investing apps)
 * are NOT listed; the engine must find them through store validation.
 */
async function seedPhonepeDemo(ws: string): Promise<void> {
  const id = phonepeId(ws);
  const now = utcnow();
  await exec(
    `INSERT INTO brands (id, name, aliases, keywords, domains, description, logo_path, legal_name, is_active, updated_at, workspace_id)
     VALUES (?, 'PhonePe', ?, ?, ?, ?, NULL, 'PhonePe Private Limited', 0, ?, ?)`,
    [
      id,
      JSON.stringify(["Phone Pe"]),
      JSON.stringify(["phonepe"]),
      JSON.stringify(["phonepe.com"]),
      "PhonePe is a digital payments app for UPI money transfers, bill payments, mobile recharges, " +
        "insurance and investments. PhonePe never asks for your UPI PIN or OTP.",
      now,
      ws,
    ],
  );
  await exec("INSERT INTO publishers (brand_id, name, publisher_id, aliases) VALUES (?, 'PhonePe Private Limited', '', ?)", [id, JSON.stringify(["PhonePe"])]);
  for (const [platform, appId] of [["google_play", "com.phonepe.app"], ["app_store", "id1170055821"]]) {
    await insertAsset(id, {
      kind: "app", platform, handle: appId, canonicalId: `${platform}:${appId}`, displayName: "PhonePe", status: "official",
      verified: true, publisher: "PhonePe Private Limited",
    }, now);
  }
}
