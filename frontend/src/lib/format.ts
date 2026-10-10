import type { DetectionClass, DetectionStatus, Platform } from "./types";

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  x: "X",
  facebook: "Facebook",
  telegram: "Telegram",
  google_play: "Google Play",
  app_store: "App Store",
  apk_site: "APK site",
};

export const PLATFORM_SHORT: Record<Platform, string> = {
  instagram: "IG",
  x: "X",
  facebook: "FB",
  telegram: "TG",
  google_play: "GP",
  app_store: "AS",
  apk_site: "APK",
};

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
  if (platform === "google_play" || platform === "app_store" || platform === "apk_site") return handle;
  if (platform === "facebook") return `/${handle}`;
  return `@${handle}`;
}
