/**
 * Accounts: sign up, sign in, sign out, demo entry, and which workspace a request uses.
 * Runs through the real /api route handler against MySQL (the test schema).
 */

import { beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/[...path]/route";
import { isPersonalEmail, WORK_EMAIL_MESSAGE } from "@/lib/workEmail";
import { checkSignUp, hashPassword, verifyPassword } from "@/server/auth";
import { one } from "@/server/db";
import { ready } from "@/server/init";

/* eslint-disable @typescript-eslint/no-explicit-any */
const WS_A = "33333333-3333-4333-8333-333333333333";
const WS_B = "44444444-4444-4444-8444-444444444444";

type Res = { status: number; body: any; cookies: Record<string, string> };

async function api(method: "GET" | "POST", path: string, body?: unknown, cookie = ""): Promise<Res> {
  const req = new Request(`http://test/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await (method === "GET" ? GET : POST)(req, { params: Promise.resolve({ path: path.split("/") }) });
  const cookies: Record<string, string> = {};
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    cookies[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return { status: res.status, body: await res.json(), cookies };
}

const jar = (c: Record<string, string>) =>
  Object.entries(c)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

const email = `analyst-${Date.now()}@example.com`;

beforeAll(async () => {
  await ready();
});

describe("passwords and input", () => {
  it("hashes with a salt and verifies", async () => {
    const h1 = await hashPassword("correct horse");
    const h2 = await hashPassword("correct horse");
    expect(h1).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("correct horse", h1)).toBe(true);
    expect(await verifyPassword("wrong horse", h1)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("validates sign-up fields", () => {
    expect(checkSignUp({ name: "A", email: "a@b.co", password: "12345678" })).toMatch(/name/);
    expect(checkSignUp({ name: "Asha", email: "not-an-email", password: "12345678" })).toMatch(/email/);
    expect(checkSignUp({ name: "Asha", email: "a@b.co", password: "short" })).toMatch(/8 characters/);
    expect(checkSignUp({ name: " Asha ", email: " A@B.CO ", password: "12345678" })).toEqual({ name: "Asha", email: "a@b.co", password: "12345678" });
  });
});

describe("accounts", () => {
  let session = "";

  it("signs up, keeping the browser's workspace", async () => {
    const r = await api("POST", "auth/signup", { name: "Asha Rao", email, password: "s3cret-pass" }, `bs_ws=${WS_A}`);
    expect(r.status).toBe(201);
    expect(r.body.user).toEqual({ name: "Asha Rao", email });
    expect(r.cookies.bs_session).toMatch(/^[0-9a-f]{64}$/);
    expect(r.cookies.bs_ws).toBe(WS_A);
    session = r.cookies.bs_session;
    const row: any = await one("SELECT password_hash, workspace_id FROM users WHERE email = ?", [email]);
    expect(row.workspace_id).toBe(WS_A);
    expect(row.password_hash).not.toContain("s3cret-pass");
    // Only a hash of the session token is stored.
    expect(await one("SELECT 1 FROM sessions WHERE token_hash = ?", [session])).toBeNull();
  });

  it("accepts only work emails, at sign-up and at sign-in", async () => {
    for (const personal of ["asha@gmail.com", "asha@yahoo.co.in", "asha@mail.yahoo.co.in", "asha@outlook.com", "asha@rediffmail.com", "asha@mailinator.com"]) {
      const up = await api("POST", "auth/signup", { name: "Asha Rao", email: personal, password: "s3cret-pass" });
      expect([personal, up.status]).toEqual([personal, 422]);
      expect(up.body.detail).toBe(WORK_EMAIL_MESSAGE);
      const inn = await api("POST", "auth/login", { email: personal, password: "s3cret-pass" });
      expect([personal, inn.status, inn.body.detail]).toEqual([personal, 422, WORK_EMAIL_MESSAGE]);
    }
    expect(isPersonalEmail("analyst@fourcrestsolutions.in")).toBe(false);
    expect(isPersonalEmail("analyst@gmail.co")).toBe(false); // not the free service's domain
    expect(isPersonalEmail("ASHA@GMAIL.COM")).toBe(true);
  });

  it("rejects a second account with the same email (any case)", async () => {
    const r = await api("POST", "auth/signup", { name: "Someone", email: email.toUpperCase(), password: "another-pass" });
    expect(r.status).toBe(409);
  });

  it("gives a new account a fresh workspace if the browser's one already belongs to an account", async () => {
    const r = await api("POST", "auth/signup", { name: "Ben", email: `b-${email}`, password: "another-pass" }, `bs_ws=${WS_A}`);
    expect(r.status).toBe(201);
    expect(r.cookies.bs_ws).not.toBe(WS_A);
  });

  it("reports who is signed in", async () => {
    expect((await api("GET", "auth/me", undefined, `bs_session=${session}`)).body).toEqual({ user: { name: "Asha Rao", email }, demo: false });
    expect((await api("GET", "auth/me", undefined, "bs_demo=1")).body).toEqual({ user: null, demo: true });
    expect((await api("GET", "auth/me")).body).toEqual({ user: null, demo: false });
  });

  it("uses the account's workspace whatever the workspace cookie says", async () => {
    const mine = await api("GET", "brands", undefined, `bs_ws=${WS_A}`);
    const signedIn = await api("GET", "brands", undefined, `bs_ws=${WS_B}; bs_session=${session}`);
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.map((b: any) => b.id)).toEqual(mine.body.map((b: any) => b.id));
    expect(signedIn.cookies.bs_ws).toBe(WS_A); // the browser is moved back to the account's workspace
  });

  it("refuses a wrong password, accepts the right one and switches the workspace", async () => {
    const bad = await api("POST", "auth/login", { email, password: "nope-nope" }, `bs_ws=${WS_B}`);
    expect(bad.status).toBe(401);
    expect(bad.cookies.bs_session).toBeUndefined();
    const ok = await api("POST", "auth/login", { email: ` ${email.toUpperCase()} `, password: "s3cret-pass" }, `bs_ws=${WS_B}; bs_demo=1`);
    expect(ok.status).toBe(200);
    expect(ok.cookies.bs_ws).toBe(WS_A);
    expect(ok.cookies.bs_demo).toBe(""); // demo flag cleared
    expect(ok.cookies.bs_session).toMatch(/^[0-9a-f]{64}$/);
  });

  it("limits repeated wrong passwords", async () => {
    const target = `c-${email}`;
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await api("POST", "auth/login", { email: target, password: "wrong-pass" })).status;
    expect(last).toBe(429);
  });

  it("signs out: the session stops working and the cookies are cleared", async () => {
    const out = await api("POST", "auth/logout", {}, jar({ bs_session: session, bs_ws: WS_A }));
    expect(out.status).toBe(200);
    expect(out.cookies).toMatchObject({ bs_session: "", bs_ws: "", bs_demo: "" });
    expect((await api("GET", "auth/me", undefined, `bs_session=${session}`)).body.user).toBeNull();
  });

  it("continue as demo sets only the demo flag", async () => {
    const r = await api("POST", "auth/demo", {});
    expect(r.status).toBe(200);
    expect(r.cookies).toEqual({ bs_demo: "1" });
  });
});
