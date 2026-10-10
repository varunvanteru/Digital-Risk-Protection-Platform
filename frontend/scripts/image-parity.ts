/**
 * Compare the Node image pipeline with Pillow on the same images.
 * Usage: npx tsx scripts/image-parity.ts <python-features.json> <image path or URL>...
 */

import fs from "node:fs";
import { _internals, decode, flatten } from "../src/server/detection/images";

const { resize, toL, toHSV, phash, hueHistogram, mirror, LANCZOS, BICUBIC } = _internals;
const py = JSON.parse(fs.readFileSync(process.argv[2], "utf8").replace(/^﻿/, ""));
const sum = (a: Uint8Array) => a.reduce((s, x) => s + x, 0);

async function main() {
let worstHash = 0;
for (const ref of process.argv.slice(3)) {
  const buf = ref.startsWith("http") ? Buffer.from(await (await fetch(ref)).arrayBuffer()) : fs.readFileSync(ref);
  const img = flatten(await decode(buf));
  const p = py[ref];
  const bits = (h: Uint8Array) => Array.from(h).join("");
  const diff = (a: string, b: string) => [...a].filter((c, i) => c !== b[i]).length;
  const h = bits(phash(img));
  const m = bits(phash(mirror(img)));
  const hist = hueHistogram(img);
  const histErr = Math.max(...hist.map((v, i) => Math.abs(v - p.hist[i])));
  const flat = sum(img.data) === p.flatSum;
  const small = sum(resize(toL(img), 32, 32, LANCZOS).data) === p.smallSum;
  const hsv = sum(resize(toHSV(img), 64, 64, BICUBIC).data) === p.hsvSum;
  worstHash = Math.max(worstHash, diff(h, p.hash), diff(m, p.mirror));
  console.log(
    `${ref.split(/[\\/]/).pop()?.slice(0, 40).padEnd(40)} flat:${flat ? "=" : "≠"} grey32:${small ? "=" : "≠"} hsv64:${hsv ? "=" : "≠"} ` +
      `hash bits differ:${diff(h, p.hash)} mirror:${diff(m, p.mirror)} hist max err:${histErr.toExponential(1)}`,
  );
}
console.log("worst hash difference (bits):", worstHash);
}

main();
