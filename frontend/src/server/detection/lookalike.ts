/**
 * Look-alike name detection.
 *
 * Normalise in five steps, then match three ways (exact core, edit distance /
 * Jaro-Winkler, containment) with guards against over-flagging. Port of
 * backend/app/detection/lookalike.py; lengths count code points, as in Python.
 */

import fs from "node:fs";
import path from "node:path";
import { settings } from "../config";
import { pyRound, unique } from "../util";

export const HOMOGLYPHS: Record<string, string> = {
  "0": "o",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  // Cyrillic and Greek letters that render like Latin ones
  "а": "a",
  "е": "e",
  "о": "o",
  "р": "p",
  "с": "c",
  "у": "y",
  "х": "x",
  "і": "i",
  "ѕ": "s",
  "ο": "o",
  "α": "a",
  "ı": "i",
};

const MULTI_GLYPHS: [string, string][] = [
  ["rn", "m"],
  ["vv", "w"],
  ["cl", "d"],
];

export const FILLER_WORDS = [
  "official", "real", "support", "care", "help", "helpline", "team", "india", "app", "pay",
  "wallet", "customer", "service", "verified", "original", "hq", "global",
  // Words scammers bolt onto a brand name
  "offer", "offers", "refund", "refunds", "kyc", "cashback", "reward", "rewards", "helpdesk", "desk",
  "loan", "loans", "career", "careers", "jobs", "update", "updates", "alert", "alerts", "bonus",
  "gift", "gifts", "deals", "services", "apps", "pvt", "ltd",
];
const FILLER_SET = new Set(FILLER_WORDS);

// Names one edit away from the demo brand that are not in the English list.
const COMMON_WORDS = new Set(["zen", "sentra", "centra", "central", "contra", "zebra", "sentry", "zentro", "centro"]);

const g = globalThis as unknown as { __bsWords?: Set<string> };

/** ~38k common English words (data/common_words.txt). An ordinary word is never a look-alike on its own. */
export function englishWords(): Set<string> {
  if (!g.__bsWords) {
    try {
      const text = fs.readFileSync(path.join(settings.dataDir, "common_words.txt"), "utf8");
      g.__bsWords = new Set(text.split(/\r?\n/).filter((w) => w && !w.startsWith("#")));
    } catch {
      g.__bsWords = new Set();
    }
  }
  return g.__bsWords;
}

export function isOrdinaryWord(core: string): boolean {
  return COMMON_WORDS.has(core) || englishWords().has(core);
}

const SEPARATORS = /[\s._\-]+/u;
const len = (s: string) => Array.from(s).length;

export interface Step {
  label: string;
  output: string;
  changed: boolean;
  note: string | null;
}

export interface LookalikeResult {
  input: string;
  steps: Step[];
  core: string;
  alias: string;
  method: string;
  score: number;
  verdict: "match" | "partial" | "no_match";
  variations: string[];
  guards: string[];
  explanation: string;
}

interface Candidate {
  steps: Step[];
  core: string;
  variations: string[];
}

function extractHandle(raw: string): string {
  let s = raw.trim();
  if (s.includes("/")) {
    const parts = s.split("/").filter(Boolean);
    s = parts.length ? parts[parts.length - 1] : s;
  }
  return s.replace(/^@/, "").split("?")[0];
}

function mapGlyphs(s: string, oneAs: string): [string, number] {
  let swaps = 0;
  let out = "";
  for (const ch of s) {
    if (ch === "1") {
      swaps++;
      out += oneAs;
      continue;
    }
    const m = HOMOGLYPHS[ch];
    if (m) swaps++;
    out += m || ch;
  }
  return [out, swaps];
}

