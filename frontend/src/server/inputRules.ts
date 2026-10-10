/** Input rules for the brand profile. Port of backend/app/validation.py (mirrors src/lib/validation.ts). */

const HANDLE_RULES: Record<string, [RegExp, string]> = {
  instagram: [/^[a-z0-9._]{1,30}$/i, "Up to 30 letters, numbers, periods or underscores"],
  x: [/^[a-z0-9_]{1,15}$/i, "Up to 15 letters, numbers or underscores"],
  facebook: [/^[a-z0-9.]{5,50}$/i, "5 to 50 letters, numbers or periods"],
  telegram: [/^[a-z0-9_]{5,32}$/i, "5 to 32 letters, numbers or underscores"],
  whatsapp: [/^[a-z0-9]{10,40}$/i, "Channel ID from the channel link, 10 to 40 letters or numbers"],
  threads: [/^[a-z0-9._]{1,30}$/i, "Up to 30 letters, numbers, periods or underscores"],
  linkedin: [/^[a-z0-9-]{3,100}$/i, "Company page name from the URL: letters, numbers or hyphens"],
  snapchat: [/^[a-z][a-z0-9._-]{2,14}$/i, "3 to 15 characters, starting with a letter"],
  youtube: [/^[a-z0-9._-]{3,30}$/i, "3 to 30 letters, numbers, periods, hyphens or underscores"],
  sharechat: [/^[a-z0-9._]{3,30}$/i, "3 to 30 letters, numbers, periods or underscores"],
  moj: [/^[a-z0-9._]{3,30}$/i, "3 to 30 letters, numbers, periods or underscores"],
  josh: [/^[a-z0-9._]{3,30}$/i, "3 to 30 letters, numbers, periods or underscores"],
  pinterest: [/^[a-z0-9_]{3,30}$/i, "3 to 30 letters, numbers or underscores"],
  reddit: [/^[a-z0-9_-]{3,20}$/i, "3 to 20 letters, numbers, hyphens or underscores"],
  quora: [/^[a-z0-9-]{3,60}$/i, "Profile name from the URL: letters, numbers or hyphens"],
  discord: [/^[a-z0-9-]{2,32}$/i, "Invite code or vanity name, 2 to 32 characters"],
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", x: "X", facebook: "Facebook", telegram: "Telegram", whatsapp: "WhatsApp",
  threads: "Threads", linkedin: "LinkedIn", snapchat: "Snapchat", youtube: "YouTube", sharechat: "ShareChat",
  moj: "Moj", josh: "Josh", pinterest: "Pinterest", reddit: "Reddit", quora: "Quora", discord: "Discord",
};

export const SOCIAL_PLATFORMS = Object.keys(HANDLE_RULES);

const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;
const PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;
const TRACK_ID = /^id\d{6,12}$/;

export const cleanHandle = (raw: string) => raw.trim().replace(/^@/, "").replace(/^\//, "");

export function handleError(platform: string, handle: string): string | null {
  if (!(platform in HANDLE_RULES)) return `Unsupported platform “${platform}”`;
  if (!handle) return "Enter a handle";
  const [pattern, rule] = HANDLE_RULES[platform];
  if (!pattern.test(handle)) return `Not a valid ${PLATFORM_LABEL[platform]} handle. ${rule}.`;
  return null;
}

export function appIdError(platform: string, appId: string): string | null {
  if (platform === "google_play" && PACKAGE.test(appId)) return null;
  if (platform === "app_store" && TRACK_ID.test(appId)) return null;
  return "Use a Play package name (com.brand.app) or an App Store ID (id1234567890)";
}

export const domainError = (d: string) => (DOMAIN.test(d.trim()) ? null : `“${d}” is not a valid domain`);

export function nameError(name: string): string | null {
  const n = name.trim();
  if (!n) return "Enter the brand name";
  const len = Array.from(n).length;
  if (len < 2 || len > 60) return "Use 2 to 60 characters";
  return null;
}
