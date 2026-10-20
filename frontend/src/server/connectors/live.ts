/**
 * Live social connectors. Every result is a real public account found at the moment of the scan;
 * nothing here is sample data. A connector whose API key is not set reports itself as not
 * connected (notConnected) instead of returning anything.
 *
 *   Telegram    public t.me pages for usernames built from the brand name (no key needed)
 *   YouTube     YouTube Data API v3: channel search, then channel details (YOUTUBE_API_KEY)
 *   Reddit      Reddit API, app-only OAuth: user and community search (REDDIT_CLIENT_ID / _SECRET)
 *   Web search  Brave Search API, one site: query per platform, for platforms whose own search
 *               API is closed (Instagram, Facebook, X, LinkedIn, Threads, Pinterest, Quora,
 *               Snapchat, ShareChat). Finds public, indexed profiles and pages.
 *
 * WhatsApp, Discord, Moj and Josh offer no public search or API: NotConnected.
 */

import { settings } from "../config";
import { mapLimit, sleep, unique } from "../util";
import { candidate, firstChars, SourceUnavailable, type Candidate, type Connector } from "./base";

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** A source that cannot be searched at all, or whose key is missing. Never returns results. */
export class SourceNotConnected extends SourceUnavailable {}

const URL_RE = /https?:\/\/[^\s<>"')]+/g;
const linksIn = (text: string) => unique((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ""))).slice(0, 10);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
export const decodeHtml = (s: string) =>
  s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/<[^>]+>/g, "");

/** "1 374 915 subscribers", "12.5K followers", "3,201 members" -> a number. */
export function parseAudience(text: string): number {
  // A count is digits in groups of three ("1 374 915", "3,201") or a short decimal with a unit ("12.5K"),
  // directly before the word: phone numbers earlier in the text are never read as a count.
  const m = text.match(/(?<![\d.,])(\d{1,3}(?:[ ,.]\d{3})+|\d+(?:\.\d+)?)\s*([KkMmBb])?\+?\s+(subscribers|followers|members|likes|monthly visitors|subscriber|follower|member)\b/);
  if (!m) return 0;
  const unit = (m[2] ?? "").toLowerCase();
  const grouped = /[ ,.]\d{3}$/.test(m[1]) && !unit;
  const n = Number(grouped ? m[1].replace(/[ ,.]/g, "") : m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  const value = Math.round(n * (unit === "k" ? 1e3 : unit === "m" ? 1e6 : unit === "b" ? 1e9 : 1));
  return Math.min(value, 2_000_000_000); // the audience column is a 32-bit integer
}

async function getText(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<{ status: number; text: string }> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  return { status: r.status, text: await r.text() };
}

// ---------- Telegram ----------

const TG_SUFFIXES = ["", "official", "support", "care", "help", "helpdesk", "customercare", "india", "refund", "kyc", "offers", "rewards", "cashback", "updates", "team"];

/** Public usernames an impersonator would pick: the brand name with official / support / care / ... words. */
export function telegramHandles(keywords: string[], max = 30): string[] {
  const bases = unique(keywords.map((k) => k.toLowerCase().replace(/[^a-z0-9]+/g, "")).filter((b) => b.length >= 3));
  const out: string[] = [];
  for (const suffix of TG_SUFFIXES) {
    for (const base of bases) {
      for (const h of suffix ? [`${base}${suffix}`, `${base}_${suffix}`] : [base]) {
        // Telegram usernames: 5-32 characters, letters, digits and underscores, starting with a letter.
        if (/^[a-z][a-z0-9_]{4,31}$/.test(h) && !h.endsWith("_")) out.push(h);
      }
    }
  }
  return unique(out).slice(0, max);
}

const meta = (html: string, prop: string) => decodeHtml(html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`))?.[1] ?? "").trim();

/** A t.me page, or null when no account uses the username ("Telegram: Contact @name"). */
export function parseTelegramPage(html: string, handle: string, sourceId = "src_tg"): Candidate | null {
  const title = meta(html, "og:title");
  if (!title || /^Telegram: Contact @/i.test(title)) return null;
  const image = meta(html, "og:image");
  const extra = decodeHtml(html.match(/class="tgme_page_extra">([^<]*)</)?.[1] ?? "").trim();
  // Telegram's own filler for accounts without a bio is not the account's text.
  const bio = meta(html, "og:description").replace(/^You can (view and join|contact) @\S+ right away\.?$/i, "").trim();
  return candidate({
    sourceId,
    channel: "social",
    platform: "telegram",
    identifier: handle.toLowerCase(),
    handle,
    displayName: title,
    url: `https://t.me/${handle}`,
    bio,
    audience: parseAudience(extra),
    verified: /class="verified-icon"/.test(html),
    // A real photo only: not Telegram's logo, nor the generated letter tile (a data: URI).
    image: /^https:\/\//.test(image) && !/telegram\.org\/img\/t_logo/.test(image) ? image : null,
    links: linksIn(bio),
  });
}

