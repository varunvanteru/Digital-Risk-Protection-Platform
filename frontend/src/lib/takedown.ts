import { PLATFORM_LABEL, formatDate, handleDisplay } from "@/lib/format";
import type { BrandProfile, Detection, Platform } from "@/lib/types";

/**
 * Where each platform takes impersonation or trademark reports. Each link was opened and checked by hand.
 * kind "form": the platform's own report form; "help": no public form, so its help or policy page.
 */
export const REPORT_PAGES: Partial<Record<Platform, { url: string; kind: "form" | "help"; label: string }>> = {
  google_play: { url: "https://support.google.com/legal/answer/3110420", kind: "form", label: "Google: Report content for legal reasons" },
  app_store: { url: "https://www.apple.com/legal/intellectual-property/dispute-forms/", kind: "form", label: "Apple: App Store dispute forms" },
  instagram: { url: "https://help.instagram.com/contact/636276399721841", kind: "form", label: "Instagram: Report an impersonation account" },
  threads: { url: "https://help.instagram.com/contact/636276399721841", kind: "form", label: "Threads: Report an impersonation account" },
  facebook: { url: "https://www.facebook.com/help/contact/295309487309948", kind: "form", label: "Facebook: Report an impostor account" },
  x: { url: "https://help.x.com/en/forms/authenticity/impersonation", kind: "form", label: "X: Impersonation report form" },
  youtube: { url: "https://support.google.com/youtube/answer/2801947", kind: "form", label: "YouTube: Impersonation policy and report" },
  linkedin: { url: "https://www.linkedin.com/help/linkedin/answer/a1338436", kind: "form", label: "LinkedIn: Report fake profiles" },
  pinterest: { url: "https://policy.pinterest.com/en/trademark", kind: "form", label: "Pinterest: Trademark policy and report" },
  whatsapp: { url: "https://www.whatsapp.com/legal/ip-policy", kind: "form", label: "WhatsApp: Trademark reporting" },
  reddit: { url: "https://support.reddithelp.com/hc/en-us/requests/new?ticket_form_id=360000294431", kind: "form", label: "Reddit Help: Submit a request" },
  telegram: { url: "https://telegram.org/support", kind: "help", label: "Telegram support" },
  snapchat: { url: "https://help.snapchat.com/hc/en-us/requests/new", kind: "help", label: "Snapchat Support: Submit a request" },
  quora: { url: "https://help.quora.com/hc/en-us/requests/new", kind: "help", label: "Quora Help: Submit a request" },
  discord: { url: "https://discord.com/safety/360044103651-reporting-abusive-behavior-to-discord", kind: "help", label: "Discord: How to report to Discord" },
  sharechat: { url: "https://help.sharechat.com/", kind: "help", label: "ShareChat Help" },
  moj: { url: "https://mojapp.in/", kind: "help", label: "Moj (report from the app)" },
  josh: { url: "https://myjosh.in/", kind: "help", label: "Josh (report from the app)" },
};

/** The official counterpart on the same platform, if the brand profile has one. */
function officialOn(d: Detection, brand: BrandProfile) {
  if (d.channel === "app") {
    const a = brand.apps.find((x) => x.platform === d.platform);
    return a ? `${a.name} (${a.packageId})` : null;
  }
  const a = brand.accounts.find((x) => x.platform === d.platform && x.status === "official");
  return a ? handleDisplay(a.platform, a.handle) : null;
}

/** A plain-text letter built from the detection's own evidence. Nothing is sent; the user submits it. */
export function letterText(d: Detection, brand: BrandProfile) {
  const platform = PLATFORM_LABEL[d.platform];
  const isApp = d.channel === "app";
  const owner = brand.legalName || brand.name;
  const official = officialOn(d, brand);
  return [
    `To: ${platform} Support`,
    `Subject: Impersonation and trademark infringement report: ${d.displayName} (${handleDisplay(d.platform, d.handle)})`,
    "",
    `Dear ${platform} Support team,`,
    "",
    `We are ${owner}, the owner of the ${brand.name} brand. The ${isApp ? "app" : "account"} below impersonates our brand. It is not operated by, or affiliated with, ${brand.name}.`,
    "",
    `Name: ${d.displayName}`,
    `${isApp ? "App ID" : "Handle"}: ${handleDisplay(d.platform, d.handle)}`,
    ...(isApp && d.publisher ? [`Developer: ${d.publisher}`] : []),
    `Link: ${d.url || "[link]"}`,
    ...(official ? [`Our official ${isApp ? "app" : "account"} on ${platform}: ${official}`] : []),
    "",
    "Why we believe it impersonates us:",
    ...d.reasons.slice(0, 3).map((r) => `- ${r}`),
    `- Our brand monitoring rated it ${d.breakdown.score}/100 (${d.breakdown.severity}); first seen ${formatDate(d.firstSeen)}.`,
    "",
    `It uses the ${brand.name} name${(d.signals.logo ?? 0) >= 0.5 ? " and logo" : ""} without our permission, which infringes our trademark and may mislead our customers. We request that you review it and remove it under your impersonation and trademark policies.`,
    "",
    "We can provide proof of trademark ownership and further evidence on request.",
    "",
    "Sincerely,",
    "[Your name]",
    `[Your title], ${owner}`,
    "[Email] · [Phone]",
  ].join("\n");
}
