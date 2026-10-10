/**
 * Assess one candidate against a brand: official verification first, then risk.
 *
 *   candidate -> verifyOfficial()   -> OFFICIAL / LIKELY_OFFICIAL  (stop: never scored)
 *             -> signals + scoring  -> SUSPICIOUS / LOOKALIKE / MENTION
 *
 * Port of backend/app/detection/signals.py.
 */

import type { Candidate } from "../connectors/base";
import { pyRound, unique } from "../util";
import { cores, hasPublisherInfo, publisherIdsFor, type BrandContext } from "./context";
import { compare, type ImageMatch } from "./images";
import { nameSimilarity, type LookalikeResult } from "./lookalike";
import { normalizePublisher, verifyOfficial, type OfficialMatch } from "./official";
import { scoreDetection, type Breakdown, type Signals } from "./scoring";
import {
  APP_DESCRIPTION_CLAIMS,
  OFF_PLATFORM,
  appRiskSignal,
  behaviourSignal,
  claimsSignal,
  contextLabel,
  credentialAsk,
  domainOf,
  isLookalikeDomain,
  textSimilarity,
} from "./text";

const PAGE_PLATFORMS = new Set(["facebook", "telegram", "whatsapp", "linkedin", "youtube", "pinterest", "discord", "quora"]);

export type Status = "OFFICIAL" | "LIKELY_OFFICIAL" | "SUSPICIOUS" | "LOOKALIKE" | "MENTION";

export interface Evaluation {
  status: Status;
  signals: Signals;
  reasons: string[];
  lookalikeDomain: boolean;
  contextLabel: string | null;
  mark: string;
  cls: string;
  breakdown: Breakdown | null; // null for official assets: they are never scored
  official: OfficialMatch | null;
  checks: Record<string, unknown>;
  nameDetail: LookalikeResult;
}

export const excluded = (ev: Evaluation) => ev.official !== null;

/** Drop search noise: keep only candidates that resemble the brand somehow. */
export function isRelevant(sig: Signals): boolean {
  return (sig.name ?? 0) >= 0.6 || (sig.logo ?? 0) >= 0.6 || (sig.text ?? 0) >= 0.5;
}

export function statusFor(severity: string): Status {
  return severity === "critical" || severity === "high" ? "SUSPICIOUS" : severity === "medium" ? "LOOKALIKE" : "MENTION";
}

const pct = (x: number) => pyRound(x * 100);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "Reels Maker for Instagram", "Stickers for WhatsApp": a tool made for the brand's platform. */
export function companionTitle(title: string, alias: string): boolean {
  if (!alias.trim()) return false;
  return new RegExp(`(?:^|\\s)(?:for|with)\\s+${escapeRe(alias.trim())}(?![\\p{L}\\p{N}])`, "iu").test(title);
}

function nameReason(r: LookalikeResult, label: string): string | null {
  if (r.score < 0.6) return null;
  if (r.method.startsWith("Brand look-alike")) return `${label} “${r.input}” contains a look-alike of the brand name`;
  if (r.method.startsWith("Exact")) {
    if (!r.variations.length) return `${label} is exactly “${r.input}”`;
    return `${label} “${r.input}” normalises to “${r.core}” (${r.variations.map((v) => v.toLowerCase()).join(", ")})`;
  }
  if (r.method.startsWith("Character swap")) return `${label} “${r.input}” swaps two letters of “${r.alias}”`;
  if (r.method.startsWith("One letter")) return `${label} “${r.input}” is one letter away from “${r.alias}”`;
  if (r.method.startsWith("Contains")) return `${label} “${r.input}” contains “${r.alias}” with unrelated words`;
  return `${label} “${r.input}” closely resembles “${r.alias}”`;
}

/** Compare with the brand logo and with the icons of its validated official apps. */
async function bestIconMatch(c: Candidate, ctx: BrandContext): Promise<ImageMatch | null> {
  const refs = unique([ctx.logoRef, ...ctx.officialIcons].filter((r): r is string => !!r));
  let best: ImageMatch | null = null;
  for (const ref of refs) {
    const m = await compare(ref, c.image);
    if (m && (best === null || m.score > best.score)) best = m;
  }
  return best;
}

