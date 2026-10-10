// Generates the installable-app icons in public/icons from the BrandShield shield mark.
//   node scripts/build-icons.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const out = path.join(import.meta.dirname, "..", "public", "icons");
fs.mkdirSync(out, { recursive: true });

// The ProductMark shield on a black tile with a crimson check, as in the app header.
const mark = (size, { pad = 0, radius = 0.22 } = {}) => {
  const inner = size - pad * 2;
  const s = inner / 24;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius * size}" fill="#111111"/>
  <g transform="translate(${pad} ${pad}) scale(${s})" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="M12 4.6l5.6 2.2v4.7c0 3.5-2.4 6.3-5.6 7.6-3.2-1.3-5.6-4.1-5.6-7.6V6.8L12 4.6z" stroke="#ffffff" stroke-width="1.5"/>
    <path d="M9.3 12l1.9 1.9 3.6-3.8" stroke="#ff3b3b" stroke-width="1.7"/>
  </g>
</svg>`);
};

const icons = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  // Maskable: the platform crops to a circle or squircle, so keep the mark in the safe zone and the tile square.
  ["icon-maskable-512.png", 512, { pad: 96, radius: 0 }],
  ["apple-touch-icon.png", 180, { radius: 0 }],
  ["favicon-32.png", 32, {}],
];
for (const [name, size, opts] of icons) {
  await sharp(mark(size, opts)).png().toFile(path.join(out, name));
  console.log("wrote", name);
}
