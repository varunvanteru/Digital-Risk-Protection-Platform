/**
 * Text signals: description similarity, impersonation claims, scam behaviour, domains.
 * Port of backend/app/detection/text.py.
 *
 * Python's \b and \d are Unicode-aware and its $ also matches before a final
 * newline; re() rewrites patterns so JavaScript behaves the same way.
 */

import { daysBetween, pyRound } from "../util";
import { HOMOGLYPHS, damerau } from "./lookalike";

const W = "[\\p{L}\\p{N}_]";
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;

/** Compile a Python-style pattern: Unicode \b and \d, Python's end-of-string $. */
export function re(pattern: string, flags = ""): RegExp {
  const src = pattern
    .replace(/\\b/g, B)
    .replace(/\\d/g, "\\p{Nd}")
    .replace(/\$$/, "(?=\\n?$)");
  return new RegExp(src, flags.includes("u") ? flags : flags + "u");
}

const STOPWORDS = new Set(
  `a an and are as at be by for from has have in is it its of on or our so that the this to was we will with you your
    all any can do get just more now one up us very`.split(/\s+/),
);

const TOKEN = /[a-z0-9₹]+/gu;

function tokens(text: string): string[] {
  return (text.toLowerCase().match(TOKEN) ?? []).filter((t) => !STOPWORDS.has(t) && Array.from(t).length > 1);
}

function counter(ts: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of ts) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Cosine similarity of word counts, blended with shared 3-word phrases to catch copied sentences. */
export function textSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0.0;
  const ca = counter(ta);
  const cb = counter(tb);
  let dot = 0;
  for (const [w, v] of ca) dot += v * (cb.get(w) ?? 0);
  let sa = 0;
  for (const v of ca.values()) sa += v * v;
  let sb = 0;
  for (const v of cb.values()) sb += v * v;
  const cos = dot / (Math.sqrt(sa) * Math.sqrt(sb));
  const grams = (t: string[]) => {
    const s = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) s.add(t.slice(i, i + 3).join("\u0000"));
    return s;
  };
  const ga = grams(ta);
  const gb = grams(tb);
  let shared = 0.0;
  if (ga.size && gb.size) {
    let inter = 0;
    for (const x of ga) if (gb.has(x)) inter++;
    shared = inter / Math.max(1, Math.min(ga.size, gb.size));
  }
  return pyRound(Math.min(1.0, 0.7 * cos + 0.3 * shared), 3);
}

const CLAIM_PATTERNS: [string, RegExp][] = [
  ["official", re("\\bofficial\\b")],
  ["support", re("\\b(support|help ?desk|helpdesk)\\b")],
  ["helpline", re("\\b(helpline|customer care|care centre|care center|toll ?free)\\b")],
  ["verified", re("\\b(verified|authori[sz]ed)\\b")],
  ["desk", re("\\b(refund desk|complaint|grievance)\\b")],
];

const CONTEXT_PATTERNS: [string, RegExp][] = [
  ["parody", re("\\bparody\\b")],
  ["fan", re("\\b(unofficial|fan ?page|fan account|not affiliated)\\b")],
  ["news", re("\\b(news|independent coverage)\\b")],
  ["review", re("\\breviews?\\b")],
];

export function contextLabel(text: string): string | null {
  const t = text.toLowerCase();
  for (const [label, pat] of CONTEXT_PATTERNS) if (pat.test(t)) return label;
  return null;
}

// In a store description, ordinary words like "support" or "verified" describe features.
// Only explicit contact claims count there.
export const APP_DESCRIPTION_CLAIMS = re(
  "\\b(customer care|helpline|toll ?free|support)\\s*(number|no\\b|contact|whatsapp)|\\bofficial (help|helpline|customer care|support)\\b",
  "i",
);

const UNOFFICIAL = re("\\b(unofficial|not affiliated)\\b");

/**
 * How strongly an unverified account or app presents itself as the brand's own channel.
 * scope "profile": name + bio. scope "app": title, plus explicit contact claims in the description.
 */
