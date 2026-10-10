/**
 * Images served at /media/...: brand logos and simulated avatars.
 *
 * Stored in MySQL (media_files), so nothing depends on the server's disk. The
 * demo images exported by backend/export_demo_media.py ship in data/demo-media
 * and are served from there when the database has no copy.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { settings } from "./config";
import { exec, one } from "./db";

const STATIC_DIR = () => path.join(settings.dataDir, "demo-media");

export interface Media {
  data: Buffer;
  mtime: number; // seconds since the epoch
}

function staticPath(rel: string): string | null {
  const root = STATIC_DIR();
  const p = path.resolve(root, rel);
  return p.startsWith(root + path.sep) ? p : null; // no ../ escapes
}

export async function getMedia(rel: string): Promise<Media | null> {
  const row = await one<{ data: Buffer; mtime: number }>("SELECT data, mtime FROM media_files WHERE path = ?", [rel]);
  if (row) return { data: row.data, mtime: Number(row.mtime) };
  const p = staticPath(rel);
  if (!p) return null;
  try {
    const [data, st] = await Promise.all([fs.readFile(p), fs.stat(p)]);
    return { data, mtime: st.mtimeMs / 1000 };
  } catch {
    return null;
  }
}

export async function mediaMtime(rel: string): Promise<number | null> {
  const row = await one<{ mtime: number }>("SELECT mtime FROM media_files WHERE path = ?", [rel]);
  if (row) return Number(row.mtime);
  const p = staticPath(rel);
  if (!p) return null;
  try {
    return (await fs.stat(p)).mtimeMs / 1000;
  } catch {
    return null;
  }
}

export const mediaExists = async (rel: string) => (await mediaMtime(rel)) !== null;

/** Store PNG bytes at media/<rel> and return its "/media/..." path. */
export async function saveMedia(rel: string, png: Buffer): Promise<string> {
  await exec(
    "INSERT INTO media_files (path, data, mtime) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), mtime = VALUES(mtime)",
    [rel, png, Date.now() / 1000],
  );
  const { forgetImage } = await import("./detection/images");
  forgetImage(`/media/${rel}`);
  return `/media/${rel}`;
}
