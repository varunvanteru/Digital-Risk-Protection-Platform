export type Channel = "social" | "app";

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "x"
  | "threads"
  | "linkedin"
  | "telegram"
  | "snapchat"
  | "youtube"
  | "sharechat"
  | "moj"
  | "josh"
  | "pinterest"
  | "reddit"
  | "quora"
  | "discord";

export type AppPlatform = "google_play" | "app_store" | "apk_site";

export type Platform = SocialPlatform | AppPlatform;

export type DetectionClass =
  | "impersonation"
  | "fake_page"
  | "scam"
  | "lookalike_app"
  | "low_risk";

export type DetectionStatus =
  | "open"
  | "confirmed"
  | "takedown_requested"
  | "false_positive"
  | "official";

export type Severity = "critical" | "high" | "medium" | "low";

/** Signal scores are 0..1. `publisher` only applies to apps. */
export type SignalKey = "name" | "logo" | "text" | "claims" | "behaviour" | "publisher";

export type Signals = Partial<Record<SignalKey, number>>;

/** How a suspect's avatar or icon relates to the official mark. */
export type MarkVariant =
  | "official"
  | "copy"
  | "recolor"
  | "badge"
  | "mirror"
  | "monogram"
  | "unrelated"
  | "similar";

export interface ScoreBreakdown {
  score: number;
  severity: Severity;
  parts: { key: SignalKey; value: number; weight: number; contribution: number }[];
  boosts: { label: string; amount: number }[];
  cap: string | null;
}

export interface Detection {
  id: string;
  sourceId: string;
  /** From a curated sample dataset (social platforms, APK sites, store snapshot), not a live search. */
  sample: boolean;
  channel: Channel;
  platform: Platform;
  cls: DetectionClass;
  displayName: string;
  /** Handle for social, package / track id for apps. */
  handle: string;
  url: string;
  mark: MarkVariant;
  iconUrl: string | null;
  bio: string;
  audience: number; // followers or installs
  createdAt: string | null; // ISO date the account / app appeared
  publisher: string | null;
  publisherId: string | null;
  links: string[];
  firstSeen: string;
  lastSeen: string;
  scanId: string;
  signals: Signals;
  /** Plain-English evidence, one line per signal that fired. */
  reasons: string[];
  lookalikeDomain: boolean;
  contextLabel: string | null;
  status: DetectionStatus;
  verdict: Verdict;
  checks: EvidenceChecks;
  breakdown: ScoreBreakdown;
}

/** Outcome of official verification + risk scoring. OFFICIAL / LIKELY_OFFICIAL are never scored. */
export type Verdict = "OFFICIAL" | "LIKELY_OFFICIAL" | "SUSPICIOUS" | "LOOKALIKE" | "MENTION";

/** Structured evidence behind a decision, shown as a signal table. */
export interface EvidenceChecks {
  officialIdMatch?: boolean;
  officialDeveloperMatch?: boolean;
  publisherMatch?: boolean | null;
  nameSimilarity?: number;
  iconSimilarity?: number | null;
  descriptionSimilarity?: number | null;
  suspiciousKeywords?: string[];
  contactMismatch?: boolean;
}

export interface DetectionDetail extends Detection {
  allowlisted: boolean;
  allowlistAssetId: number | null;
  events: { at: string; action: string; from: DetectionStatus | null; to: DetectionStatus | null }[];
}

export interface OfficialAccount {
  id: number;
  platform: Platform;
  handle: string;
  canonicalId: string;
  displayName: string;
  status: "official" | "partner";
  verified: boolean;
}

export interface OfficialApp {
  id: number;
  platform: Platform;
  name: string;
  packageId: string;
  publisher: string;
  publisherId: string;
  storeTitle: string | null;
  iconUrl: string | null;
  validatedAt: string | null;
  validationStatus: "verified" | "not_found" | "unavailable" | null;
  validationNote: string | null;
}

export interface BrandProfile {
  id: string;
  name: string;
  aliases: string[];
  keywords: string[];
  domains: string[];
  description: string;
  logoUrl: string | null;
  legalName: string | null;
  isActive: boolean;
  publishers: { name: string; id: string; aliases: string[] }[];
  accounts: OfficialAccount[];
  apps: OfficialApp[];
  updatedAt: string;
}

export type SourceHealth = "operational" | "degraded" | "unavailable" | "not_connected";

