/** First-run data: the source registry and the demo brand profiles. Port of backend/app/seed.py. */

import { exec } from "./db";
import { ensureBrandLogo } from "./demoAssets";
import { utcnow } from "./util";

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
  for (const [sid, name, platform, channel, mode] of SOURCES) {
    await exec(
      `INSERT INTO sources (id, name, platform, channel, mode, health, items_last_scan, simulate_outage)
       VALUES (?, ?, ?, ?, ?, 'operational', 0, 0) ON DUPLICATE KEY UPDATE name = VALUES(name), mode = VALUES(mode)`,
      [sid, name, platform, channel, mode],
    );
  }
}

/**
 * A new workspace starts with its own copy of the demo brands, so every visitor sees a
 * working demo and nothing another visitor added. Returns the active brand's ID.
 */
export async function seedWorkspace(ws: string): Promise<string> {
  const id = demoBrandId(ws);
  const now = utcnow();
  await exec(
    `INSERT INTO brands (id, name, aliases, keywords, domains, description, logo_path, legal_name, is_active, updated_at, workspace_id)
     VALUES (?, 'ZentraPay', ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
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
  await seedPhonepeDemo(ws);
  return id;
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