export class TelegramLive implements Connector {
  sourceId = "src_tg";
  timeoutMs = 45_000;

  async fetch(keywords: string[]): Promise<Candidate[]> {
    const handles = telegramHandles(keywords);
    let answered = 0;
    const found: Candidate[] = [];
    // A few at a time: t.me answers slowly or not at all when hit with many requests at once.
    await mapLimit(handles, 3, async (h) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await sleep(700 * attempt);
        try {
          const { status, text } = await getText(`https://t.me/${h}`, { headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en" } });
          if (status !== 200) continue;
          answered++;
          const c = parseTelegramPage(text, h, this.sourceId);
          if (c) found.push(c);
          return;
        } catch {
          /* timeout: try again */
        }
      }
    });
    if (handles.length && answered === 0) throw new SourceUnavailable("Telegram did not answer");
    return found;
  }
}

// ---------- YouTube ----------

export class YouTubeLive implements Connector {
  sourceId = "src_yt";
  timeoutMs = 20_000;

  notConnected() {
    return settings.youtubeApiKey ? null : "Not connected: add a YouTube Data API key (YOUTUBE_API_KEY)";
  }

  private async api(path: string, params: Record<string, string>) {
    const q = new URLSearchParams({ ...params, key: settings.youtubeApiKey });
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${q}`, { signal: AbortSignal.timeout(10_000) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const reason = body?.error?.errors?.[0]?.reason as string | undefined;
      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") throw new SourceUnavailable("YouTube API daily quota used up");
      throw new SourceUnavailable(`YouTube API error ${r.status}${reason ? ` (${reason})` : ""}`);
    }
    return body;
  }

  async fetch(keywords: string[]): Promise<Candidate[]> {
    const reason = this.notConnected();
    if (reason) throw new SourceNotConnected(reason);
    // A channel search costs 100 of the 10,000 daily quota units: two searches per scan at most.
    const ids: string[] = [];
    for (const kw of keywords.slice(0, 2)) {
      const res = await this.api("search", { part: "snippet", type: "channel", maxResults: "25", q: kw, regionCode: "IN" });
      for (const it of res.items ?? []) if (it.id?.channelId) ids.push(it.id.channelId);
    }
    const unique_ = unique(ids).slice(0, 50);
    if (!unique_.length) return [];
    const res = await this.api("channels", { part: "snippet,statistics", id: unique_.join(","), maxResults: "50" });
    return (res.items ?? []).map((ch: Record<string, any>) => youtubeChannel(ch, this.sourceId)); // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function youtubeChannel(ch: Record<string, any>, sourceId = "src_yt"): Candidate {
  const sn = ch.snippet ?? {};
  const custom = typeof sn.customUrl === "string" && sn.customUrl ? sn.customUrl.replace(/^@/, "") : null;
  const handle = custom ?? ch.id;
  const description = sn.description ?? "";
  return candidate({
    sourceId,
    channel: "social",
    platform: "youtube",
    identifier: handle.toLowerCase(),
    handle,
    displayName: sn.title || handle,
    url: custom ? `https://www.youtube.com/@${custom}` : `https://www.youtube.com/channel/${ch.id}`,
    bio: firstChars(description, 2000),
    audience: ch.statistics?.hiddenSubscriberCount ? 0 : Math.trunc(Number(ch.statistics?.subscriberCount ?? 0)),
    createdOn: sn.publishedAt ? String(sn.publishedAt).slice(0, 10) : null,
    image: sn.thumbnails?.high?.url ?? sn.thumbnails?.medium?.url ?? sn.thumbnails?.default?.url ?? null,
    links: linksIn(description),
  });
}

// ---------- Reddit ----------

const REDDIT_UA = "web:impostr-brand-monitor:1.0 (digital risk protection)";
const g = globalThis as unknown as { __bsReddit?: { token: string; until: number } };

export class RedditLive implements Connector {
  sourceId = "src_reddit";
  timeoutMs = 20_000;

