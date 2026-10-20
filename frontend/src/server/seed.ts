/** First-run data: the source registry and the demo brand profiles. Port of backend/app/seed.py. */

import { settings } from "./config";
import { exec, one, q } from "./db";
import { ensureBrandLogo } from "./demoAssets";
import { LIVE_SOURCES, notConnectedReason } from "./services/scan";
import { utcnow } from "./util";

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
  ["src_reddit", "Reddit", "reddit", "social"],
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
  ["src_reddit", "Reddit", "reddit", "social", "dataset"],
  ["src_quora", "Quora", "quora", "social", "dataset"],
  ["src_discord", "Discord", "discord", "social", "dataset"],
];

/** Short, stable suffix that keeps each workspace's demo brand IDs unique. */
const suffix = (ws: string) => ws.replace(/-/g, "").slice(0, 16);
export const demoBrandId = (ws: string) => `brd_zentrapay_${suffix(ws)}`;
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
  await syncOfficialAccounts();
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
 * A new workspace starts with its own copy of the demo brands, so every visitor sees a
 * working demo and nothing another visitor added. Returns the active brand's ID.
 */
export async function seedWorkspace(ws: string): Promise<string> {
  if (settings.dataMode === "live") {
    await addRealDemoBrands(ws);
    return phonepeId(ws);
  }
  const id = await addZentraPay(ws, true);
  await seedPhonepeDemo(ws);
  return id;
}

/** The fictional demo brand ZentraPay, with its official accounts and apps. Skipped if the workspace has it. */
async function addZentraPay(ws: string, active: boolean): Promise<string> {
  const id = demoBrandId(ws);
  if (await one("SELECT id FROM brands WHERE id = ?", [id])) return id;
  const now = utcnow();
  await exec(
    `INSERT INTO brands (id, name, aliases, keywords, domains, description, logo_path, legal_name, is_active, updated_at, workspace_id)
     VALUES (?, 'ZentraPay', ?, ?, ?, ?, ?, NULL, ${active ? 1 : 0}, ?, ?)`,
    [
      id,
      JSON.stringify(["Zentra", "Zentra Pay"]),
      JSON.stringify(["zentra", "zpay"]),
      JSON.stringify(["zentrapay.com", "zentrapay.in"]),
      "ZentraPay lets you pay bills, send money over UPI and manage cards in one secure app. " +
        "Trusted by over 2 crore Indians. ZentraPay will never ask for your OTP, PIN or password.",
      await ensureBrandLogo(id),
      now,
      ws,
    ],
  );
  await exec("INSERT INTO publishers (brand_id, name, publisher_id, aliases) VALUES (?, 'ZentraPay Technologies Pvt Ltd', '8174492036215501734', '[]')", [id]);
  const social: [string, string, string, string, string, boolean][] = [
    ["instagram", "zentrapay", "ig:48213377102", "ZentraPay", "official", true],
    ["x", "ZentraPay", "x:1452208813", "ZentraPay", "official", true],
    ["facebook", "zentrapay", "fb:102938475610", "ZentraPay", "official", true],
    ["telegram", "zentrapay_official", "tg:-1001788234", "ZentraPay Updates", "official", false],
    ["instagram", "zentrapay_partner_mumbai", "ig:59011283377", "ZentraPay Partner, Mumbai", "partner", false],
    ["youtube", "zentrapay", "yt:UCzentrapay", "ZentraPay", "official", true],
    ["linkedin", "zentrapay", "li:zentrapay", "ZentraPay", "official", true],
    ["whatsapp", "0029VaZentraPay01", "wa:0029VaZentraPay01", "ZentraPay", "official", true],
  ];
  for (const [platform, handle, canonicalId, displayName, status, verified] of social) {
    await insertAsset(id, { kind: "social", platform, handle, canonicalId, displayName, status, verified }, now);
  }
  const apps: [string, string, string, string][] = [
    ["google_play", "com.zentrapay.app", "ZentraPay: UPI, Bills & Cards", "8174492036215501734"],
    ["app_store", "id1234567890", "ZentraPay", "1588120034"],
  ];
  for (const [platform, pkg, name, pid] of apps) {
    await insertAsset(id, {
      kind: "app", platform, handle: pkg, canonicalId: `${platform}:${pkg}`, displayName: name, status: "official",
      verified: true, publisher: "ZentraPay Technologies Pvt Ltd", publisherId: pid,
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
  // Official accounts as listed in the footer of the brand's own website (phonepe.com, paytm.com).
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
];

const realBrandId = (key: string, ws: string) => `brd_${key}_${suffix(ws)}`;

/** Give a workspace its two demo brands: PhonePe (real, active) and ZentraPay (fictional), with their official apps and accounts. */
export async function addRealDemoBrands(ws: string): Promise<void> {
  const now = utcnow();
  for (const b of REAL_BRANDS) {
    const id = realBrandId(b.key, ws);
    if (!(await one("SELECT id FROM brands WHERE id = ?", [id]))) {
      await exec(
        `INSERT INTO brands (id, name, aliases, keywords, domains, description, logo_path, legal_name, is_active, updated_at, workspace_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)`,
        [id, b.name, JSON.stringify(b.aliases), JSON.stringify(b.keywords), JSON.stringify(b.domains), b.description, b.legalName, now, ws],
      );
      await exec("INSERT INTO publishers (brand_id, name, publisher_id, aliases) VALUES (?, ?, '', ?)", [id, b.publisher, JSON.stringify(b.publisherAliases)]);
      for (const [platform, appId, title] of b.apps) {
        await insertAsset(id, {
          kind: "app", platform, handle: appId, canonicalId: `${platform}:${appId}`, displayName: title, status: "official",
          verified: true, publisher: b.publisher,
        }, now);
      }
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
  await addZentraPay(ws, false);
  if (!(await one("SELECT id FROM brands WHERE workspace_id = ? AND is_active = 1", [ws]))) {
    await exec("UPDATE brands SET is_active = 1 WHERE id = ?", [realBrandId("phonepe", ws)]);
  }
}

/**
 * One-time update of existing workspaces to the current demo brands: the Paytm demo copy goes
 * (only the copy this app added, matched by its exact ID) and ZentraPay is added. Brands a visitor
 * registered are never touched.
 */
async function updateDemoBrands(): Promise<void> {
  if ((await one<{ v: string }>("SELECT v FROM app_meta WHERE k = 'demo_brands'"))?.v === "phonepe+zentrapay") return;
  await exec(
    "DELETE FROM brands WHERE id LIKE 'brd\\_paytm\\_%' AND workspace_id IS NOT NULL AND id = CONCAT('brd_paytm_', LEFT(REPLACE(workspace_id, '-', ''), 16))",
  );
  const workspaces = await q<{ ws: string }>("SELECT DISTINCT workspace_id AS ws FROM brands WHERE id LIKE 'brd\\_phonepe\\_%' AND workspace_id IS NOT NULL");
  for (const { ws } of workspaces) await addRealDemoBrands(ws);
  await exec("INSERT INTO app_meta (k, v) VALUES ('demo_brands', 'phonepe+zentrapay') ON DUPLICATE KEY UPDATE v = VALUES(v)");
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
