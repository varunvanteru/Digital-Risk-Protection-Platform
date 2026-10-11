// Generates the app icons from the IMPOSTR logo ("Application logo" folder at the repo root).
//   node scripts/build-icons.mjs
//
// Large icons (installed app, home screen) show the full logo: the IMPOSTR name over the shield.
// Small ones (browser tab, menu) show the shield alone, because the name is unreadable at 16-32 px.
// File names carry "impostr-" so browsers and the service worker never reuse an old cached icon.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.join(import.meta.dirname, "..");
const SOURCE = path.join(root, "..", "Application logo", "IMPOSTR Shield Security Logo.png");
const out = path.join(root, "public", "icons");
fs.mkdirSync(out, { recursive: true });
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };

/** Crop to the visible artwork: everything brighter than the black background. */
async function trimmed(input) {
  const { data, info } = await sharp(input).trim({ background: "#000000", threshold: 40 }).png().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const full = await trimmed(SOURCE);
// The shield sits below the name: drop the top 35% of the canvas, then trim again.
const meta = await sharp(SOURCE).metadata();
const top = Math.round(meta.height * 0.35);
const shield = await trimmed(await sharp(SOURCE).extract({ left: 0, top, width: meta.width, height: meta.height - top }).png().toBuffer());
console.log("logo", full.width, "x", full.height, "· shield", shield.width, "x", shield.height);

/** The artwork centred on a black square, filling `fill` of its width or height. */
async function tile(art, size, fill) {
  const box = Math.round(size * fill);
  const inner = await sharp(art.data).resize({ width: box, height: box, fit: "contain", background: BLACK }).png().toBuffer();
  const off = Math.round((size - box) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: BLACK } })
    .composite([{ input: inner, left: off, top: off }])
    .png()
    .toBuffer();
}

const icons = [
  ["impostr-192.png", full, 192, 0.86],
  ["impostr-512.png", full, 512, 0.86],
  // Maskable: the launcher crops to a circle or squircle; keep the artwork inside the central safe zone.
  ["impostr-maskable-512.png", full, 512, 0.6],
  // iOS adds its own rounded corners and needs an opaque square.
  ["impostr-apple-180.png", full, 180, 0.86],
  ["impostr-favicon-32.png", shield, 32, 0.92],
  // The mark in the app's menu and loading screen (shown at 22-28 px, sharp on 3x screens).
  ["impostr-mark-96.png", shield, 96, 0.88],
];
for (const [name, art, size, fill] of icons) {
  fs.writeFileSync(path.join(out, name), await tile(art, size, fill));
  console.log("wrote", name);
}

// favicon.ico for browsers that ask for /favicon.ico: 16, 32 and 48 px PNGs in one ICO file.
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => tile(shield, s, 0.92)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e); // width
  header.writeUInt8(s, e + 1); // height
  header.writeUInt8(0, e + 2); // palette
  header.writeUInt8(0, e + 3); // reserved
  header.writeUInt16LE(1, e + 4); // colour planes
  header.writeUInt16LE(32, e + 6); // bits per pixel
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(path.join(root, "src", "app", "favicon.ico"), Buffer.concat([header, ...pngs]));
console.log("wrote src/app/favicon.ico");
