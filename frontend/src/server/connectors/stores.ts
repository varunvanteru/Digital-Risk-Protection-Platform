/** Live app-store connectors. Both work without API keys. Port of stores.py. */

import { settings } from "../config";
import { candidate, firstChars, SourceUnavailable, type Candidate, type Connector } from "./base";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gplay = any;
let gplayModule: Promise<Gplay> | null = null;
/** google-play-scraper is ESM-only; load it once, lazily. */
export const gplay = (): Promise<Gplay> => (gplayModule ??= import("google-play-scraper").then((m) => m.default ?? m));

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Aug 29, 2016", "29 Aug 2016" or "August 29, 2016" -> "2016-08-29". */
export function parsePlayDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.trim().match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/) ?? null;
  const m2 = s.trim().match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/) ?? null;
  let mon: string, day: string, year: string;
  if (m) [, mon, day, year] = m;
  else if (m2) [, day, mon, year] = m2;
  else return null;
  const i = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
  const full = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  // Python's formats: "%b %d, %Y", "%d %b %Y", "%B %d, %Y" (full month names only in the first form)
  if (i < 0 || (mon.length > 3 && (m2 !== null && !m ? true : full[i] !== mon.toLowerCase()))) return null;
  return `${year}-${String(i + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Google Play search, then app detail for publisher ID and release date. */
export class GooglePlayLive implements Connector {
  sourceId = "src_play";
  // Play search pages are slow under load; give this connector its own budget.
  timeoutMs = 25_000;

  constructor(
    private country = "in",
    private hits = 30,
  ) {}

  async fetch(keywords: string[]): Promise<Candidate[]> {
    const seen = new Map<string, Record<string, unknown>>();
    try {
      const gp = await gplay();
      for (const kw of keywords) {
        const results = await gp.search({ term: kw, num: this.hits, lang: "en", country: this.country });
        for (const r of results) if (r.appId && !seen.has(r.appId)) seen.set(r.appId, r);
      }
    } catch (e) {
      // network, parsing or rate limiting
      throw new SourceUnavailable(`Google Play search failed: ${(e as Error).name || "Error"}`);
    }
    return [...seen].map(([appId, r]) =>
      candidate({
        sourceId: this.sourceId,
        channel: "app",
        platform: "google_play",
        identifier: appId.toLowerCase(),
        handle: appId,
        displayName: (r.title as string) || appId,
        url: `https://play.google.com/store/apps/details?id=${appId}`,
        bio: firstChars(((r.description as string) || (r.summary as string) || ""), 2000),
        publisher: (r.developer as string) || null,
        image: (r.icon as string) || null,
      }),
    );
  }

  /** App detail: publisher ID, installs, release date, privacy policy. Called only for relevant hits. */
  async enrich(c: Candidate): Promise<void> {
    let d: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const gp = await gplay();
      d = await gp.app({ appId: c.handle, lang: "en", country: this.country });
    } catch {
      return; // search fields are enough to score
    }
    if (d.title && c.displayName && d.title.trim().toLowerCase() !== c.displayName.trim().toLowerCase()) {
      // The store's own record for this ID wins over the search listing.
      c.displayName = d.title;
      c.image = d.icon || c.image;
    }
    c.bio = firstChars(d.description || c.bio, 2000);
    c.audience = Math.trunc(Number(d.maxInstalls || d.minInstalls || 0)); // maxInstalls is the real count
    c.createdOn = parsePlayDate(d.released);
    c.publisher = d.developer || c.publisher;
    c.publisherId = String(d.developerId ?? "") || null;
    c.privacyUrl = d.privacyPolicy ?? null;
    c.links = [d.privacyPolicy, d.developerWebsite].filter(Boolean);
    c.image = d.icon || c.image;
  }
}

/** Apple App Store via the public iTunes Search API. */
export class AppStoreLive implements Connector {
  sourceId = "src_appstore";

  constructor(
    private country = "in",
    private limit = 25,
  ) {}

  async fetch(keywords: string[]): Promise<Candidate[]> {
    const seen = new Map<number, Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      for (const kw of keywords) {
        const params = new URLSearchParams({ term: kw, country: this.country, entity: "software", limit: String(this.limit) });
        const r = await fetch(`https://itunes.apple.com/search?${params}`, { signal: AbortSignal.timeout(settings.sourceTimeoutMs) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        for (const item of (await r.json()).results ?? []) if (!seen.has(item.trackId)) seen.set(item.trackId, item);
      }
    } catch (e) {
      throw new SourceUnavailable(`App Store search failed: ${(e as Error).name || "Error"}`);
    }
    return [...seen].map(([trackId, it]) =>
      candidate({
        sourceId: this.sourceId,
        channel: "app",
        platform: "app_store",
        identifier: `id${trackId}`,
        handle: `id${trackId}`,
        displayName: it.trackName ?? "",
        url: it.trackViewUrl || `https://apps.apple.com/app/id${trackId}`,
        bio: firstChars(it.description || "", 2000),
        audience: Math.trunc(Number(it.userRatingCount || 0)),
        createdOn: it.releaseDate ? String(it.releaseDate).slice(0, 10) : null,
        publisher: it.sellerName || it.artistName || null,
        publisherId: String(it.artistId ?? "") || null,
        links: it.sellerUrl ? [it.sellerUrl] : [],
        image: it.artworkUrl512 || it.artworkUrl100 || null,
        mark: "unrelated",
      }),
    );
  }
}
