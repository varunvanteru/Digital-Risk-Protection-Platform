/**
 * Demo images. The fictional brand's logo and the simulated accounts' avatars are
 * pre-rendered by backend/export_demo_media.py (data/demo-media). Impersonator
 * avatars derived from a real brand's logo (copy, recolour, mirror, "SUPPORT"
 * badge) are generated here and stored in the database.
 */

import sharp from "sharp";
import { getMedia, mediaExists, mediaMtime, saveMedia } from "./media";

const SIZE = 256;
export const DEMO_LOGO = "brand/demo-logo.png";

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** The demo logo copied to brand/<id>.png, so an upload for that brand replaces only its own copy. */
export async function ensureBrandLogo(brandId: string): Promise<string> {
  const rel = `brand/${brandId}.png`;
  if (!(await mediaExists(rel))) {
    const demo = await getMedia(DEMO_LOGO);
    if (demo) await saveMedia(rel, demo.data);
  }
  return `/media/${rel}`;
}

/** Pre-rendered avatar for a dataset row; a plain tile if the row was added after the export. */
export async function ensureAvatar(kind: string, key: string): Promise<string> {
  const rel = `dataset/${slug(key)}.png`;
  if (!(await mediaExists(rel))) {
    const fill = kind === "monogram" ? { r: 214, g: 214, b: 208 } : { r: 70, g: 110, b: 200 };
    const png = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { ...fill, alpha: 1 } } }).png().toBuffer();
    await saveMedia(rel, png);
  }
  return `/media/${rel}`;
}

const VARIANTS = new Set(["copy", "recolor", "mirror", "badge"]);

/**
 * Impersonator variants of a real brand image (the brand's own logo or verified app icon).
 * Regenerated when the base changes; a neutral avatar when no base image exists.
 */
export async function ensureAvatarFromBase(kind: string, key: string, baseRel: string | null): Promise<string> {
  const stamp = baseRel ? await mediaMtime(baseRel) : null;
  if (!baseRel || stamp === null || !VARIANTS.has(kind)) {
    return ensureAvatar(kind !== "unrelated" ? "monogram" : "unrelated", key);
  }
  const rel = `dataset/${slug(key)}-${Math.trunc(stamp)}.png`;
  if (await mediaExists(rel)) return `/media/${rel}`;
  const base = await getMedia(baseRel);
  if (!base) return ensureAvatar("monogram", key);

  let img = sharp(base.data, { ignoreIcc: true }).ensureAlpha().resize(SIZE, SIZE, { fit: "fill", kernel: "cubic" });
  if (kind === "copy") {
    // re-encoded, slightly soft, as screenshots of a logo usually are
    const small = await img.resize(180, 180, { fit: "fill" }).png().toBuffer();
    img = sharp(small).resize(SIZE, SIZE, { fit: "fill", kernel: "cubic" }).blur(0.8);
  } else if (kind === "mirror") {
    img = img.flop();
  } else if (kind === "recolor") {
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    shiftHue(data, info.channels, 28);
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  } else if (kind === "badge") {
    img = sharp(await img.png().toBuffer()).composite([{ input: Buffer.from(badgeSvg()), top: 0, left: 0 }]);
  }
  return saveMedia(rel, await img.png().toBuffer());
}

/** Rotate hue in place (Pillow's 0-255 HSV scale), keeping saturation, value and alpha. */
function shiftHue(px: Buffer, channels: number, amount: number) {
  for (let i = 0; i < px.length; i += channels) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) continue;
    const d = max - min;
    let h = r === max ? (g - b) / d : g === max ? 2 + (b - r) / d : 4 + (r - g) / d;
    h = (((h / 6) % 1) + 1) % 1;
    const hue = ((Math.floor(h * 255) + amount) % 256) / 255;
    const s = d / max;
    const sector = Math.floor(hue * 6);
    const f = hue * 6 - sector;
    const p = Math.round(max * (1 - s));
    const q = Math.round(max * (1 - s * f));
    const t = Math.round(max * (1 - s * (1 - f)));
    const rgb = [
      [max, t, p],
      [q, max, p],
      [p, max, t],
      [p, q, max],
      [t, p, max],
      [max, p, q],
    ][sector % 6];
    px[i] = rgb[0];
    px[i + 1] = rgb[1];
    px[i + 2] = rgb[2];
  }
}

// "SUPPORT" in a 5x7 pixel font: drawn as rectangles, so no server fonts are needed.
const GLYPHS: Record<string, string[]> = {
  S: [".###.", "#...#", "#....", ".###.", "....#", "#...#", ".###."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
};

function badgeSvg(): string {
  const dot = 4;
  const text = "SUPPORT";
  const width = text.length * 6 * dot - dot;
  const x0 = (SIZE - width) / 2;
  const y0 = SIZE * 0.875 - (7 * dot) / 2;
  const rects: string[] = [];
  [...text].forEach((ch, i) =>
    GLYPHS[ch].forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === "#") rects.push(`<rect x="${x0 + (i * 6 + x) * dot}" y="${y0 + y * dot}" width="${dot}" height="${dot}"/>`);
      }),
    ),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <rect x="0" y="${SIZE * 0.75}" width="${SIZE}" height="${SIZE * 0.25}" fill="rgb(124,45,18)"/>
    <g fill="#fff">${rects.join("")}</g></svg>`;
}
