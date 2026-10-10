/**
 * Logo / icon similarity. Port of backend/app/detection/images.py.
 *
 * Shape: perceptual hash (pHash) Hamming distance, also against the mirrored
 * official logo. Colour: hue-histogram intersection. A recolour keeps the shape
 * and changes the colour; a mirror matches only the flipped logo.
 *
 * The pixel pipeline reproduces Pillow exactly (alpha_composite, convert("L"),
 * convert("HSV"), and resize() with Pillow's fixed-point bicubic and Lanczos
 * filters), so hashes match the Python engine. Images are decoded with sharp,
 * without colour-profile conversion, as Pillow does.
 */

import sharp from "sharp";
import { settings } from "../config";
import { getMedia } from "../media";
import { pyRound } from "../util";

export interface Img {
  w: number;
  h: number;
  c: number; // channels per pixel: 1 (L), 3 (RGB / HSV), 4 (RGBA)
  data: Uint8Array;
}

export interface ImageMatch {
  score: number; // 0..1
  shape: number;
  colour: number;
  kind: "copy" | "mirror" | "recolor" | "similar" | "different";
}

// ---------- Pillow-compatible pixel operations ----------

const PRECISION_BITS = 32 - 8 - 2;

type Filter = { fn: (x: number) => number; support: number };

const BICUBIC: Filter = {
  support: 2.0,
  fn: (x) => {
    const a = -0.5;
    if (x < 0.0) x = -x;
    if (x < 1.0) return ((a + 2.0) * x - (a + 3.0)) * x * x + 1;
    if (x < 2.0) return (((x - 5) * x + 8) * x - 4) * a;
    return 0.0;
  },
};

const sinc = (x: number) => {
  if (x === 0.0) return 1.0;
  x = x * Math.PI;
  return Math.sin(x) / x;
};

const LANCZOS: Filter = {
  support: 3.0,
  fn: (x) => (-3.0 <= x && x < 3.0 ? sinc(x) * sinc(x / 3) : 0.0),
};

function precomputeCoeffs(inSize: number, outSize: number, filter: Filter) {
  const scale = inSize / outSize;
  const filterscale = scale < 1.0 ? 1.0 : scale;
  const support = filter.support * filterscale;
  const ksize = Math.ceil(support) * 2 + 1;
  const bounds = new Int32Array(outSize * 2);
  const kk = new Int32Array(outSize * ksize);
  const k = new Float64Array(ksize);
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    let ww = 0.0;
    const ss = 1.0 / filterscale;
    let xmin = Math.trunc(center - support + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.trunc(center + support + 0.5);
    if (xmax > inSize) xmax = inSize;
    xmax -= xmin;
    for (let x = 0; x < xmax; x++) {
      const w = filter.fn((x + xmin - center + 0.5) * ss);
      k[x] = w;
      ww += w;
    }
    for (let x = 0; x < ksize; x++) {
      let v = x < xmax ? k[x] : 0;
      if (x < xmax && ww !== 0.0) v /= ww;
      // normalize_coeffs_8bpc
      kk[xx * ksize + x] = v < 0 ? Math.trunc(-0.5 + v * (1 << PRECISION_BITS)) : Math.trunc(0.5 + v * (1 << PRECISION_BITS));
    }
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
  }
  return { ksize, bounds, kk };
}

const clip8 = (ss: number) => {
  const v = ss >> PRECISION_BITS;
  return v < 0 ? 0 : v > 255 ? 255 : v;
};

