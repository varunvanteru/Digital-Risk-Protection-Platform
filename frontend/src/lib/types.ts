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
  breakdown: ScoreBreakdown;
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
}

export interface BrandProfile {
  id: string;
  name: string;
  aliases: string[];
  keywords: string[];
  domains: string[];
  description: string;
  logoUrl: string | null;
  publishers: { name: string; id: string }[];
  accounts: OfficialAccount[];
  apps: OfficialApp[];
  updatedAt: string;
}

export type SourceHealth = "operational" | "degraded" | "unavailable";

export interface Source {
  id: string;
  name: string;
  platform: Platform;
  channel: Channel;
  mode: "live" | "dataset" | "manual";
  health: SourceHealth;
  lastSuccess: string | null;
  latencyMs: number | null;
  itemsLastScan: number;
  note: string | null;
  simulateOutage: boolean;
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
  possiblyOfficial: { platform: Platform; name: string; packageId: string; publisher: string; publisherId: string }[];
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
  reference: { type: "brand" | "query"; name: string };
  platforms: {
    platform: Platform;
    ok: boolean;
    found: number;
    sources: { id: string; name: string; mode: string; ok: boolean; error: string | null; latencyMs: number | null }[];
  }[];
  results: SearchResult[];
  officialSkipped: { platform: Platform; handle: string; displayName: string; url: string }[];
  nameAnalysis: QuickCheck["result"];
}