function stripFillers(tokens: string[], brandTokens: Set<string>): [string[], string[]] {
  const removed: string[] = [];
  const kept: string[] = [];
  for (let t of tokens) {
    if (FILLER_SET.has(t) && !brandTokens.has(t)) {
      removed.push(t);
      continue;
    }
    let changed = true;
    while (changed) {
      // fillers glued to the name, e.g. "phonepesupport"
      changed = false;
      for (const f of FILLER_WORDS) {
        if (brandTokens.has(f) || brandTokens.has(t)) continue;
        if (len(t) - f.length >= 4 && t.endsWith(f)) {
          removed.push(f);
          t = t.slice(0, t.length - f.length);
          changed = true;
        } else if (len(t) - f.length >= 4 && t.startsWith(f)) {
          removed.push(f);
          t = t.slice(f.length);
          changed = true;
        }
      }
    }
    kept.push(t);
  }
  return [kept, removed];
}

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps). */
export function damerau(sa: string, sb: string): number {
  const a = Array.from(sa);
  const b = Array.from(sb);
  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function isAdjacentSwap(sa: string, sb: string): boolean {
  const a = Array.from(sa);
  const b = Array.from(sb);
  if (a.length !== b.length) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
}

export function jaroWinkler(sa: string, sb: string): number {
  if (sa === sb) return 1.0;
  const a = Array.from(sa);
  const b = Array.from(sb);
  if (!a.length || !b.length) return 0.0;
  const rng = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array(a.length).fill(false);
  const bHit = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - rng);
    const hi = Math.min(i + rng + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bHit[j] || a[i] !== b[j]) continue;
      aHit[i] = bHit[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0.0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aHit[i]) continue;
    while (!bHit[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

const fmt2 = (x: number) => pyRound(x, 2).toFixed(2);

function normalise(raw: string, brandTokens: Set<string>, oneAs: string, multi: boolean, strip = true): Candidate {
  const steps: Step[] = [];
  const variations: string[] = [];

  const handle = extractHandle(raw);
  const nfkc = handle.normalize("NFKC");
  const s1 = nfkc.toLowerCase();
  steps.push({
    label: "Lowercase + Unicode NFKC",
    output: s1,
    changed: s1 !== handle,
    note: nfkc !== handle ? "Styled Unicode letters converted" : null,
  });
  if (nfkc !== handle) variations.push("Styled Unicode letters");

  let [s2, swaps] = mapGlyphs(s1, oneAs);
  if (multi) {
    for (const [frm, to] of MULTI_GLYPHS) {
      if (s2.includes(frm)) {
        s2 = s2.split(frm).join(to);
        swaps++;
      }
    }
  }
  steps.push({
    label: "Homoglyph and leetspeak map",
    output: s2,
    changed: swaps > 0,
    note: swaps ? `${swaps} look-alike character${swaps > 1 ? "s" : ""} replaced` : null,
  });
  if (swaps) variations.push("Homoglyph / leetspeak");

  const tokens = s2.split(SEPARATORS).filter(Boolean);
  const joined = tokens.join("");
  steps.push({
    label: "Remove separators",
    output: tokens.join(" · "),
    changed: joined !== s2,
    note: joined !== s2 ? `${tokens.length} token${tokens.length > 1 ? "s" : ""}` : null,
  });
  if (joined !== s2) variations.push("Spacing / separators");

  const [kept, removed] = strip ? stripFillers(tokens, brandTokens) : [tokens, []];
  const core = kept.join("");
  steps.push({
    label: "Strip filler words",
    output: core,
    changed: removed.length > 0,
    note: removed.length ? `Removed: ${removed.join(", ")}` : null,
  });
  if (removed.length) variations.push("Added words");

  return { steps, core, variations };
}

const EXPLANATION = {
  match: "Strong look-alike. On a live profile this needs one more signal (logo, claims, publisher or scam behaviour) to reach High.",
  partial: "Shares the brand name but with unrelated text. Shown for review, not flagged on name alone.",
  no_match: "Not a look-alike of the brand name.",
};

function match(raw: string, cand: Candidate, alias: string, fullName = ""): LookalikeResult {
  const core = cand.core;
  const variations = [...cand.variations];
  const guards: string[] = [];
  const aliasLen = len(alias);
  const longEnough = aliasLen >= 6;
  let method = "No match";
  let score = 0.0;

  if (!core) {
    method = "Nothing left after normalisation";
  } else if (core === alias) {
    method = "Exact match after normalisation";
    score = variations.length ? 0.95 : 1.0;
  } else {
    const dist = damerau(core, alias);
    const jw = jaroWinkler(core, alias);
    if (longEnough && dist > 1 && core.includes(alias)) {
      const rest = core.replace(alias, "");
      method = "Contains brand name plus other text";
      score = 0.6;
      guards.push(`Extra text "${rest}" is not a known filler word, so this is only a partial match`);
    } else if (aliasLen >= 5 && dist === 1) {
      const swap = isAdjacentSwap(core, alias);
      method = swap ? "Character swap (edit distance 1)" : "One letter changed, missing or doubled";
      variations.push(swap ? "Character swap" : "Missing / doubled letter");
      score = longEnough ? (swap ? 0.9 : 0.88) : 0.85;
    } else if (longEnough && jw >= 0.92) {
      method = `Jaro-Winkler ${fmt2(jw)}`;
      variations.push("Close spelling");
      score = 0.88;
    } else {
      method = `Jaro-Winkler ${fmt2(jw)}, edit distance ${dist}`;
      score = Math.max(0.0, Math.min(0.55, ((jw - 0.7) / 0.3) * 0.55));
    }
    if (aliasLen < 5 && dist > 0) {
      guards.push(`"${alias}" is shorter than 5 letters, so only an exact match counts`);
      score = Math.min(score, 0.3);
    }
    // A shortened form of the brand name ("phone" from "phonepe") is often an ordinary word that
    // other companies use too; a misspelling of it ("phome") is not a copy of the brand.
    if (fullName && alias !== fullName && fullName.includes(alias) && score > 0.6) {
      guards.push(`"${alias}" is a shortened form of the brand name, so only an exact spelling counts as a strong match`);
      score = 0.6;
    }
  }

  if (core !== alias && isOrdinaryWord(core)) {
    guards.push(`"${core}" is an ordinary word or name, so name similarity alone stays Low`);
    score = Math.min(score, 0.3);
  }

  const verdict = score >= 0.85 ? "match" : score >= 0.6 ? "partial" : "no_match";
  return {
    input: raw,
    steps: cand.steps,
    core,
    alias,
    method,
    score: pyRound(score, 2),
    verdict,
    variations: verdict === "no_match" ? [] : unique(variations),
    guards,
    explanation: EXPLANATION[verdict],
  };
}

export function analyseName(raw: string, aliases: string[]): LookalikeResult {
  const brandTokens = new Set<string>();
  const aliasCores: string[] = [];
  for (const a of aliases) {
    const toks = a.toLowerCase().split(SEPARATORS).filter(Boolean);
    toks.forEach((t) => brandTokens.add(t));
    const core = toks.join("");
    if (core && !aliasCores.includes(core)) aliasCores.push(core);
  }

  const candidates = [
    normalise(raw, brandTokens, "l", false),
    normalise(raw, brandTokens, "i", false),
    normalise(raw, brandTokens, "l", true),
    // Fillers kept: "pay.tm" must still read as "paytm" even though "pay" is a filler word.
    normalise(raw, brandTokens, "l", false, false),
  ];

  let best: LookalikeResult | null = null;
  for (const cand of candidates) {
    for (const alias of aliasCores) {
      const r = match(raw, cand, alias, aliasCores[0]);
      if (best === null || r.score > best.score) best = r;
    }
  }
  return best ?? match(raw, candidates[0], "");
}

const WORD = /[\p{L}\p{N}]+/gu;

/**
 * Best look-alike score across several names (handle, display name, app title).
 * Long titles like "PhonePe Wallet - UPI & Bills" are also scanned in windows
 * of 1 to 3 words, so the brand name is found inside a longer title.
 */
export function nameSimilarity(names: (string | null | undefined)[], aliases: string[]): [number, LookalikeResult] {
  const ns = names.filter((n): n is string => !!n && !!n.trim());
  const results = ns.map((n) => analyseName(n, aliases));
  let best = results[0] ?? analyseName("", aliases);
  for (const r of results) if (r.score > best.score) best = r;
  if (best.score >= 0.85) return [best.score, best];

  for (const n of ns) {
    const words = n.match(WORD) ?? [];
    if (words.length < 2) continue;
    for (const size of [1, 2, 3]) {
      for (let i = 0; i < words.length - size + 1; i++) {
        const window = words.slice(i, i + size).join(" ");
        const r = analyseName(window, aliases);
        if (r.score >= 0.88) {
          r.input = n;
          r.score = 0.85;
          r.method = `Brand look-alike "${window}" inside a longer name`;
          r.variations = unique([...r.variations, "Added words"]);
          return [r.score, r];
        }
      }
    }
  }
  return [best.score, best];
}
