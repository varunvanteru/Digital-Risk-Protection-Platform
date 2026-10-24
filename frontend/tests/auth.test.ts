/**
 * Accounts: sign up, sign in, sign out, demo entry, and which workspace a request uses.
 * Runs through the real /api route handler against MySQL (the test schema).
 */

import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/[...path]/route";
import { middleware } from "@/middleware";
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
    expect(checkSignUp({ name: "A", email: "a@b.co", password: "1234567!" })).toMatch(/name/);
    expect(checkSignUp({ name: "Asha", email: "not-an-email", password: "1234567!" })).toMatch(/email/);
    expect(checkSignUp({ name: "Asha", email: "a@b.co", password: "sh0rt!" })).toMatch(/8 characters/);
    // at least one special character
    expect(checkSignUp({ name: "Asha", email: "a@b.co", password: "12345678" })).toMatch(/special character/);
    expect(checkSignUp({ name: "Asha", email: "a@b.co", password: "Secret pass1" })).toMatch(/special character/); // a space does not count
    expect(checkSignUp({ name: " Asha ", email: " A@B.CO ", password: "1234567!" })).toEqual({ name: "Asha", email: "a@b.co", password: "1234567!" });
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

  it("continue as demo sets only the demo flag, for this browser session", async () => {
    const req = new Request("http://test/api/auth/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "demo"] }) });
    expect(res.status).toBe(200);
    const set = res.headers.getSetCookie();
    expect(set).toHaveLength(1);
    expect(set[0]).toMatch(/^bs_demo=1;/);
    expect(set[0]).not.toMatch(/Max-Age|Expires/i); // gone when the browser closes
  });
});

describe("who sees the sign-in page", () => {
  // A page load: opened from outside the app ("none": typed, bookmark, app icon) or inside it ("same-origin").
  const page = (path: string, cookie: string, site: "none" | "same-origin" | "cross-site" | null) =>
    middleware(
      new NextRequest(`http://test${path}`, {
        headers: { cookie, ...(site ? { "sec-fetch-site": site, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } : {}) },
      }),
    );
  const where = (r: Response) => r.headers.get("location");

  it("a new visitor gets the sign-in page", () => {
    expect(where(page("/", "", "none"))).toBe("http://test/login");
    expect(where(page("/detections", "", "none"))).toBe("http://test/login?next=%2Fdetections");
  });

  it("a demo visitor gets the sign-in page whenever the app is opened from outside", () => {
    expect(where(page("/", "bs_demo=1", "none"))).toBe("http://test/login");
    expect(where(page("/check", "bs_demo=1", "cross-site"))).toBe("http://test/login?next=%2Fcheck");
  });

  it("a demo visitor moves around inside the app freely", () => {
    expect(where(page("/", "bs_demo=1", "same-origin"))).toBeNull();
  });

  // Behind a proxy that drops Sec-Fetch headers (Hostinger): the Referer decides; the app's data requests always pass.
  const proxied = (path: string, headers: Record<string, string>) =>
    where(middleware(new NextRequest(`http://test${path}`, { headers: { cookie: "bs_demo=1", "x-forwarded-host": "impostr.live", ...headers } })));
  it("behind a proxy: opened from outside shows the sign-in page, inside the app does not", () => {
    expect(proxied("/", {})).toBe("http://test/login"); // typed, bookmark, app icon
    expect(proxied("/", { referer: "https://www.google.com/" })).toBe("http://test/login");
    expect(proxied("/detections", { referer: "https://impostr.live/login" })).toBeNull(); // after Continue as demo, or a reload
    expect(proxied("/detections", { rsc: "1" })).toBeNull(); // in-app navigation data request
  });

  it("a signed-in account always goes straight into the app, and skips the sign-in page", () => {
    expect(where(page("/", "bs_session=abc", "none"))).toBeNull();
    expect(where(page("/login", "bs_session=abc", "none"))).toBe("http://test/");
  });

  it("the sign-in page stays open for demo and new visitors", () => {
    expect(where(page("/login", "bs_demo=1", "none"))).toBeNull();
    expect(where(page("/login", "", "none"))).toBeNull();
  });
});
