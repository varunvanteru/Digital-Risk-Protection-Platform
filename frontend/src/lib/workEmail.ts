/**
 * Accounts are for companies: a work email is required. Shared by the sign-in page (instant feedback)
 * and the server (the actual rule). The server also checks that the company domain can receive mail.
 */

// Free personal mail services, and throwaway inboxes. Matched on the domain and its parent
// (so "mail.yahoo.co.in" and "googlemail.com" are caught too).
const PERSONAL = new Set([
  // global
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "aim.com", "proton.me", "protonmail.com", "pm.me", "zohomail.com", "gmx.com", "gmx.net",
  "gmx.de", "mail.com", "yandex.com", "yandex.ru", "mail.ru", "inbox.ru", "list.ru", "bk.ru", "tutanota.com", "tuta.io", "fastmail.com",
  "hushmail.com", "qq.com", "163.com", "126.com", "sina.com", "web.de", "t-online.de", "orange.fr", "free.fr", "libero.it", "seznam.cz",
  "naver.com", "daum.net", "hanmail.net", "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "cox.net", "earthlink.net",
  "btinternet.com", "sky.com", "virginmedia.com", "bigpond.com", "optusnet.com.au", "shaw.ca", "rogers.com", "sympatico.ca",
  // regional editions
  "yahoo.co.in", "yahoo.in", "yahoo.co.uk", "yahoo.co.jp", "yahoo.com.au", "yahoo.ca", "yahoo.fr", "yahoo.de", "yahoo.com.sg",
  "hotmail.co.uk", "hotmail.fr", "hotmail.de", "outlook.in", "outlook.co.uk", "live.in", "live.co.uk",
  // India
  "rediffmail.com", "rediff.com", "indiatimes.com", "sify.com", "vsnl.net", "in.com",
  // disposable inboxes
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "sharklasers.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "yopmail.com", "trashmail.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mintemail.com",
  "mohmal.com", "emailondeck.com", "tempmailo.com", "burnermail.io", "spamgourmet.com", "mailnesia.com", "moakt.com", "tmpmail.org",
]);

export const WORK_EMAIL_MESSAGE =
  "Please use your company email (like you@yourcompany.com). Personal addresses such as Gmail, Yahoo or Outlook aren't accepted. Just looking around? Continue as demo.";

/** Password rule for new accounts: 8 to 128 characters with at least one special character. Null when it passes. */
export function passwordError(password: string): string | null {
  if (password.length < 8) return "Use a password of at least 8 characters.";
  if (password.length > 128) return "Use a password of at most 128 characters.";
  if (!/[^A-Za-z0-9\s]/.test(password)) return "Add at least one special character to your password, such as ! @ # $ % or &.";
  return null;
}

/** The domain of an email address, lowercased, or "" when there is none. */
export const emailDomain = (email: string) => email.trim().toLowerCase().split("@")[1] ?? "";

/** True for a free personal or disposable mail service (the domain or the domain it sits under). */
export function isPersonalEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) if (PERSONAL.has(parts.slice(i).join("."))) return true;
  return false;
}