export interface Source {
  id: string;
  name: string;
  platform: Platform;
  channel: Channel;
  /** off: the platform has no public search, so it is never searched. */
  mode: "live" | "dataset" | "manual" | "off";
  health: SourceHealth;
  lastSuccess: string | null;
  latencyMs: number | null;
  itemsLastScan: number;
  note: string | null;
  simulateOutage: boolean;
  /** What the source actually served: never "live" for cached or simulated data. */
  state: SourceState;
}

/** not_connected: no public API for the platform, or its API key is not set; nothing is searched. */
export type SourceState = "live" | "cached" | "simulated" | "down" | "not_connected";

export interface BrandSummary {
  id: string;
  name: string;
  logoUrl: string | null;
  isActive: boolean;
  accounts: number;
  apps: number;
}

export interface AccuracyReport {
  cases: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  officialTested: number;
  officialRecognised: number;
  officialFlagged: number;
  mentionsFlagged: number;
  byBrand: Record<string, { cases: number; correct: number }>;
  rows: {
    brand: string;
    label: "official" | "fake" | "mention" | "unrelated";
    group: string;
    platform: string;
    name: string;
    handle: string;
    outcome: string;
    status: string;
    score: number;
    severity: Severity | null;
    correct: boolean;
    reason: string;
  }[];
  definition: string;
}

export interface ScanSummary {
  id: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  candidates: number;
  officialSkipped: number;
  officialFlagged: number;
  newDetections: number;
  sources: Record<string, { ok: boolean; error?: string; items?: number; kept?: number; latencyMs?: number; retries?: number }>;
  possiblyOfficial: { platform: Platform; name: string; packageId: string; publisher: string; publisherId: string; status?: "OFFICIAL" | "LIKELY_OFFICIAL" }[];
}

export interface LookalikeStep {
  label: string;
  output: string;
  changed: boolean;
  note: string | null;
}

export interface QuickCheck {
  result: {
    input: string;
    steps: LookalikeStep[];
    core: string;
    alias: string;
    method: string;
    score: number;
    verdict: "match" | "partial" | "no_match";
    variations: string[];
    guards: string[];
    explanation: string;
  };
  official: { platform: Platform; handle: string; status: "official" | "partner" } | null;
}

export interface SearchResult {
  /** From curated sample data, not a live search. */
  sample?: boolean;
  status: Verdict;
  riskScore: number;
  excluded: false;
  publisherId: string | null;
  checks: EvidenceChecks;
  platform: Platform;
  channel: Channel;
  cls: DetectionClass;
  displayName: string;
  handle: string;
  url: string;
  mark: MarkVariant;
  iconUrl: string | null;
  publisher: string | null;
  audience: number;
  reasons: string[];
  signals: Signals;
  breakdown: ScoreBreakdown;
  /** Set when the same account or app is already tracked as a detection. */
  detectionId: string | null;
}

export interface SearchResponse {
  query: string;
  searchedFor: string;
  pastedUrl: { platform: Platform; identifier: string | null } | null;
  reference: { type: "brand" | "query"; name: string; id?: string };
  platforms: {
    platform: Platform;
    ok: boolean;
    found: number;
    official: number;
    sources: { id: string; name: string; mode: string; state: SourceState; ok: boolean; error: string | null; latencyMs: number | null; cachedAt: string | null }[];
  }[];
  results: SearchResult[];
  official: OfficialResult[];
  officialSkipped: { platform: Platform; handle: string; displayName: string; url: string }[];
  nameAnalysis: QuickCheck["result"];
  /** Unregistered brands only: probable official publisher and apps, to confirm before registering. */
  suggestedOfficial: SuggestedOfficial | null;
}

export interface SuggestedOfficial {
  brandName: string;
  publishers: { platform: Platform; name: string; id: string | null }[];
  apps: { platform: Platform; packageId: string; name: string; publisher: string; publisherId: string | null; audience: number; iconUrl: string | null }[];
  description: string;
  note: string;
}
/** A candidate verified as the brand's own before scoring. Risk is always 0. */
export interface OfficialResult {
  platform: Platform;
  channel: Channel;
  handle: string;
  displayName: string;
  url: string;
  iconUrl: string | null;
  publisher: string | null;
  publisherId: string | null;
  status: "OFFICIAL" | "LIKELY_OFFICIAL";
  level: 1 | 2 | 3 | 4 | 5;
  confidence: number;
  evidence: string[];
  inProfile: boolean;
  riskScore: 0;
  excluded: true;
  checks: EvidenceChecks;
}