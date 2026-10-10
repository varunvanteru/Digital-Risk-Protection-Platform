/**
 * Official-asset verification. Runs BEFORE any risk signal is computed.
 *
 * A candidate that is verified (or likely) official never reaches scoring. The
 * check is generic: it uses only the brand profile and what the stores report
 * about the brand's own validated apps. No brand names appear in this code.
 *
 *   L1  exact official app ID / handle on the allowlist                 -> OFFICIAL
 *   L2  store / profile URL resolves to an allowlisted ID              -> OFFICIAL
 *   L3  published by a verified official developer account (store ID)  -> OFFICIAL
 *   L4  official publisher NAME (normalised) + supporting metadata,
 *       and no known developer ID on that store contradicts it          -> LIKELY_OFFICIAL
 *   L5  cross-store twin: same title as a VERIFIED official app on another
 *       store, same icon, established audience, nothing contradicting   -> LIKELY_OFFICIAL
 *
 * Port of backend/app/detection/official.py.
 */

import type { Candidate } from "../connectors/base";
import { identityFromUrl } from "../services/urls";
import { pyRound, thousands } from "../util";
import type { BrandContext } from "./context";
import { publisherIdsFor } from "./context";

// Legal-form words that do not identify a company. Meaningful words (Technologies,
// Bank, Payments) are kept, so "ZentraPay Technologies" != "ZentraPay".
const LEGAL_SUFFIXES = new Set([
  "pvt", "private", "ltd", "limited", "llp", "llc", "inc", "incorporated", "corp", "corporation",
  "co", "company", "plc", "gmbh", "ag", "sa", "sas", "srl", "bv", "nv", "pte", "pty", "oy", "ab", "kk", "lp", "the",
]);

/** 'PhonePe Private Limited', 'PHONEPE PVT. LTD.' and 'PhonePe' all become 'phonepe'. */
export function normalizePublisher(name: string | null | undefined): string {
  if (!name) return "";
  const s = name.normalize("NFKC").toLowerCase().split("&").join(" and ").replace(/[^\p{L}\p{N}_\s]/gu, " ");
  return s
    .split(/\s+/u)
    .filter((t) => t && !LEGAL_SUFFIXES.has(t))
    .join(" ");
}

/** Store titles compared across stores: case, punctuation and spacing ignored. */
export function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, "");
}

// An established audience (installs or ratings) that impersonation apps do not reach before removal.
export const ESTABLISHED_AUDIENCE = 100_000;

/** com.phonepe.app.business -> com.phonepe; in.co.example.app -> in.co.example. */
export function packageNamespace(packageId: string | null | undefined): string | null {
  if (!packageId || !packageId.includes(".")) return null;
  const parts = packageId.toLowerCase().split(".");
  if (parts.length >= 3 && parts[0].length === 2 && ["co", "com", "org", "net", "ac", "gov"].includes(parts[1])) {
    return parts.slice(0, 3).join(".");
  }
  return parts.slice(0, 2).join(".");
}

export interface OfficialMatch {
  status: "OFFICIAL" | "LIKELY_OFFICIAL";
  level: number;
  confidence: number;
  evidence: string[];
  inProfile: boolean; // already on the allowlist (vs discovered)
}