/** Image.resize((w, h), filter) for 8-bit images, two-pass as in Pillow's Resample.c. */
function resize(im: Img, outW: number, outH: number, filter: Filter): Img {
  if (im.w === outW && im.h === outH) return { ...im, data: im.data.slice() };
  const { c } = im;
  const horiz = precomputeCoeffs(im.w, outW, filter);
  const vert = precomputeCoeffs(im.h, outH, filter);
  const yFirst = vert.bounds[0];
  const yLast = vert.bounds[outH * 2 - 2] + vert.bounds[outH * 2 - 1];
  let src = im;
  const vb = Int32Array.from(vert.bounds);
  const half = 1 << (PRECISION_BITS - 1);

  if (outW !== im.w) {
    for (let i = 0; i < outH; i++) vb[i * 2] -= yFirst;
    const th = yLast - yFirst;
    const out = new Uint8Array(outW * th * c);
    for (let y = 0; y < th; y++) {
      const row = (y + yFirst) * im.w * c;
      for (let xx = 0; xx < outW; xx++) {
        const xmin = horiz.bounds[xx * 2];
        const xmax = horiz.bounds[xx * 2 + 1];
        const kb = xx * horiz.ksize;
        for (let b = 0; b < c; b++) {
          let ss = half;
          for (let x = 0; x < xmax; x++) ss += im.data[row + (x + xmin) * c + b] * horiz.kk[kb + x];
          out[(y * outW + xx) * c + b] = clip8(ss);
        }
      }
    }
    src = { w: outW, h: th, c, data: out };
  }

  if (outH !== im.h) {
    const out = new Uint8Array(src.w * outH * c);
    for (let yy = 0; yy < outH; yy++) {
      const ymin = vb[yy * 2];
      const ymax = vb[yy * 2 + 1];
      const kb = yy * vert.ksize;
      for (let xx = 0; xx < src.w; xx++) {
        for (let b = 0; b < c; b++) {
          let ss = half;
          for (let y = 0; y < ymax; y++) ss += src.data[((y + ymin) * src.w + xx) * c + b] * vert.kk[kb + y];
          out[(yy * src.w + xx) * c + b] = clip8(ss);
        }
      }
    }
    src = { w: src.w, h: outH, c, data: out };
  }
  return src;
}

/** Image.alpha_composite(white, rgba).convert("RGB"). */
function onWhite(im: Img): Img {
  const out = new Uint8Array(im.w * im.h * 3);
  const PB = 7;
  const div255 = (a: number) => (((a >>> 8) + a) >>> 8);
  for (let i = 0, j = 0; i < im.w * im.h; i++, j += 3) {
    const r = im.data[i * 4];
    const g = im.data[i * 4 + 1];
    const b = im.data[i * 4 + 2];
    const a = im.data[i * 4 + 3];
    if (a === 0) {
      out[j] = out[j + 1] = out[j + 2] = 255;
      continue;
    }
    const blend = 255 * (255 - a);
    const outa255 = a * 255 + blend;
    const coef1 = Math.floor((a * 255 * 255 * (1 << PB)) / outa255);
    const coef2 = 255 * (1 << PB) - coef1;
    out[j] = div255(r * coef1 + 255 * coef2 + (0x80 << PB)) >>> PB;
    out[j + 1] = div255(g * coef1 + 255 * coef2 + (0x80 << PB)) >>> PB;
    out[j + 2] = div255(b * coef1 + 255 * coef2 + (0x80 << PB)) >>> PB;
  }
  return { w: im.w, h: im.h, c: 3, data: out };
}

/** convert("L"): ITU-R 601-2 luma with Pillow's 16-bit fixed point. */
function toL(im: Img): Img {
  const out = new Uint8Array(im.w * im.h);
  for (let i = 0; i < out.length; i++) {
    const p = i * 3;
    out[i] = (im.data[p] * 19595 + im.data[p + 1] * 38470 + im.data[p + 2] * 7471 + 0x8000) >>> 16;
  }
  return { w: im.w, h: im.h, c: 1, data: out };
}

