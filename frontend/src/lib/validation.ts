import type { Platform } from "./types";

export const SOCIAL_PLATFORMS: { value: Platform; label: string; pattern: RegExp; rule: string }[] = [
  { value: "instagram", label: "Instagram", pattern: /^[a-z0-9._]{1,30}$/i, rule: "Up to 30 letters, numbers, periods or underscores" },
  { value: "x", label: "X", pattern: /^[a-z0-9_]{1,15}$/i, rule: "Up to 15 letters, numbers or underscores" },
  { value: "facebook", label: "Facebook", pattern: /^[a-z0-9.]{5,50}$/i, rule: "5 to 50 letters, numbers or periods" },
  { value: "telegram", label: "Telegram", pattern: /^[a-z0-9_]{5,32}$/i, rule: "5 to 32 letters, numbers or underscores" },
];

export function validateHandle(platform: Platform, raw: string, existing: { platform: Platform; handle: string }[]) {
  const handle = raw.trim().replace(/^@/, "").replace(/^\//, "");
  const spec = SOCIAL_PLATFORMS.find((p) => p.value === platform)!;
  if (!handle) return { handle, error: "Enter a handle" };
  if (!spec.pattern.test(handle)) return { handle, error: `Not a valid ${spec.label} handle. ${spec.rule}.` };
  if (existing.some((a) => a.platform === platform && a.handle.toLowerCase() === handle.toLowerCase()))
    return { handle, error: "This account is already in the profile" };
  return { handle, error: null };
}

export function validateBrandName(name: string) {
  const n = name.trim();
  if (!n) return "Enter the brand name";
  if (n.length < 2 || n.length > 60) return "Use 2 to 60 characters";
  return null;
}

export function validateDomain(d: string) {
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i.test(d.trim()) ? null : `“${d}” is not a valid domain`;
}

export function validatePackageId(id: string) {
  return /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(id.trim()) || /^id\d{6,12}$/.test(id.trim())
    ? null
    : "Use a Play package name (com.brand.app) or an App Store ID (id1234567890)";
}
