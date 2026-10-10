/**
 * Private workspaces without accounts.
 *
 * Each browser gets a random workspace ID in an HTTP-only cookie. Brands belong to a
 * workspace, and everything else (official assets, scans, detections, verdicts) hangs
 * off a brand, so one visitor never sees what another searched, registered or scanned.
 *
 * Every API request runs inside its workspace (AsyncLocalStorage); repo.ts reads it,
 * so a query cannot forget the filter. Code outside a request (scripts, the accuracy
 * evaluation) has no workspace and sees only rows without one.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const store = new AsyncLocalStorage<string>();

export const COOKIE = "bs_ws";
const VALID = /^[a-f0-9-]{32,36}$/;

export function currentWorkspace(): string | null {
  return store.getStore() ?? null;
}

export function inWorkspace<T>(ws: string, fn: () => Promise<T>): Promise<T> {
  return store.run(ws, fn);
}

/** The workspace named by the request's cookie, or a new one (isNew: send the cookie back). */
export function workspaceFrom(req: Request): { ws: string; isNew: boolean } {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const ws = m?.[1];
  if (ws && VALID.test(ws)) return { ws, isNew: false };
  return { ws: randomUUID(), isNew: true };
}

export function workspaceCookie(ws: string, secure: boolean): string {
  const oneYear = 365 * 24 * 3600;
  return `${COOKIE}=${ws}; Path=/; Max-Age=${oneYear}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
