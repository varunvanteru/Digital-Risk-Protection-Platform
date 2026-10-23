/** Resolve profile and store URLs to [platform, identifier]. Port of services/urls.py. */

export const HOSTS: Record<string, string> = {
  "instagram.com": "instagram",
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "whatsapp.com": "whatsapp",
  "x.com": "x",
  "twitter.com": "x",
  "threads.net": "threads",
  "threads.com": "threads",
  "linkedin.com": "linkedin",
  "t.me": "telegram",
  "telegram.me": "telegram",
  "snapchat.com": "snapchat",
  "youtube.com": "youtube",
  "sharechat.com": "sharechat",
  "mojapp.in": "moj",
  "myjosh.in": "josh",
  "share.myjosh.in": "josh",
  "pinterest.com": "pinterest",
  "in.pinterest.com": "pinterest",
  "quora.com": "quora",
  "discord.gg": "discord",
  "discord.com": "discord",
  "play.google.com": "google_play",
  "apps.apple.com": "app_store",
};

// Path words that come before the handle, e.g. linkedin.com/company/<h>, youtube.com/c/<h>
const PATH_PREFIXES = new Set(["company", "in", "add", "profile", "user", "u", "r", "c", "channel", "invite", "user-profile"]);

export interface ParsedQuery {
  raw: string;
  name: string; // what we search for
  platform: string | null; // platform of a pasted URL
  identifier: string | null; // handle / package id of a pasted URL
}

/** Lenient split like Python's urlparse: hostname (lowercased), path and query. */
function urlParts(s: string): { host: string; path: string; query: string } {
  const rest = s.slice(s.indexOf("://") + 3);
  const cut = rest.search(/[/?#]/);
  const netloc = cut < 0 ? rest : rest.slice(0, cut);
  let tail = cut < 0 ? "" : rest.slice(cut);
  const hash = tail.indexOf("#");
  if (hash >= 0) tail = tail.slice(0, hash);
  const qi = tail.indexOf("?");
  const path = qi >= 0 ? tail.slice(0, qi) : tail;
  const query = qi >= 0 ? tail.slice(qi + 1) : "";
  const hostPort = netloc.slice(netloc.lastIndexOf("@") + 1);
  const host = (hostPort.startsWith("[") ? hostPort.slice(1, hostPort.indexOf("]")) : hostPort.split(":")[0]).toLowerCase();
  return { host, path, query };
}

function queryParam(query: string, key: string): string {
  for (const part of query.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = decodeURIComponent(part.slice(0, eq).replace(/\+/g, " "));
    const v = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    if (k === key && v) return v;
  }
  return "";
}

const strip = (s: string, prefix: string) => (s.startsWith(prefix) ? s.slice(prefix.length) : s);

export function parseQuery(raw: string): ParsedQuery {
  const s = raw.trim();
  const looksLikeUrl = s.includes("://") || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(s);
  if (looksLikeUrl) {
    const u = urlParts(s.includes("://") ? s : "https://" + s);
    let host = strip(strip(u.host, "www."), "m.");
    if (!(host in HOSTS) && (host.match(/\./g) ?? []).length > 1) host = host.slice(host.indexOf(".") + 1); // e.g. in.pinterest.com
    const platform = HOSTS[host] ?? null;
    if (platform === "google_play") {
      let pkg = "";
      try {
        pkg = queryParam(u.query, "id");
      } catch {
        pkg = "";
      }
      if (pkg) {
        // com.zentrapay.app -> "zentrapay": the most distinctive segment
        const parts = pkg.split(".").filter((p) => !["com", "in", "app", "android", "org", "net", "co"].includes(p));
        return { raw: s, name: parts.length ? parts[0] : pkg, platform, identifier: pkg.toLowerCase() };
      }
    }
    let segments = u.path.split("/").filter(Boolean);
    if (platform !== "app_store" && platform !== "google_play") segments = segments.filter((p) => !PATH_PREFIXES.has(p.toLowerCase()));
    if (platform === "app_store") {
      const appId = segments.find((p) => /^id\d+$/.test(p)) ?? null;
      const name = segments.find((p) => p !== "app" && p !== appId && !/^[a-z]{2}$/.test(p)) ?? appId ?? s;
      return { raw: s, name: name.split("-").join(" "), platform, identifier: appId };
    }
    if (segments.length) {
      const handle = strip(segments[0], "@");
      return { raw: s, name: handle, platform, identifier: handle.toLowerCase() };
    }
  }
  const handle = strip(s, "@");
  return { raw: s, name: handle, platform: null, identifier: null };
}

/** ["google_play", "com.brand.app"] for a Play URL, ["instagram", "brand"] for a profile, else null. */
export function identityFromUrl(url: string): [string, string] | null {
  const q = parseQuery(url);
  if (q.platform && q.identifier) return [q.platform, q.identifier];
  return null;
}