export function claimsSignal(name: string, bio: string, verified: boolean, scope: "profile" | "app" = "profile"): [number, string[]] {
  if (verified) return [0.0, []];
  if (scope === "app") {
    const m = (bio || "").match(APP_DESCRIPTION_CLAIMS);
    bio = m ? m[0] : "";
  }
  const text = `${name} ${bio}`.toLowerCase();
  if (UNOFFICIAL.test(text)) return [0.0, []];
  const hits = CLAIM_PATTERNS.filter(([, pat]) => pat.test(text)).map(([k]) => k);
  const score = Math.min(1.0, 0.35 * hits.length + (hits.includes("official") ? 0.25 : 0.0));
  return [pyRound(score, 2), hits];
}

const CREDENTIAL = re("\\b(otp|upi pin|pin|password|cvv|kyc|screen ?shar\\w*|anydesk|teamviewer|remote access)\\b");
const PAYMENT = re("(registration fee|processing fee|entry fee|vip entry|pay ₹|deposit|advance fee)");
const LURE = re("\\b(cashback|giveaway|win|spin|guaranteed|3x|returns|blocked|limited seats|refund|reverse|instant loan|claim)\\b");
export const OFF_PLATFORM = re("(wa\\.me|whatsapp|t\\.me/|\\+?91[\\s-]?\\d{10}|\\b\\d{10}\\b)");
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "cutt.ly", "t.ly", "rb.gy", "is.gd", "shorturl.at"]);
const FREE_HOSTS = ["sites.google.com", "blogspot.", "wixsite.com", "weebly.com", "000webhost", "github.io"];

