/**
 * Look-alike name detection.
 * Mirrors the pipeline in the design doc: normalise in five steps, then match
 * three ways (exact core, containment, edit distance / Jaro-Winkler) with
 * guards that keep ordinary names from being flagged.
 */

const HOMOGLYPHS: Record<string, string> = {
  "0": "o",
  "1": "l",
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
  "official",
  "real",
  "support",
  "care",
  "help",
  "helpline",
  "team",
  "india",
  "app",
  "pay",
  "wallet",
  "customer",
  "service",
  "verified",
  "original",
  "hq",
  "global",
];

/** Real words and names that sit one edit away from common brand names. */
const COMMON_WORDS = ["zen", "sentra", "centra", "central", "contra", "zebra", "sentry", "zentro", "centro"];

const SEPARATORS = /[\s._\-]+/;

export type Verdict = "match" | "partial" | "no_match";

export interface Step {
  label: string;
  output: string;
  changed: boolean;
  note?: string;
}

export interface LookalikeResult {
  input: string;
  steps: Step[];
  core: string;
  alias: string;
  method: string;
  score: number;
  verdict: Verdict;
  variations: string[];
  guards: string[];
  explanation: string;
}

function extractHandle(raw: string) {
  let s = raw.trim();
  if (s.includes("/")) {
    const parts = s.split("/").filter(Boolean);
    s = parts.at(-1) ?? s;
  }
  s = s.replace(/^@/, "").split("?")[0];
  return s;
}

function mapGlyphs(s: string, oneAs: "l" | "i") {
  let swaps = 0;
  const out = Array.from(s)
    .map((ch) => {
      if (ch === "1") {
        swaps++;
        return oneAs;
      }
      const m = HOMOGLYPHS[ch];
      if (m) swaps++;
      return m ?? ch;
    })
    .join("");
  return { out, swaps };
}

