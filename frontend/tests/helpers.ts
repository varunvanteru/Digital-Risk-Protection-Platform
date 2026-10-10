import fs from "node:fs";
import path from "node:path";
import { candidate, type Candidate } from "@/server/connectors/base";
import { slug } from "@/server/demoAssets";
import type { BrandContext } from "@/server/detection/context";
import type { Evaluation } from "@/server/detection/signals";
import { context } from "@/server/evaluation";

const DATA = path.join(__dirname, "..", "data");
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));

export const TODAY = "2026-10-10";

export function profiles(): Record<string, BrandContext> {
  return Object.fromEntries(read("labelled_cases.json").brands.map((b: { name: string }) => [b.name, context(b)]));
}

/** A pre-rendered demo avatar of the given kind (copy, mirror, recolor, unrelated, ...), as a media path. */
export function demoAvatar(kind: string): string {
  for (const p of read("social_profiles.json")) if (p.avatar === kind && !p.base_brand) return `/media/dataset/${slug(`${p.platform}-${p.handle}`)}.png`;
  for (const f of ["store_snapshot.json", "apk_sites.json"])
    for (const a of read(f)) if (a.avatar === kind && !a.base_brand) return `/media/dataset/${slug(`${a.platform}-${a.package_id}`)}.png`;
  throw new Error(`no demo avatar of kind ${kind}`);
}

export const app = (
  handle: string,
  title: string,
  publisher: string | null = null,
  publisherId: string | null = null,
  extra: Partial<Candidate> = {},
): Candidate =>
  candidate({
    sourceId: "t", channel: "app", platform: "google_play", identifier: handle.toLowerCase(), handle, displayName: title,
    url: "", publisher, publisherId, ...extra,
  });

export const social = (handle: string, name: string, bio = "", extra: Partial<Candidate> = {}): Candidate =>
  candidate({ sourceId: "t", channel: "social", platform: "instagram", identifier: handle.toLowerCase(), handle, displayName: name, url: "", bio, ...extra });

export const flagged = (ev: Evaluation) => ev.official === null && ["critical", "high", "medium"].includes(ev.breakdown!.severity);
