export type Channel = "social" | "app";

export type Platform =
  | "instagram"
  | "x"
  | "facebook"
  | "telegram"
  | "google_play"
  | "app_store"
  | "apk_site";

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
  | "unrelated";

export interface Detection {
  id: string;
  channel: Channel;
  platform: Platform;
  cls: DetectionClass;
  displayName: string;
  /** Handle for social, package / track id for apps. */
  handle: string;
  url: string;
  mark: MarkVariant;
  bio: string;
  audience: number; // followers or installs
  createdAt: string; // ISO date the account / app appeared
  publisher?: string;
  publisherId?: string;
  links: string[];
  firstSeen: string; // ISO datetime
  scanId: string;
  signals: Signals;
  /** Plain-English evidence, one line per signal that fired. */
  reasons: string[];
  lookalikeDomain?: boolean;
  contextLabel?: "fan" | "news" | "review" | "parody";
  status: DetectionStatus;
}

export interface OfficialAccount {
  platform: Platform;
  handle: string;
  canonicalId: string;
  displayName: string;
  status: "official" | "partner";
  verified: boolean;
}

export interface OfficialApp {
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
  lastSuccess: string;
  latencyMs: number | null;
  itemsLastScan: number;
  note?: string;
}