function stripFillers(tokens: string[], brandTokens: Set<string>) {
  const removed: string[] = [];
  const kept: string[] = [];
  for (let t of tokens) {
    if (FILLER_WORDS.includes(t) && !brandTokens.has(t)) {
      removed.push(t);
      continue;
    }
    // Fillers glued to the name, e.g. "zentrapaysupport"
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of FILLER_WORDS) {
        if (brandTokens.has(f)) continue;
        if (t.length - f.length >= 4 && t.endsWith(f) && !brandTokens.has(t)) {
          removed.push(f);
          t = t.slice(0, -f.length);
          changed = true;
        } else if (t.length - f.length >= 4 && t.startsWith(f) && !brandTokens.has(t)) {
          removed.push(f);
          t = t.slice(f.length);
          changed = true;
        }
      }
    }
    kept.push(t);
  }
  return { kept, removed };
}

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps). */
export function damerau(a: string, b: string) {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function isAdjacentSwap(a: string, b: string) {
  if (a.length !== b.length) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
}

export function jaroWinkler(a: string, b: string) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array(a.length).fill(false);
  const bHit = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bHit[j] || a[i] !== b[j]) continue;
      aHit[i] = bHit[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
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
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

interface Candidate {
  steps: Step[];
  core: string;
  variations: string[];
}

function normalise(raw: string, brandTokens: Set<string>, oneAs: "l" | "i", multi: boolean): Candidate {
  const steps: Step[] = [];
  const variations: string[] = [];

  const handle = extractHandle(raw);
  const s1 = handle.normalize("NFKC").toLowerCase();
  steps.push({
    label: "Lowercase + Unicode NFKC",
    output: s1,
    changed: s1 !== handle,
    note: handle.normalize("NFKC") !== handle ? "Styled Unicode letters converted" : undefined,
  });
  if (handle.normalize("NFKC") !== handle) variations.push("Styled Unicode letters");

  let { out: s2, swaps } = mapGlyphs(s1, oneAs);
  if (multi) {
    for (const [from, to] of MULTI_GLYPHS) {
      if (s2.includes(from)) {
        s2 = s2.split(from).join(to);
        swaps++;
      }
    }
  }
  steps.push({
    label: "Homoglyph and leetspeak map",
    output: s2,
    changed: swaps > 0,
    note: swaps ? `${swaps} look-alike character${swaps > 1 ? "s" : ""} replaced` : undefined,
  });
  if (swaps) variations.push("Homoglyph / leetspeak");

  const tokens = s2.split(SEPARATORS).filter(Boolean);
  const joined = tokens.join("");
  steps.push({
    label: "Remove separators",
    output: tokens.join(" · "),
    changed: joined !== s2,
    note: joined !== s2 ? `${tokens.length} token${tokens.length > 1 ? "s" : ""}` : undefined,
  });
  if (joined !== s2) variations.push("Spacing / separators");

  const { kept, removed } = stripFillers(tokens, brandTokens);
  const core = kept.join("");
  steps.push({
    label: "Strip filler words",
    output: core,
    changed: removed.length > 0,
    note: removed.length ? `Removed: ${removed.join(", ")}` : undefined,
  });
  if (removed.length) variations.push("Added words");

  return { steps, core, variations };
}

export function analyseName(input: string, aliases: string[]): LookalikeResult {
  const brandTokens = new Set<string>();
  const aliasCores = new Set<string>();
  for (const a of aliases) {
    const toks = a.toLowerCase().split(SEPARATORS).filter(Boolean);
    toks.forEach((t) => brandTokens.add(t));
    aliasCores.add(toks.join(""));
  }

  const candidates: Candidate[] = [
    normalise(input, brandTokens, "l", false),
    normalise(input, brandTokens, "i", false),
    normalise(input, brandTokens, "l", true),
  ];

  let best: LookalikeResult | null = null;

  for (const cand of candidates) {
    for (const alias of aliasCores) {
      const r = matchCore(input, cand, alias);
      if (!best || r.score > best.score) best = r;
    }
  }
  return best!;
}

function matchCore(input: string, cand: Candidate, alias: string): LookalikeResult {
  const { core } = cand;
  const variations = [...cand.variations];
  const guards: string[] = [];
  const longEnough = alias.length >= 6;
  let method = "No match";
  let score = 0;

  if (!core) {
    method = "Nothing left after normalisation";
  } else if (core === alias) {
    method = "Exact match after normalisation";
    score = variations.length ? 0.95 : 1;
  } else {
    const dist = damerau(core, alias);
    const jw = jaroWinkler(core, alias);
    if (longEnough && dist > 1 && core.includes(alias)) {
      const rest = core.replace(alias, "");
      method = "Contains brand name plus other text";
      score = 0.6;
      guards.push(`Extra text "${rest}" is not a known filler word, so this is only a partial match`);
    } else if (longEnough && dist === 1) {
      const swap = isAdjacentSwap(core, alias);
      method = swap ? "Character swap (edit distance 1)" : "One letter changed, missing or doubled";
      variations.push(swap ? "Character swap" : "Missing / doubled letter");
      score = swap ? 0.9 : 0.88;
    } else if (longEnough && jw >= 0.92) {
      method = `Jaro-Winkler ${jw.toFixed(2)}`;
      variations.push("Close spelling");
      score = 0.88;
    } else {
      method = `Jaro-Winkler ${jw.toFixed(2)}, edit distance ${dist}`;
      score = Math.max(0, Math.min(0.55, ((jw - 0.7) / 0.3) * 0.55));
    }
    if (!longEnough && dist > 0) {
      guards.push(`"${alias}" is shorter than 6 letters, so only an exact match counts`);
      score = Math.min(score, 0.3);
    }
  }

  if (COMMON_WORDS.includes(core) && core !== alias) {
    guards.push(`"${core}" is an ordinary word or name, so name similarity alone stays Low`);
    score = Math.min(score, 0.3);
  }

  const verdict: Verdict = score >= 0.85 ? "match" : score >= 0.6 ? "partial" : "no_match";
  const explanation =
    verdict === "match"
      ? "Strong look-alike. On a live profile this needs one more signal (logo, claims, publisher or scam behaviour) to reach High."
      : verdict === "partial"
        ? "Shares the brand name but with unrelated text. Shown for review, not flagged on name alone."
        : "Not a look-alike of the brand name.";

  return {
    input,
    steps: cand.steps,
    core,
    alias,
    method,
    score: Math.round(score * 100) / 100,
    verdict,
    variations: verdict === "no_match" ? [] : Array.from(new Set(variations)),
    guards,
    explanation,
  };
}