/** Positive identity check. Returns null when the candidate is not shown to be official. */
export function verifyOfficial(
  c: Candidate,
  ctx: BrandContext,
  nameScore: number | null = null,
  iconScore: number | null = null,
  scamIndicators = false,
): OfficialMatch | null {
  // L1: exact ID / handle
  if (ctx.allowlist.has(`${c.platform}|${c.identifier}`)) {
    const what = c.channel === "app" ? "app ID" : "handle";
    return {
      status: "OFFICIAL", level: 1, confidence: 1.0,
      evidence: [`Official ${what} ${c.handle} is on the brand allowlist`, "Excluded before risk scoring"],
      inProfile: true,
    };
  }

  // L2: the store / profile URL resolves to an allowlisted ID
  if (c.url) {
    const ident = identityFromUrl(c.url);
    if (ident && ctx.allowlist.has(`${ident[0]}|${ident[1]}`)) {
      return {
        status: "OFFICIAL", level: 2, confidence: 1.0,
        evidence: [`Store or profile URL matches an official asset (${ident[1]})`, "Excluded before risk scoring"],
        inProfile: true,
      };
    }
  }

  if (c.channel !== "app") return null; // social profiles are official only by allowlist (badges can be bought)

  const knownIds = publisherIdsFor(ctx, c.platform);

  // L3: verified developer account
  if (c.publisherId && knownIds.has(c.publisherId)) {
    return {
      status: "OFFICIAL", level: 3, confidence: 0.97,
      evidence: [
        `Published by the official developer account on this store (ID ${c.publisherId})`,
        "Developer account verified from the brand's own validated app",
        "Excluded before risk scoring",
      ],
      inProfile: false,
    };
  }

  // L4: official publisher name + supporting metadata, no contradicting developer ID.
  // A weak identity match never outweighs scam evidence (OTP/PIN/KYC asks, care-number claims).
  const pub = normalizePublisher(c.publisher);
  if (pub && ctx.publisherNames.has(pub) && !scamIndicators) {
    const contradicted = knownIds.size > 0 && !!c.publisherId && !knownIds.has(c.publisherId);
    if (contradicted) {
      // On the App Store the seller is the legal entity Apple verifies for organisation accounts,
      // so the official company name there means another account of the same company.
      // On Google Play the developer name is free text: a copy there is impersonation.
      if (c.platform !== "app_store") return null;
      return {
        status: "LIKELY_OFFICIAL", level: 4, confidence: 0.75,
        evidence: [
          `App Store seller “${c.publisher}” is the official company (seller names are verified by Apple)`,
          `Published from another developer account of the same company (ID ${c.publisherId})`,
          "Excluded before risk scoring; confirm and add to the profile",
        ],
        inProfile: false,
      };
    }
    const support: string[] = [];
    const ns = c.platform === "google_play" ? packageNamespace(c.identifier) : null;
    if (ns && ctx.officialNamespaces.has(ns)) support.push(`App ID shares the official namespace ${ns}`);
    if (nameScore !== null && nameScore >= 0.85) support.push("Title carries the brand name");
    if (iconScore !== null && iconScore >= 0.8) support.push(`Icon matches the official icon (${pyRound(iconScore * 100)}%)`);
    if (support.length) {
      return {
        status: "LIKELY_OFFICIAL", level: 4, confidence: Math.min(0.9, 0.6 + 0.12 * support.length),
        evidence: [
          `Publisher “${c.publisher}” matches the official publisher`,
          ...support,
          "Excluded before risk scoring; confirm and add to the profile",
        ],
        inProfile: false,
      };
    }
  }

  // L5: the same app on another store under the company's legal entity (a different publisher name)
  if (
    !scamIndicators &&
    !(knownIds.size > 0 && c.publisherId && !knownIds.has(c.publisherId)) &&
    c.audience >= ESTABLISHED_AUDIENCE &&
    iconScore !== null &&
    iconScore >= 0.9 &&
    ctx.officialTitles.has(normalizeTitle(c.displayName))
  ) {
    return {
      status: "LIKELY_OFFICIAL", level: 5, confidence: 0.8,
      evidence: [
        `Same title as a verified official app on another store (“${c.displayName}”)`,
        `Icon matches the official icon (${pyRound(iconScore * 100)}%)`,
        `Established audience (${thousands(c.audience)} installs or ratings)`,
        `Publisher “${c.publisher ?? "None"}” is not on record yet: confirm and add to the profile`,
        "Excluded before risk scoring",
      ],
      inProfile: false,
    };
  }
  return null;
}
