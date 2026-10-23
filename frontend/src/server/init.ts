/**
 * One-time startup, shared by every request (the FastAPI lifespan in main.py):
 * create the schema, seed the sources and close scans interrupted by a restart.
 * Retried on the next request if the database is unreachable.
 *
 * Workspaces are set up on their first request (ensureWorkspace): the demo brand is
 * copied in. Scans run only when the user starts one (Run scan, or Save and run scan).
 */

import { createSchema, ensureDatabase, exec, one } from "./db";
import { seed, seedWorkspace } from "./seed";

const g = globalThis as unknown as { __bsReady?: Promise<void>; __bsWorkspaces?: Map<string, Promise<void>> };

async function init(): Promise<void> {
  await ensureDatabase();
  await createSchema();
  await seed();
  // A scan interrupted by a restart can never finish; close it out.
  await exec("UPDATE scans SET status = 'failed' WHERE status = 'running'");
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

/** Give a workspace its demo brand the first time it is used. No scan starts until the user asks. */
export function ensureWorkspace(ws: string): Promise<void> {
  const seen = (g.__bsWorkspaces ??= new Map());
  let p = seen.get(ws);
  if (!p) {
    p = (async () => {
      if (await one("SELECT id FROM brands WHERE workspace_id = ? LIMIT 1", [ws])) return;
      await seedWorkspace(ws);
    })().catch((e) => {
      seen.delete(ws); // retry on the next request
      throw e;
    });
    seen.set(ws, p);
    if (seen.size > 10_000) seen.delete(seen.keys().next().value as string); // bounded memory
  }
  return p;
}