export async function evaluate(c: Candidate, ctx: BrandContext, today: string): Promise<Evaluation> {
  const isApp = c.channel === "app";
  let mark = c.mark;

  // Identity inputs needed by verification (cheap, and reused by scoring)
  const [nameScore, nres] = nameSimilarity([c.displayName, c.handle], ctx.aliases);
  const icon = await bestIconMatch(c, ctx);
  const iconScore = icon ? icon.score : 0.0;

  // ---- 1. Official-asset verification. Official candidates stop here. ----
  const scamText = `${c.displayName} ${c.bio}`;
  const scamIndicators = !!(credentialAsk(scamText) || APP_DESCRIPTION_CLAIMS.test(scamText));
  const official = verifyOfficial(c, ctx, nameScore, iconScore, scamIndicators);
  if (official) {
    return {
      status: official.status,
      signals: { name: pyRound(nameScore, 3), logo: pyRound(iconScore, 3) },
      reasons: official.evidence,
      lookalikeDomain: false,
      contextLabel: null,
      mark: "official",
      cls: "official",
      breakdown: null,
      official,
      checks: {
        officialIdMatch: official.level <= 2,
        officialDeveloperMatch: official.level === 3,
        publisherMatch: official.level >= 3 ? true : null,
        nameSimilarity: pyRound(nameScore, 2),
        iconSimilarity: pyRound(iconScore, 2),
      },
      nameDetail: nres,
    };
  }

  // ---- 2. Risk signals (only for candidates that are not official) ----
  const reasons: string[] = [];
  const sig: Signals = { name: nameScore };
  const nr = nameReason(nres, isApp ? "Title" : "Name");
  if (nr) reasons.push(nr);

  sig.logo = iconScore;
  const what = isApp ? "Icon" : "Profile picture";
  if (icon && icon.score >= 0.5) {
    if (icon.kind === "mirror") reasons.push(`${what} is a mirrored copy of the official logo (${pct(icon.score)}% similar)`);
    else if (icon.kind === "recolor") reasons.push(`${what} is the official logo with the colour changed (${pct(icon.score)}% similar)`);
    else reasons.push(`${what} is ${pct(icon.score)}% similar to the official logo`);
    if (mark === "unrelated" && ["copy", "mirror", "recolor"].includes(icon.kind)) mark = icon.kind;
  }

  let publisherMatch: boolean | null = null;
  let copiedIdentity = false;
  if (isApp) {
    const ids = publisherIdsFor(ctx, c.platform);
    const nameOk = !!c.publisher && ctx.publisherNames.has(normalizePublisher(c.publisher));
    if (!hasPublisherInfo(ctx, c.platform) || !(c.publisher || c.publisherId)) {
      // Unknown is not a mismatch: no official publisher on record to compare with.
      sig.publisher = 0.0;
    } else if (ids.size && c.publisherId && !ids.has(c.publisherId)) {
      sig.publisher = 1.0;
      publisherMatch = false;
      if (nameOk) {
        copiedIdentity = true;
        reasons.push(`Uses the official publisher name “${c.publisher}” under a different developer account (${c.publisherId})`);
      } else if (sig.name >= 0.6 || sig.logo >= 0.6) {
        reasons.push(`Publisher “${c.publisher ?? "None"}” is not an official publisher`);
      }
    } else if (nameOk) {
      sig.publisher = 0.0;
      publisherMatch = true;
    } else {
      sig.publisher = 1.0;
      publisherMatch = false;
      if (sig.name >= 0.6 || sig.logo >= 0.6) reasons.push(`Publisher “${c.publisher ?? "None"}” is not an official publisher`);
    }
  }

  sig.text = ctx.description ? textSimilarity(c.bio, ctx.description) : 0.0;
  if (sig.text >= 0.5) reasons.push(`${isApp ? "Description" : "Bio"} is ${pct(sig.text)}% similar to the official description`);

  const [claims, claimHits] = claimsSignal(c.displayName, c.bio, c.verified, isApp ? "app" : "profile");
  let hits = claimHits;
  sig.claims = claims;
  if (copiedIdentity) {
    // The official company name under someone else's developer account is a direct claim to be the brand.
    sig.claims = 1.0;
    hits = [...hits, "official publisher name"];
  }
  if (sig.claims >= 0.5) reasons.push(`Presents itself as an official channel (${hits.join(", ")}) but is not on the allowlist`);

  let lookalike = false;
  let extra: string[];
  if (isApp) {
    [sig.behaviour, extra] = appRiskSignal(c.displayName, c.bio, c.createdOn, c.audience, c.privacyUrl, c.platform === "apk_site", today);
    if (ctx.domains.length) {
      // a look-alike needs a known original
      lookalike = c.links.some((link) => isLookalikeDomain(domainOf(link), ctx.domains, cores(ctx)));
      if (lookalike) extra.push("Links to a look-alike of an official domain");
    }
  } else {
    [sig.behaviour, extra, lookalike] = behaviourSignal(c.bio, c.links, c.createdOn, c.audience, today, ctx.domains, cores(ctx));
  }
  reasons.push(...extra);

  // Fan / news / review labels: profile bios, but only app titles (store descriptions mention "reviews").
  // An app titled "... for <brand>" announces a third-party companion tool, unless it also claims to
  // be an official channel or shows scam behaviour ("Refund helpline for PhonePe" stays scored).
  const companion =
    isApp && sig.claims < 0.5 && sig.behaviour < 0.4 && ctx.aliases.some((a) => companionTitle(c.displayName, a));
  const label = contextLabel(isApp ? c.displayName : c.bio) ?? (companion ? "third-party" : null);
  if (label && !reasons.length) reasons.push(`Mentions the brand but is labelled as ${label}`);
  else if (label) reasons.push(`Openly labelled as ${label}, so it is not treated as impersonation`);

  const rounded: Signals = {};
  for (const [k, v] of Object.entries(sig)) rounded[k] = pyRound(v, 3);
  const bd = scoreDetection(c.channel, rounded, lookalike, label);

  let cls: string;
  if (bd.severity === "low") cls = "low_risk";
  else if (isApp) cls = "lookalike_app";
  else if (rounded.behaviour >= 0.6) cls = "scam";
  else if (PAGE_PLATFORMS.has(c.platform)) cls = "fake_page";
  else cls = "impersonation";

  const contactText = `${c.bio} ${c.links.join(" ")}`.toLowerCase();
  const checks = {
    officialIdMatch: false,
    officialDeveloperMatch: false,
    publisherMatch,
    nameSimilarity: pyRound(rounded.name, 2),
    // null = nothing to compare with (no logo or official icon / description on record)
    iconSimilarity: ctx.logoRef || ctx.officialIcons.length ? pyRound(rounded.logo, 2) : null,
    descriptionSimilarity: ctx.description ? pyRound(rounded.text, 2) : null,
    suspiciousKeywords: hits,
    contactMismatch: OFF_PLATFORM.test(contactText) || lookalike,
  };

  return {
    status: statusFor(bd.severity),
    signals: rounded,
    reasons: reasons.length ? reasons : ["Resembles the brand on one weak signal only"],
    lookalikeDomain: lookalike,
    contextLabel: label,
    mark,
    cls,
    breakdown: bd,
    official: null,
    checks,
    nameDetail: nres,
  };
}
