/** Curated datasets for sources without open APIs (social platforms, APK sites). Port of datasets.py. */

import fs from "node:fs";
import path from "node:path";
import { settings } from "../config";
import { one } from "../db";
import { currentWorkspace } from "../workspace";
import { ensureAvatar, ensureAvatarFromBase } from "../demoAssets";
import { nameSimilarity } from "../detection/lookalike";
import { candidate, type Candidate, type Connector } from "./base";

const SOCIAL_URL: Record<string, string> = {
  instagram: "https://instagram.com/{h}",
  x: "https://x.com/{h}",
  facebook: "https://facebook.com/{h}",
  telegram: "https://t.me/{h}",
  whatsapp: "https://whatsapp.com/channel/{h}",
  threads: "https://www.threads.net/@{h}",
  linkedin: "https://www.linkedin.com/company/{h}",
  snapchat: "https://www.snapchat.com/add/{h}",
  youtube: "https://www.youtube.com/@{h}",
  sharechat: "https://sharechat.com/profile/{h}",
  moj: "https://mojapp.in/@{h}",
  josh: "https://share.myjosh.in/profile/{h}",
  pinterest: "https://www.pinterest.com/{h}",
  quora: "https://www.quora.com/profile/{h}",
  discord: "https://discord.gg/{h}",
};

const STORE_URL: Record<string, string> = {
  google_play: "https://play.google.com/store/apps/details?id={h}",
  app_store: "https://apps.apple.com/app/{h}",
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const g = globalThis as unknown as { __bsData?: Map<string, Row[]> };

export function loadDataset(name: string): Row[] {
  g.__bsData ??= new Map();
  if (!g.__bsData.has(name)) g.__bsData.set(name, JSON.parse(fs.readFileSync(path.join(settings.dataDir, name), "utf8")));
  return g.__bsData.get(name)!;
}

/** Media path of a registered brand's reference image, used to derive simulated impersonator icons. */
async function brandLogo(name: string): Promise<string | null> {
  // Only this workspace's brands: another visitor's uploaded logo must never appear here.
  const row = await one<{ logo_path: string | null }>(
    "SELECT logo_path FROM brands WHERE LOWER(name) = ? AND workspace_id <=> ? LIMIT 1",
    [name.toLowerCase(), currentWorkspace()],
  );
  return row?.logo_path ? row.logo_path.replace(/^\/media\//, "") : null;
}

async function avatar(row: Row, key: string): Promise<string> {
  if (row.base_brand) return ensureAvatarFromBase(row.avatar, key, await brandLogo(row.base_brand));
  return ensureAvatar(row.avatar, key);
}

/** "2026-10-09T06:10:00Z" -> "2026-10-09 06:10:00" (naive UTC). */
const dt = (s: string | undefined | null) => (s ? s.replace("Z", "").replace("T", " ").slice(0, 19) : null);

/** Datasets answer a fuzzy keyword search, the way platform search boxes do. */
function matches(names: string[], text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  if (keywords.some((k) => t.includes(k.toLowerCase()))) return true;
  return nameSimilarity(names, keywords)[0] >= 0.5;
}

export class SocialDataset implements Connector {
  constructor(
    public sourceId: string,
    public platform: string,
  ) {}

  async fetch(keywords: string[]): Promise<Candidate[]> {
    const out: Candidate[] = [];
    for (const p of loadDataset("social_profiles.json")) {
      if (p.platform !== this.platform) continue;
      if (!matches([p.handle, p.display_name], `${p.handle} ${p.display_name} ${p.bio}`, keywords)) continue;
      out.push(
        candidate({
          sourceId: this.sourceId,
          channel: "social",
          platform: p.platform,
          identifier: p.handle.toLowerCase(),
          handle: p.handle,
          displayName: p.display_name,
          url: SOCIAL_URL[p.platform].replace("{h}", p.handle),
          bio: p.bio,
          audience: p.followers,
          createdOn: p.created_at,
          links: p.links,
          verified: p.verified,
          image: await avatar(p, `${p.platform}-${p.handle}`),
          mark: p.avatar,
          firstSeen: dt(p.first_seen),
          seedStatus: p.status ?? null,
        }),
      );
    }
    return out;
  }
}

export class StoreDataset implements Connector {
  constructor(
    public sourceId: string,
    public filename: string,
  ) {}

  async fetch(keywords: string[]): Promise<Candidate[]> {
    const out: Candidate[] = [];
    for (const a of loadDataset(this.filename)) {
      if (!matches([a.title, a.package_id], `${a.package_id} ${a.title} ${a.description}`, keywords)) continue;
      out.push(
        candidate({
          sourceId: this.sourceId,
          channel: "app",
          platform: a.platform,
          identifier: a.package_id.toLowerCase(),
          handle: a.package_id,
          displayName: a.title,
          url: a.url || (STORE_URL[a.platform] ?? "").replace("{h}", a.package_id),
          bio: a.description,
          audience: a.installs,
          createdOn: a.released,
          publisher: a.publisher,
          publisherId: a.publisher_id,
          links: a.privacy_url ? [a.privacy_url] : [],
          image: await avatar(a, `${a.platform}-${a.package_id}`),
          mark: a.avatar,
          privacyUrl: a.privacy_url ?? null,
          firstSeen: dt(a.first_seen),
          seedStatus: a.status ?? null,
        }),
      );
    }
    return out;
  }
}