/** convert("HSV") from RGB, following Pillow's float32 arithmetic. */
function toHSV(im: Img): Img {
  const f = Math.fround;
  const out = new Uint8Array(im.w * im.h * 3);
  for (let i = 0; i < im.w * im.h; i++) {
    const r = im.data[i * 3];
    const g = im.data[i * 3 + 1];
    const b = im.data[i * 3 + 2];
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    let uh = 0;
    let us = 0;
    if (minc !== maxc) {
      const cr = maxc - minc;
      const s = f(cr / maxc);
      const rc = f((maxc - r) / cr);
      const gc = f((maxc - g) / cr);
      const bc = f((maxc - b) / cr);
      let h: number;
      if (r === maxc) h = f(bc - gc);
      else if (g === maxc) h = f(2.0 + rc - bc);
      else h = f(4.0 + gc - rc);
      h = f((h / 6.0 + 1.0) % 1.0); // fmod; the dividend is always positive here
      const hi = Math.trunc(h * 255.0);
      const si = Math.trunc(s * 255.0);
      uh = hi < 0 ? 0 : hi > 255 ? 255 : hi;
      us = si < 0 ? 0 : si > 255 ? 255 : si;
    }
    out[i * 3] = uh;
    out[i * 3 + 1] = us;
    out[i * 3 + 2] = maxc;
  }
  return { w: im.w, h: im.h, c: 3, data: out };
}

function mirror(im: Img): Img {
  const out = new Uint8Array(im.data.length);
  const { w, h, c } = im;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let b = 0; b < c; b++) out[(y * w + (w - 1 - x)) * c + b] = im.data[(y * w + x) * c + b];
  return { w, h, c, data: out };
}

// ---------- pHash and hue histogram (imagehash.phash, _colour_similarity) ----------

const N = 32;
const COS = (() => {
  const t = new Float64Array(N * N);
  for (let k = 0; k < N; k++) for (let n = 0; n < N; n++) t[k * N + n] = Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
  return t;
})();

/** 64-bit perceptual hash: DCT-II of the 32x32 grey image, top-left 8x8 above their median. */
function phash(rgb: Img): Uint8Array {
  const small = resize(toL(rgb), N, N, LANCZOS);
  // dct along axis 0 (down each column), then axis 1 (along each row), unnormalised like scipy.fftpack
  const col = new Float64Array(8 * N); // only the 8 lowest vertical frequencies are needed
  for (let k = 0; k < 8; k++)
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += small.data[y * N + x] * COS[k * N + y];
      col[k * N + x] = 2 * s;
    }
  const low = new Float64Array(64);
  for (let k1 = 0; k1 < 8; k1++)
    for (let k2 = 0; k2 < 8; k2++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += col[k1 * N + x] * COS[k2 * N + x];
      low[k1 * 8 + k2] = 2 * s;
    }
  const sorted = Array.from(low).sort((a, b) => a - b);
  const med = (sorted[31] + sorted[32]) / 2;
  return Uint8Array.from(low, (v) => (v > med ? 1 : 0));
}

function hueHistogram(rgb: Img): number[] {
  const hsv = resize(toHSV(rgb), 64, 64, BICUBIC);
  const bins = new Array(18).fill(0.0);
  for (let i = 0; i < 64 * 64; i++) {
    const hue = hsv.data[i * 3];
    const sat = hsv.data[i * 3 + 1];
    const val = hsv.data[i * 3 + 2];
    if (sat > 60 && val > 50) bins[Math.floor((hue * 18) / 256)] += 1; // ignore white, grey and black
  }
  let total = 0;
  for (const v of bins) total += v;
  if (total === 0) total = 1.0;
  return bins.map((x) => x / total);
}

const hamming = (a: Uint8Array, b: Uint8Array) => a.reduce((n, bit, i) => n + (bit !== b[i] ? 1 : 0), 0);

// 64-bit hash: <= 4 bits apart is a copy; around 28+ bits is unrelated.
const shapeSimilarity = (d: number) => Math.max(0.0, Math.min(1.0, 1 - (d - 4) / 24));

