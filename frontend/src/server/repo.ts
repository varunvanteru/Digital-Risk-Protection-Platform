/** Typed reads of the main tables. Columns as in backend/app/models.py. */

import { bool, js, one, q } from "./db";
import { HttpError } from "./util";

export interface Publisher {
  id: number;
  brandId: string;
  name: string;
  publisherId: string;
  aliases: string[];
}

export interface Asset {
  id: number;
  brandId: string;
  kind: "social" | "app";
  platform: string;
  identifier: string;
  handle: string;
  canonicalId: string;
  displayName: string;
  status: string;
  verified: boolean;
  publisher: string | null;
  publisherId: string | null;
  createdAt: string;
  storeTitle: string | null;
  iconUrl: string | null;
  validatedAt: string | null;
  validationStatus: string | null;
  validationNote: string | null;
}

export interface Brand {
  id: string;
  name: string;
  aliases: string[];
  keywords: string[];
  domains: string[];
  description: string;
  logoPath: string | null;
  legalName: string | null;
  isActive: boolean;
  updatedAt: string;
  publishers: Publisher[];
  assets: Asset[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const toAsset = (r: any): Asset => ({
  id: Number(r.id),
  brandId: r.brand_id,
  kind: r.kind,
  platform: r.platform,
  identifier: r.identifier,
  handle: r.handle,
  canonicalId: r.canonical_id,
  displayName: r.display_name,
  status: r.status,
  verified: bool(r.verified),
  publisher: r.publisher,
  publisherId: r.publisher_id,
  createdAt: r.created_at,
  storeTitle: r.store_title,
  iconUrl: r.icon_url,
  validatedAt: r.validated_at,
  validationStatus: r.validation_status,
  validationNote: r.validation_note,
});

async function hydrate(r: any): Promise<Brand> {
  const pubs = await q<any>("SELECT * FROM publishers WHERE brand_id = ? ORDER BY id", [r.id]);
  const assets = await q<any>("SELECT * FROM official_assets WHERE brand_id = ? ORDER BY id", [r.id]);
  return {
    id: r.id,
    name: r.name,
    aliases: js(r.aliases, []),
    keywords: js(r.keywords, []),
    domains: js(r.domains, []),
    description: r.description ?? "",
    logoPath: r.logo_path,
    legalName: r.legal_name,
    isActive: bool(r.is_active),
    updatedAt: r.updated_at,
    publishers: pubs.map((p) => ({ id: Number(p.id), brandId: p.brand_id, name: p.name, publisherId: p.publisher_id ?? "", aliases: js(p.aliases, []) })),
    assets: assets.map(toAsset),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getBrand(id: string): Promise<Brand | null> {
  const r = await one("SELECT * FROM brands WHERE id = ?", [id]);
  return r ? hydrate(r) : null;
}

export async function allBrands(order = "is_active DESC, updated_at DESC"): Promise<Brand[]> {
  const rows = await q(`SELECT * FROM brands ORDER BY ${order}`);
  return Promise.all(rows.map(hydrate));
}

/** The active brand (one at a time); falls back to the most recently updated. */
export async function currentBrand(): Promise<Brand> {
  const r = await one("SELECT * FROM brands ORDER BY is_active DESC, updated_at DESC LIMIT 1");
  if (!r) throw new HttpError(404, "No brand profile yet. Complete the setup wizard.");
  return hydrate(r);
}