/** Host name of a link, lowercased, without "www.", parsed leniently like Python's urlparse. */
export function domainOf(link: string): string {
  let s = link.trim();
  if (!s.includes("://")) s = "http://" + s;
  const afterScheme = s.slice(s.indexOf("://") + 3);
  let netloc = afterScheme.split(/[/?#]/)[0];
  netloc = netloc.slice(netloc.lastIndexOf("@") + 1);
  let host: string;
  if (netloc.startsWith("[")) host = netloc.slice(1, netloc.indexOf("]") > 0 ? netloc.indexOf("]") : undefined);
  else host = netloc.split(":")[0];
  host = host.toLowerCase();
  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * The full brand names a look-alike domain would borrow: the official domains' names (zentrapay
 * from zentrapay.com) and the brand aliases, minus any alias that is only a fragment of a longer
 * one ("zentra" inside "zentrapay"). A fragment is often an ordinary word that other companies
 * use for their own sites (zentra.co, zentrapos.com), so it is not evidence of copying.
 */
export function domainCores(officialDomains: string[], brandCores: string[]): string[] {
  const all = [...brandCores, ...officialDomains.map((d) => d.split(".")[0].replace(/[^a-z0-9]/g, ""))];
  const long = [...new Set(all.filter((c) => Array.from(c).length >= 5))];
  return long.filter((c) => !long.some((o) => o !== c && o.includes(c)));
}

/** A domain that is not official but borrows or misspells the brand name. Needs known official domains. */
export function isLookalikeDomain(domain: string, officialDomains: string[], brandCores: string[]): boolean {
  if (!officialDomains.length) return false; // without the real domain on record, the brand's own site would look like a copy
  if (!domain || officialDomains.includes(domain) || officialDomains.some((d) => domain.endsWith("." + d))) return false;
  // Undo look-alike characters first, so ph0nepe-rewards.top reads as phonepe...
  let first = "";
  for (const ch of domain.split(".")[0]) first += ch === "1" ? "l" : (HOMOGLYPHS[ch] ?? ch);
  const label = first.replace(/[^a-z0-9]/g, "");
  for (const core of domainCores(officialDomains, brandCores)) {
    // One typo for a short name (zentrapaay), two for a long one; more reads as a different name (zentrapos).
    const typos = Array.from(core).length >= 10 ? 2 : 1;
    if (label.includes(core) || damerau(label, core) <= typos) return true;
  }
  for (const od of officialDomains) if (damerau(domain, od) <= 1) return true;
  return false;
}

/** Scam behaviour for social profiles. Returns score, reasons and look-alike-domain flag. */
export function behaviourSignal(
  bio: string,
  links: string[],
  createdOn: string | null,
  audience: number,
  today: string,
  officialDomains: string[],
  brandCores: string[],
): [number, string[], boolean] {
  const text = `${bio} ${links.join(" ")}`.toLowerCase();
  let score = 0.0;
  const reasons: string[] = [];

  let m = text.match(CREDENTIAL);
  if (m) {
    score += 0.45;
    reasons.push(`Asks for sensitive details (“${m[0]}”)`);
  }
  if (PAYMENT.test(text)) {
    score += 0.35;
    reasons.push("Asks for an upfront payment or fee");
  }
  m = text.match(LURE);
  if (m) {
    score += 0.2;
    reasons.push(`Uses lure or urgency wording (“${m[0]}”)`);
  }
  if (OFF_PLATFORM.test(text)) {
    score += 0.15;
    reasons.push("Moves the conversation to WhatsApp, Telegram or a phone number");
  }

  let lookalike = false;
  for (const link of links) {
    const d = domainOf(link);
    if (SHORTENERS.has(d)) {
      score += 0.15;
      reasons.push(`Links to a URL shortener (${d})`);
    } else if (isLookalikeDomain(d, officialDomains, brandCores)) {
      lookalike = true;
      reasons.push(`Links to ${d}, a look-alike of an official domain`);
    }
  }

  if (createdOn) {
    const age = daysBetween(createdOn, today);
    if (age < 30 && audience < 500) {
      score += 0.2;
      reasons.push(`Account is ${age} days old with ${audience} followers`);
    }
  }

  return [pyRound(Math.min(1.0, score), 2), reasons, lookalike];
}

// An actual request for secrets ("share your OTP", "enter the UPI PIN"), not a mention of one.
// Genuine apps write "set your UPI PIN" or "never share your OTP"; those must not count.
const CREDENTIAL_ASK = re(
  "\\b(share|send|enter|provide|submit|tell us|dm(?: us)?|whatsapp)\\b[^.!?\\n]{0,40}?\\b(otp|upi pin|pin|password|cvv|card number)\\b",
  "gi",
);
const NEGATION = re("\\b(never|not|don't|do not|won't|will not|no one|nobody)\\b[^.!?\\n]{0,25}$", "i");

/** First request for secrets in the text that is not negated, or null. Windows count code points, as in Python. */
export function credentialAsk(text: string): string | null {
  const t = text || "";
  CREDENTIAL_ASK.lastIndex = 0;
  for (const m of t.matchAll(CREDENTIAL_ASK)) {
    const before = Array.from(t.slice(0, m.index));
    const window = before.slice(Math.max(0, before.length - 40)).join("");
    if (!NEGATION.test(window)) return m[0];
  }
  return null;
}

const HIGH_RISK_APP = re("\\b(loan|instant cash|credit line|mod|pro unlocked|hack|apk)\\b");

/** Risk context for apps: new, tiny, high-risk category, weak privacy policy, sideloaded. */
export function appRiskSignal(
  title: string,
  description: string,
  released: string | null,
  installs: number,
  privacyUrl: string | null,
  sideloaded: boolean,
  today: string,
): [number, string[]] {
  let score = 0.0;
  const reasons: string[] = [];
  if (released) {
    const age = daysBetween(released, today);
    if (age < 30) {
      score += 0.3;
      reasons.push(`Released ${age} days ago`);
    }
  }
  if (installs > 0 && installs < 1000) {
    score += 0.2;
    reasons.push("Fewer than 1,000 installs");
  }
  const ask = credentialAsk(`${title}. ${description}`);
  if (ask) {
    score += 0.4;
    reasons.push(`Asks users for sensitive details (“${ask}”)`);
  }
  const m = `${title} ${description}`.toLowerCase().match(HIGH_RISK_APP);
  if (m) {
    score += 0.3;
    reasons.push(`High-risk category or modified build (“${m[0]}”)`);
  }
  if (privacyUrl && FREE_HOSTS.some((h) => privacyUrl.includes(h))) {
    score += 0.2;
    reasons.push("Privacy policy hosted on a free site builder");
  }
  if (sideloaded) {
    score += 0.3;
    reasons.push("Distributed outside the official stores");
  }
  return [pyRound(Math.min(1.0, score), 2), reasons];
}