function colourSimilarity(ha: number[], hb: number[]): number {
  const sum = (h: number[]) => h.reduce((s, x) => s + x, 0);
  if (sum(ha) === 0 || sum(hb) === 0) return 0.0;
  let s = 0;
  for (let i = 0; i < ha.length; i++) s += Math.min(ha[i], hb[i]);
  return s;
}

// ---------- loading ----------

/** Decode any image to RGBA without colour management (Image.open(...).convert("RGBA")). */
export async function decode(buf: Buffer): Promise<Img> {
  const { data, info } = await sharp(buf, { ignoreIcc: true, failOn: "none" })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw({ depth: "uchar" })
    .toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, c: 4, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

/** _flatten: composite on white, RGB, 256x256 bicubic. */
export function flatten(rgba: Img): Img {
  return resize(onWhite(rgba), 256, 256, BICUBIC);
}

async function fetchBytes(ref: string): Promise<Buffer | null> {
  if (ref.startsWith("http")) {
    const res = await fetch(ref, { redirect: "follow", signal: AbortSignal.timeout(settings.sourceTimeoutMs) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  const m = await getMedia(ref.replace(/^\/media\//, ""));
  return m ? m.data : null;
}

/** Load from a media path ("/media/...") or an http(s) URL, flattened. Null on any failure. */
export async function loadImage(ref: string): Promise<Img | null> {
  try {
    const buf = await fetchBytes(ref);
    return buf ? flatten(await decode(buf)) : null;
  } catch {
    return null;
  }
}

/** Encode an RGB or RGBA image as PNG. */
export async function encodePng(im: Img): Promise<Buffer> {
  return sharp(Buffer.from(im.data), { raw: { width: im.w, height: im.h, channels: im.c as 1 | 3 | 4 } }).png().toBuffer();
}

interface Features {
  hash: Uint8Array;
  mirrorHash: Uint8Array;
  hist: number[];
}

const g = globalThis as unknown as { __bsImg?: Map<string, Promise<Features | null>> };
const cache = () => (g.__bsImg ??= new Map());
const CACHE_SIZE = 512;

/** Hashes and histogram of an image, cached by reference (lru_cache(512) in Python). */
export function features(ref: string): Promise<Features | null> {
  const c = cache();
  const hit = c.get(ref);
  if (hit) {
    c.delete(ref);
    c.set(ref, hit);
    return hit;
  }
  const p = loadImage(ref).then((img) =>
    img ? { hash: phash(img), mirrorHash: phash(mirror(img)), hist: hueHistogram(img) } : null,
  );
  c.set(ref, p);
  if (c.size > CACHE_SIZE) c.delete(c.keys().next().value as string);
  return p;
}

export function clearImageCache(): void {
  cache().clear();
}

export function forgetImage(ref: string): void {
  cache().delete(ref);
}

export async function compare(officialRef: string, candidateRef: string | null): Promise<ImageMatch | null> {
  if (!candidateRef) return null;
  const [official, candidate] = await Promise.all([features(officialRef), features(candidateRef)]);
  if (!official || !candidate) return null;

  const straight = shapeSimilarity(hamming(official.hash, candidate.hash));
  const mirrored = shapeSimilarity(hamming(official.mirrorHash, candidate.hash));
  const shape = Math.max(straight, mirrored);
  const colour = colourSimilarity(official.hist, candidate.hist);
  const score = pyRound(0.8 * shape + 0.2 * colour, 2);

  let kind: ImageMatch["kind"];
  if (shape >= 0.8 && mirrored > straight + 0.1) kind = "mirror";
  else if (shape >= 0.8 && colour < 0.6) kind = "recolor";
  else if (shape >= 0.8) kind = "copy";
  else if (score >= 0.5) kind = "similar";
  else kind = "different";
  return { score, shape: pyRound(shape, 2), colour: pyRound(colour, 2), kind };
}

// Exposed for the parity test.
export const _internals = { resize, toL, toHSV, onWhite, phash, hueHistogram, mirror, BICUBIC, LANCZOS };
