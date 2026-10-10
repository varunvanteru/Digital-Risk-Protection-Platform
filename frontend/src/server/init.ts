/**
 * One-time startup, shared by every request (the FastAPI lifespan in main.py):
 * create the schema, seed sources and demo brands, close scans interrupted by a
 * restart, and run the first scan on an empty database. Retried on the next
 * request if the database is unreachable.
 */

import { createSchema, ensureDatabase, exec, one } from "./db";
import { seed } from "./seed";
import { startScan } from "./services/scan";

const g = globalThis as unknown as { __bsReady?: Promise<void> };

async function init(): Promise<void> {
  await ensureDatabase();
  await createSchema();
  await seed();
  // A scan interrupted by a restart can never finish; close it out.
  await exec("UPDATE scans SET status = 'failed' WHERE status = 'running'");
  if (!(await one("SELECT id FROM scans LIMIT 1"))) {
    const brand = await one<{ id: string }>("SELECT id FROM brands ORDER BY is_active DESC, updated_at DESC LIMIT 1");
    if (brand) await startScan(brand.id);
  }
}

export function ready(): Promise<void> {
  if (!g.__bsReady) {
    g.__bsReady = init().catch((e) => {
      g.__bsReady = undefined; // try again on the next request
      throw e;
    });
  }
  return g.__bsReady;
}
