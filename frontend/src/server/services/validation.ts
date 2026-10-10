/**
 * Official-asset validation against the live stores. Port of services/validation.py.
 *
 * For every official app in a brand profile, ask its store who publishes it and
 * record the developer account ID, store title, publisher name and icon. That
 * turns one known app into a verified developer identity, which is how official
 * variants (same company, different app) are recognised later, for any brand.
 */

import { settings } from "../config";
import { gplay } from "../connectors/stores";
import { exec } from "../db";
import { encodePng, loadImage } from "../detection/images";
import { saveMedia } from "../media";
import type { Brand } from "../repo";
import { utcnow, withTimeout } from "../util";

const MAX_AGE_MS = 24 * 3600 * 1000;

interface Facts {
  publisherId: string | null;
  publisher: string | null;
  storeTitle: string | null;
  iconUrl: string | null;
  note: string;
}

/** Store facts about a Play app, or null if the store says it does not exist. */
async function lookupPlay(packageId: string): Promise<Facts | null> {
  const gp = await gplay();
  let d: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    d = await gp.app({ appId: packageId, lang: "en", country: "in" });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    if (err.status === 404 || /not found/i.test(err.message ?? "")) return null;
    throw e;
  }
  return {
    publisherId: String(d.developerId ?? "") || null,
    publisher: d.developer ?? null,
    storeTitle: d.title ?? null,
    iconUrl: d.icon ?? null,
    note: "Confirmed on Google Play",
  };
}

async function lookupAppStore(trackId: string): Promise<Facts | null> {
  const params = new URLSearchParams({ id: trackId.replace(/^id/, ""), country: "in" });
  const r = await fetch(`https://itunes.apple.com/lookup?${params}`, { signal: AbortSignal.timeout(settings.sourceTimeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const results = (await r.json()).results ?? [];
  if (!results.length) return null;
  const it = results[0];
  return {
    publisherId: String(it.artistId ?? "") || null,
    publisher: it.sellerName || it.artistName || null,
    storeTitle: it.trackName ?? null,
    iconUrl: it.artworkUrl512 || it.artworkUrl100 || null,
    note: "Confirmed on the App Store",
  };
}

const LOOKUPS: Record<string, (id: string) => Promise<Facts | null>> = { google_play: lookupPlay, app_store: lookupAppStore };

const ageMs = (dbTime: string) => Date.now() - Date.parse(dbTime.replace(" ", "T") + "Z");

/** Validate official apps. Skips assets verified in the last 24 h unless forced. Updates the database. */
export async function validateBrandAssets(brand: Brand, force = false): Promise<Record<string, number | boolean>> {
  const summary = { verified: 0, not_found: 0, unavailable: 0, skipped: 0 };
  if (!settings.validateAssets) return { ...summary, disabled: true };
  const now = utcnow();
  for (const a of brand.assets) {
    const lookup = LOOKUPS[a.platform];
    if (a.kind !== "app" || !lookup) continue;
    if (!force && a.validatedAt && ageMs(a.validatedAt) < MAX_AGE_MS && a.validationStatus === "verified") {
      summary.skipped++;
      continue;
    }
    let facts: Facts | null;
    try {
      facts = await withTimeout(lookup(a.handle), Math.max(20_000, settings.sourceTimeoutMs), a.handle);
    } catch (e) {
      // network, firewall, rate limit: keep previous values, say so
      if (a.validationStatus !== "verified") a.validationStatus = "unavailable";
      a.validationNote = `Store unreachable (${(e as Error).name || "Error"}); using last known details`;
      await exec("UPDATE official_assets SET validation_status = ?, validation_note = ? WHERE id = ?", [a.validationStatus, a.validationNote, a.id]);
      summary.unavailable++;
      continue;
    }
    a.validatedAt = now;
    if (facts === null) {
      a.validationStatus = "not_found";
      a.validationNote = "Not found on the store";
      summary.not_found++;
    } else {
      a.publisherId = facts.publisherId || a.publisherId;
      a.publisher = facts.publisher || a.publisher;
      a.storeTitle = facts.storeTitle || a.storeTitle;
      a.iconUrl = facts.iconUrl || a.iconUrl;
      a.validationStatus = "verified";
      a.validationNote = facts.note;
      summary.verified++;
    }
    await exec(
      `UPDATE official_assets SET validated_at = ?, validation_status = ?, validation_note = ?, publisher_id = ?,
       publisher = ?, store_title = ?, icon_url = ? WHERE id = ?`,
      [a.validatedAt, a.validationStatus, a.validationNote, a.publisherId, a.publisher, a.storeTitle, a.iconUrl, a.id],
    );
  }

  // No logo uploaded: use the verified official app icon as the brand's reference image.
  if (!brand.logoPath) {
    const icon = brand.assets.find((a) => a.kind === "app" && a.iconUrl && a.validationStatus === "verified")?.iconUrl;
    if (icon) {
      const img = await loadImage(icon);
      if (img) {
        brand.logoPath = await saveMedia(`brand/${brand.id}.png`, await encodePng(img));
        await exec("UPDATE brands SET logo_path = ? WHERE id = ?", [brand.logoPath, brand.id]);
      }
    }
  }
  return summary;
}