  notConnected() {
    return settings.redditClientId && settings.redditClientSecret ? null : "Not connected: add a Reddit app ID and secret (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET)";
  }

  private async token(): Promise<string> {
    if (g.__bsReddit && g.__bsReddit.until > Date.now() + 60_000) return g.__bsReddit.token;
    const basic = Buffer.from(`${settings.redditClientId}:${settings.redditClientSecret}`).toString("base64");
    const r = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "User-Agent": REDDIT_UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.json().catch(() => ({}));
    // Refused credentials are a setup problem, not an outage: say so instead of reporting Reddit as down.
    if (r.status === 401 || r.status === 403) {
      throw new SourceNotConnected("Not connected: Reddit refused the app ID and secret (the app may not be approved for API access yet)");
    }
    if (!r.ok || !body.access_token) throw new SourceUnavailable(`Reddit sign-in failed (${r.status})`);
    g.__bsReddit = { token: body.access_token, until: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  private async list(path: string, q: string) {
    const r = await fetch(`https://oauth.reddit.com/${path}?${new URLSearchParams({ q, limit: "25", raw_json: "1" })}`, {
      headers: { Authorization: `Bearer ${await this.token()}`, "User-Agent": REDDIT_UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new SourceUnavailable(`Reddit API error ${r.status}`);
    return ((await r.json())?.data?.children ?? []).map((c: { data: unknown }) => c.data);
  }

  async fetch(keywords: string[]): Promise<Candidate[]> {
    const reason = this.notConnected();
    if (reason) throw new SourceNotConnected(reason);
    const out = new Map<string, Candidate>();
    for (const kw of keywords.slice(0, 2)) {
      for (const u of await this.list("users/search", kw)) {
        const c = redditUser(u, this.sourceId);
        if (c && !out.has(`u|${c.identifier}`)) out.set(`u|${c.identifier}`, c);
      }
      for (const s of await this.list("subreddits/search", kw)) {
        const c = redditCommunity(s, this.sourceId);
        if (c && !out.has(`r|${c.identifier}`)) out.set(`r|${c.identifier}`, c);
      }
    }
    return [...out.values()];
  }
}

const redditIcon = (s: unknown) => (typeof s === "string" && s ? decodeHtml(s).split("?")[0] : null);
const utcDay = (secs: unknown) => (typeof secs === "number" ? new Date(secs * 1000).toISOString().slice(0, 10) : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function redditUser(u: Record<string, any>, sourceId = "src_reddit"): Candidate | null {
  if (!u?.name || u.is_suspended) return null;
  const profile = u.subreddit ?? {};
  const bio = profile.public_description ?? "";
  return candidate({
    sourceId,
    channel: "social",
    platform: "reddit",
    identifier: String(u.name).toLowerCase(),
    handle: u.name,
    displayName: profile.title || u.name,
    url: `https://www.reddit.com/user/${u.name}`,
    bio,
    audience: Math.trunc(Number(profile.subscribers ?? 0)),
    createdOn: utcDay(u.created_utc),
    verified: !!u.verified,
    image: redditIcon(u.icon_img),
    links: linksIn(bio),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function redditCommunity(s: Record<string, any>, sourceId = "src_reddit"): Candidate | null {
  if (!s?.display_name) return null;
  const bio = s.public_description ?? "";
  return candidate({
    sourceId,
    channel: "social",
    platform: "reddit",
    identifier: String(s.display_name).toLowerCase(),
    handle: `r/${s.display_name}`,
    displayName: s.title || `r/${s.display_name}`,
    url: `https://www.reddit.com/r/${s.display_name}`,
    bio,
    audience: Math.trunc(Number(s.subscribers ?? 0)),
    createdOn: utcDay(s.created_utc),
    image: redditIcon(s.community_icon) ?? redditIcon(s.icon_img),
    links: linksIn(bio),
  });
}

// ---------- Web search (Brave Search API) ----------

export const WEB_SITES: Record<string, string> = {
  instagram: "instagram.com",
  facebook: "facebook.com",
  x: "x.com",
  linkedin: "linkedin.com",
  threads: "threads.net",
  pinterest: "pinterest.com",
  quora: "quora.com",
  snapchat: "snapchat.com",
  sharechat: "sharechat.com",
};

// First path segments that are site pages, not accounts.
const RESERVED: Record<string, Set<string>> = {
  instagram: new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts", "directory", "about", "legal", "developer", "web", "popular"]),
  facebook: new Set(["watch", "events", "photo", "photo.php", "photos", "share", "story.php", "permalink.php", "help", "login", "marketplace", "gaming", "hashtag", "public", "policies", "privacy", "business", "reel", "videos", "media", "places", "search", "pages", "community", "notes", "developers", "legal", "terms", "ads", "fundraisers"]),
  x: new Set(["i", "search", "hashtag", "intent", "home", "explore", "settings", "login", "signup", "tos", "privacy", "share", "notifications", "messages"]),
  pinterest: new Set(["pin", "search", "ideas", "today", "categories", "business", "login", "_"]),
  threads: new Set(["search", "login"]),
};

/** The account handle in a profile, page or post URL on the given platform, or null for any other page. */
export function webProfileHandle(platform: string, url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|in|web)\./, "");
  const segs = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const first = segs[0] ?? "";
  const ok = (h: string | undefined, re: RegExp) => (h && re.test(h) ? h : null);
  switch (platform) {
    case "instagram":
      return RESERVED.instagram.has(first.toLowerCase()) ? null : ok(first, /^[A-Za-z0-9._]{1,30}$/);
    case "facebook":
      if (first === "people") return ok(segs[2], /^\d{5,}$/);
      if (first === "groups") return ok(segs[1], /^[A-Za-z0-9.\-]{2,}$/) && `groups/${segs[1]}`;
      return RESERVED.facebook.has(first.toLowerCase()) ? null : ok(first, /^[A-Za-z0-9.\-]{2,80}$/);
    case "x":
      return RESERVED.x.has(first.toLowerCase()) ? null : ok(first, /^[A-Za-z0-9_]{1,15}$/);
    case "linkedin":
      // Company pages keep their plain slug (as official profiles list them); people and showcase pages keep their kind.
      if (first === "company") return ok(segs[1], /^[A-Za-z0-9\-_%.]{2,100}$/);
      return first === "in" || first === "showcase" ? ok(segs[1], /^[A-Za-z0-9\-_%.]{2,100}$/) && `${first}/${segs[1]}` : null;
    case "threads":
      return first.startsWith("@") ? ok(first.slice(1), /^[A-Za-z0-9._]{1,30}$/) : null;
    case "pinterest":
      return RESERVED.pinterest.has(first.toLowerCase()) ? null : ok(first, /^[A-Za-z0-9_]{3,30}$/);
    case "quora":
      if (host !== "quora.com" && host.endsWith(".quora.com")) return ok(host.split(".")[0], /^[a-z0-9-]{2,}$/) && `space:${host.split(".")[0]}`;
      return first === "profile" ? ok(segs[1], /^[A-Za-z0-9\-]{2,}$/) : null;
    case "snapchat":
      if (first === "add") return ok(segs[1], /^[A-Za-z0-9._\-]{3,15}$/);
      return first.startsWith("@") ? ok(first.slice(1), /^[A-Za-z0-9._\-]{3,15}$/) : null;
    case "sharechat":
      return first === "profile" ? ok(segs[1], /^[A-Za-z0-9._\-]{2,}$/) : null;
  }
  return null;
}

/** The canonical public URL of an account, the way each platform writes it. */
export function webProfileUrl(platform: string, handle: string): string {
  if (handle.startsWith("groups/")) return `https://www.facebook.com/${handle}`;
  if (platform === "linkedin" && /^(in|showcase)\//.test(handle)) return `https://www.linkedin.com/${handle}`;
  if (handle.startsWith("space:")) return `https://${handle.slice(6)}.quora.com`;
  const urls: Record<string, string> = {
    instagram: `https://www.instagram.com/${handle}/`,
    facebook: /^\d+$/.test(handle) ? `https://www.facebook.com/profile.php?id=${handle}` : `https://www.facebook.com/${handle}`,
    x: `https://x.com/${handle}`,
    linkedin: `https://www.linkedin.com/company/${handle}`,
    threads: `https://www.threads.net/@${handle}`,
    pinterest: `https://www.pinterest.com/${handle}/`,
    quora: `https://www.quora.com/profile/${handle}`,
    snapchat: `https://www.snapchat.com/add/${handle}`,
    sharechat: `https://sharechat.com/profile/${handle}`,
  };
  return urls[platform];
}

/** "PhonePe (@phonepe) • Instagram photos and videos" -> "PhonePe"; "Paytm | Facebook" -> "Paytm". */
export function cleanTitle(title: string): string {
  let t = decodeHtml(title).trim();
  // A post title: "Paytm Travel Care on X: "@someone Hi ..."" -> "Paytm Travel Care".
  t = t.replace(/\s+on (X|Twitter|Threads|Instagram|Facebook|LinkedIn):\s.*$/i, "");
  t = t.split(/\s+[|•·]\s+|\s+[-–—]\s+(?=(?:Instagram|Facebook|X|Twitter|LinkedIn|Threads|Pinterest|Quora|Snapchat|ShareChat|Profile)\b)/)[0];
  t = t
    .replace(/\s*\/\s*(X|Twitter|\.\.\.|…)\s*$/i, "") // "... / X", or cut short by the search engine: "... / ..."
    .replace(/\s+on (X|Twitter|Instagram|Threads|Snapchat)\s*$/i, "")
    .replace(/\s*\((@?[^()]+)\)\s*$/, "") // "(@handle)" or "(handle)"
    .replace(/\s*(\.\.\.|…)\s*$/, "");
  return t.trim();
}

export interface WebResult {
  title: string;
  url: string;
  description: string;
}

/** Search results for one platform -> one candidate per account (posts and pages of the same account merge). */
export function webCandidates(platform: string, results: WebResult[], sourceId: string): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const r of results) {
    const handle = webProfileHandle(platform, r.url);
    if (!handle) continue;
    const id = handle.toLowerCase();
    const description = decodeHtml(r.description ?? "");
    const existing = out.get(id);
    if (existing) {
      if (!existing.bio.includes(description)) existing.bio = firstChars(`${existing.bio} ${description}`.trim(), 2000);
      existing.audience ||= parseAudience(description);
      continue;
    }
    out.set(
      id,
      candidate({
        sourceId,
        channel: "social",
        platform,
        identifier: id,
        handle,
        displayName: cleanTitle(r.title) || handle,
        url: webProfileUrl(platform, handle),
        bio: firstChars(description, 2000),
        audience: parseAudience(description),
        links: linksIn(description),
      }),
    );
  }
  return [...out.values()];
}

// The free Brave plan allows one query per second: every web-search connector shares this queue,
// and identical queries within 15 minutes are answered from memory.
const web = globalThis as unknown as { __bsBrave?: { next: number; cache: Map<string, { at: number; results: WebResult[] }> } };
const brave = () => (web.__bsBrave ??= { next: 0, cache: new Map() });

async function braveSearch(query: string): Promise<WebResult[]> {
  const b = brave();
  const hit = b.cache.get(query);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.results;
  const wait = b.next - Date.now();
  b.next = Math.max(Date.now(), b.next) + 1100;
  if (wait > 0) await sleep(wait);
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: "20", country: "IN", safesearch: "off" })}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": settings.braveApiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 429) throw new SourceUnavailable("Web search rate limit reached");
  if (r.status === 401 || r.status === 403) throw new SourceUnavailable("Web search API key was refused");
  if (!r.ok) throw new SourceUnavailable(`Web search error ${r.status}`);
  const body = await r.json();
  const results: WebResult[] = (body?.web?.results ?? []).map((x: { title?: string; url?: string; description?: string }) => ({
    title: x.title ?? "",
    url: x.url ?? "",
    description: x.description ?? "",
  }));
  b.cache.set(query, { at: Date.now(), results });
  if (b.cache.size > 500) b.cache.delete(b.cache.keys().next().value as string);
  return results;
}

export class WebSearchLive implements Connector {
  // Queued behind other platforms' queries at one per second.
  timeoutMs = 60_000;

  constructor(
    public sourceId: string,
    public platform: string,
  ) {}

  notConnected() {
    return settings.braveApiKey ? null : "Not connected: add a Brave Search API key (BRAVE_SEARCH_API_KEY)";
  }

  async fetch(keywords: string[]): Promise<Candidate[]> {
    const reason = this.notConnected();
    if (reason) throw new SourceNotConnected(reason);
    const site = WEB_SITES[this.platform];
    // Two queries per platform: the brand name, and the brand with the words impersonators use.
    const name = keywords[0];
    const results = [
      ...(await braveSearch(`${name} site:${site}`)),
      ...(await braveSearch(`${name} (official OR support OR "customer care" OR helpline) site:${site}`)),
    ];
    return webCandidates(this.platform, results, this.sourceId);
  }
}

// ---------- platforms with no public search ----------

export class NotConnected implements Connector {
  constructor(
    public sourceId: string,
    private reason: string,
  ) {}
  notConnected() {
    return this.reason;
  }
  async fetch(): Promise<Candidate[]> {
    throw new SourceNotConnected(this.reason);
  }
}
