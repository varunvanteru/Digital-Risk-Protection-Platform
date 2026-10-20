/**
 * Accounts and sign-in (optional: "Continue as demo" needs no account).
 *
 * - Passwords are stored only as salted scrypt hashes (Node's crypto; no plain text, no extra package).
 * - A session is a random 32-byte token in an HTTP-only cookie; the database keeps only its SHA-256.
 * - An account owns one private workspace. Signing up keeps the browser's current workspace (its
 *   demo brands and results); signing in switches the browser to the account's workspace.
 * - The demo cookie only records that a visitor chose "Continue as demo".
 */

import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { resolveMx } from "node:dns/promises";
import { promisify } from "node:util";
import { emailDomain, isPersonalEmail, passwordError, WORK_EMAIL_MESSAGE } from "@/lib/workEmail";
import { settings } from "./config";
import { exec, one } from "./db";
import { utcnow } from "./util";
import { COOKIE as WS_COOKIE, workspaceCookie } from "./workspace";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "bs_session";
export const DEMO_COOKIE = "bs_demo";
const SESSION_DAYS = 30;
const KEY_LEN = 64;

export interface AuthResult {
  status: number;
  body: unknown;
  cookies: string[];
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  workspaceId: string;
}

/* ---------- passwords ---------- */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltHex, keyHex] = stored.split("$");
  if (kind !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/* ---------- input rules ---------- */

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function checkSignUp(raw: unknown): { name: string; email: string; password: string } | string {
  const b = (raw ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (name.length < 2 || name.length > 80) return "Enter your name (2 to 80 characters).";
  if (!EMAIL.test(email) || email.length > 160) return "Enter a valid email address.";
  // Accounts are for companies; anyone can still explore with Continue as demo.
  if (isPersonalEmail(email)) return WORK_EMAIL_MESSAGE;
  const pe = passwordError(password);
  if (pe) return pe;
  return { name, email, password };
}

/**
 * Can the company's domain receive email? A domain with no mail server (e.g. a made-up company)
 * is refused. If DNS itself does not answer, the address is given the benefit of the doubt.
 * Skipped in the offline test mode.
 */
export async function domainReceivesMail(email: string): Promise<boolean> {
  if (settings.dataMode === "fixtures") return true;
  try {
    const mx = await Promise.race([
      resolveMx(emailDomain(email)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    // null: DNS was too slow to answer; a real "no such domain / no mail server" answer throws below.
    return mx === null || mx.some((r) => r.exchange && r.exchange !== ".");
  } catch (e) {
    const code = (e as { code?: string }).code;
    return !(code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN");
  }
}

/* ---------- cookies ---------- */

const isSecure = (req: Request) => new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function readCookie(req: Request, name: string): string | null {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/* ---------- sessions ---------- */

/** The signed-in user for this request, or null. */
export async function sessionUser(req: Request): Promise<SessionUser | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await one<{ id: string; email: string; name: string; workspace_id: string }>(
    "SELECT u.id, u.email, u.name, u.workspace_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    [tokenHash(token), utcnow()],
  );
  return row ? { id: row.id, email: row.email, name: row.name, workspaceId: row.workspace_id } : null;
}

async function startSession(userId: string, req: Request): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString().slice(0, 19).replace("T", " ");
  await exec("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [tokenHash(token), userId, utcnow(), expires]);
  await exec("DELETE FROM sessions WHERE expires_at < ?", [utcnow()]); // tidy up old ones
  return cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400, isSecure(req));
}

/* ---------- brute-force guard: at most 8 failed sign-ins per address per 10 minutes ---------- */

const failures = new Map<string, number[]>();
function tooManyFailures(key: string): boolean {
  const now = Date.now();
  const recent = (failures.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  failures.set(key, recent);
  return recent.length >= 8;
}
function noteFailure(key: string) {
  failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
  if (failures.size > 10_000) failures.delete(failures.keys().next().value as string);
}

/* ---------- endpoints: /api/auth/... ---------- */

export async function handleAuth(method: string, path: string, req: Request, currentWs: string): Promise<AuthResult> {
  const secure = isSecure(req);
  const body = method === "POST" ? await req.json().catch(() => ({})) : {};

  if (method === "GET" && path === "auth/me") {
    const user = await sessionUser(req);
    return {
      status: 200,
      body: { user: user ? { name: user.name, email: user.email } : null, demo: !user && readCookie(req, DEMO_COOKIE) === "1" },
      cookies: [],
    };
  }

  if (method === "POST" && path === "auth/signup") {
    const input = checkSignUp(body);
    if (typeof input === "string") return { status: 422, body: { detail: input }, cookies: [] };
    if (!(await domainReceivesMail(input.email))) {
      return { status: 422, body: { detail: `${emailDomain(input.email)} does not receive email. Enter your company email address.` }, cookies: [] };
    }
    if (await one("SELECT id FROM users WHERE email = ?", [input.email])) {
      return { status: 409, body: { detail: "An account with this email already exists. Sign in instead." }, cookies: [] };
    }
    const id = randomUUID();
    // Keep this browser's workspace (its demo brands and anything already done) as the account's own,
    // unless another account already owns it: then the new account starts a fresh one.
    const ws = (await one("SELECT id FROM users WHERE workspace_id = ?", [currentWs])) ? randomUUID() : currentWs;
    await exec("INSERT INTO users (id, email, name, password_hash, workspace_id, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      id, input.email, input.name, await hashPassword(input.password), ws, utcnow(), utcnow(),
    ]);
    return {
      status: 201,
      body: { user: { name: input.name, email: input.email } },
      cookies: [await startSession(id, req), workspaceCookie(ws, secure), cookie(DEMO_COOKIE, "", 0, secure)],
    };
  }

  if (method === "POST" && path === "auth/login") {
    const b = body as Record<string, unknown>;
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const password = typeof b.password === "string" ? b.password : "";
    // Same rule as sign-up, so a personal address gets the helpful message instead of "not correct".
    if (isPersonalEmail(email)) return { status: 422, body: { detail: WORK_EMAIL_MESSAGE }, cookies: [] };
    const key = `${req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local"}|${email}`;
    if (tooManyFailures(key)) return { status: 429, body: { detail: "Too many attempts. Try again in a few minutes." }, cookies: [] };
    const user = email ? await one<{ id: string; name: string; password_hash: string; workspace_id: string }>("SELECT id, name, password_hash, workspace_id FROM users WHERE email = ?", [email]) : null;
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      noteFailure(key);
      return { status: 401, body: { detail: "Email or password is not correct." }, cookies: [] };
    }
    await exec("UPDATE users SET last_login_at = ? WHERE id = ?", [utcnow(), user.id]);
    return {
      status: 200,
      body: { user: { name: user.name, email } },
      // Switch this browser to the account's own workspace.
      cookies: [await startSession(user.id, req), workspaceCookie(user.workspace_id, secure), cookie(DEMO_COOKIE, "", 0, secure)],
    };
  }

  if (method === "POST" && path === "auth/logout") {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await exec("DELETE FROM sessions WHERE token_hash = ?", [tokenHash(token)]);
    // Forget the account's workspace in this browser; the next visit starts a fresh demo workspace.
    return { status: 200, body: { ok: true }, cookies: [cookie(SESSION_COOKIE, "", 0, secure), cookie(DEMO_COOKIE, "", 0, secure), cookie(WS_COOKIE, "", 0, secure)] };
  }

  if (method === "POST" && path === "auth/demo") {
    return { status: 200, body: { ok: true }, cookies: [cookie(DEMO_COOKIE, "1", 30 * 86400, secure)] };
  }

  return { status: 404, body: { detail: "Not Found" }, cookies: [] };
}
