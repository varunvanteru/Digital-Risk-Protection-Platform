import type { DetectionClass, DetectionStatus, Platform } from "./types";

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  x: "X",
  threads: "Threads",
  linkedin: "LinkedIn",
  telegram: "Telegram",
  snapchat: "Snapchat",
  youtube: "YouTube",
  sharechat: "ShareChat",
  moj: "Moj",
  josh: "Josh",
  pinterest: "Pinterest",
  reddit: "Reddit",
  quora: "Quora",
  discord: "Discord",
  google_play: "Google Play",
  app_store: "App Store",
  apk_site: "APK site",
};

/** Grouping used by the platform pickers. */
export const PLATFORM_GROUPS: { label: string; platforms: Platform[] }[] = [
  { label: "Social and messaging", platforms: ["instagram", "facebook", "whatsapp", "x", "threads", "linkedin", "telegram", "snapchat"] },
  { label: "Video and Indian short video", platforms: ["youtube", "sharechat", "moj", "josh"] },
  { label: "Communities", platforms: ["pinterest", "reddit", "quora", "discord"] },
  { label: "App stores", platforms: ["google_play", "app_store", "apk_site"] },
];

export const ALL_PLATFORMS: Platform[] = PLATFORM_GROUPS.flatMap((g) => g.platforms);

/** Platforms whose handles are written with a leading @. */
const AT_HANDLES = new Set<Platform>(["instagram", "x", "threads", "telegram", "youtube", "sharechat", "moj", "josh"]);

export const CLASS_LABEL: Record<DetectionClass, string> = {
  impersonation: "Impersonation",
  fake_page: "Fake brand page",
  scam: "Scam account",
  lookalike_app: "Look-alike app",
  low_risk: "Low-risk mention",
};

export const STATUS_LABEL: Record<DetectionStatus, string> = {
  open: "Open",
  confirmed: "Confirmed",
  takedown_requested: "Takedown requested",
  false_positive: "False positive",
  official: "Marked official",
};

const IST = "Asia/Kolkata";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Day, month and year in IST. Built by hand so every locale prints "Sep", never "Sept". */
function istParts(iso: string) {
  const p = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: IST }).formatToParts(new Date(iso));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

export function formatDate(iso: string) {
  const { y, m, d } = istParts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatShortDate(iso: string) {
  const { m, d } = istParts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST }).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return `${formatShortDate(iso)}, ${formatTime(iso)}`;
}

export function formatCount(n: number) {
  return new Intl.NumberFormat("en-IN", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

/** Days between an ISO date and the demo "today". */
export function ageInDays(iso: string, today = "2026-10-10") {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(iso)) / 864e5));
}

export function handleDisplay(platform: Platform, handle: string) {
  if (AT_HANDLES.has(platform)) return `@${handle}`;
  if (platform === "facebook" || platform === "linkedin") return `/${handle}`;
  if (platform === "reddit") return `u/${handle}`;
  return handle;
}
