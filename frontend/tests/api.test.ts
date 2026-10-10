/**
 * End-to-end tests of the /api routes against MySQL (schema brandshield_test_node,
 * dropped afterwards). Port of test_api.py and the API parts of test_search.py and
 * test_official.py.
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { candidate } from "@/server/connectors/base";
import { pool } from "@/server/db";
import { ready } from "@/server/init";
import { handle } from "@/server/routes";
import { CONNECTORS, fetchWithRetries, sourceState, type SourceRow } from "@/server/services/scan";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function call(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return handle(method, path, new Request(`http://test/api/${path}`, init));
}
const get = async (path: string) => (await call("GET", path)).body;

async function waitForScan(id: string, timeoutMs = 180_000): Promise<any> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const s = await get(`scans/${id}`);
    if (s.status !== "running") return s;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("scan did not finish");
}

beforeAll(async () => {
  await ready();
  // Startup kicks off the first scan in the background; wait for it.
  const until = Date.now() + 180_000;
  while (Date.now() < until) {
    const latest = await get("scans/latest");
    if (latest.last && !latest.running) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("first scan did not finish");
});

afterAll(() => pool().end());

describe("API", () => {
  it("health reports the database", async () => {
    const body = await get("health");
    expect(body.status).toBe("ok");
    expect(body.database).toBe("brandshield_test_node");
    expect(body.mysql).toMatch(/^\d+\./);
  });

  it("the first scan finds impersonators and never flags official assets", async () => {
    const last = (await get("scans/latest")).last;
    expect(last.status).toBe("done");
    expect(last.officialFlagged).toBe(0);
    expect(last.officialSkipped).toBeGreaterThanOrEqual(7);

    const brand = await get("brand");
    const official = new Set([
      ...brand.accounts.map((a: any) => `${a.platform}|${a.handle.toLowerCase()}`),
      ...brand.apps.map((a: any) => `${a.platform}|${a.packageId.toLowerCase()}`),
    ]);
    const dets = await get("detections");
    expect(dets.length).toBeGreaterThan(0);
    expect(dets.filter((d: any) => official.has(`${d.platform}|${d.handle.toLowerCase()}`))).toEqual([]);
    const handles = new Set(dets.map((d: any) => d.handle));
    for (const h of ["zentrapay_care_india", "zentarpay", "z3ntra.pay_official", "com.zentrapay.wallet.upi"]) expect(handles.has(h)).toBe(true);
    // Ordinary look-alike names are screened out, not stored
    expect(handles.has("sentra_motors")).toBe(false);
    expect(handles.has("zentrofoods")).toBe(false);
  });

  it("a possibly official app is reported, not flagged", async () => {
    const last = (await get("scans/latest")).last;
    expect(last.possiblyOfficial.some((p: any) => p.packageId === "com.zentrapay.business")).toBe(true);
    expect((await get("detections")).every((d: any) => d.handle !== "com.zentrapay.business")).toBe(true);
  });

  it("scores are consistent with the breakdown", async () => {
    for (const d of await get("detections")) {
      expect(d.breakdown.score).toBeGreaterThanOrEqual(0);
      expect(d.breakdown.score).toBeLessThanOrEqual(100);
      expect(["critical", "high", "medium", "low"]).toContain(d.breakdown.severity);
      expect(d.reasons.length).toBeGreaterThan(0);
    }
  });

  it("validates accounts", async () => {
    let r = await call("POST", "brand/accounts", { platform: "x", handle: "this_handle_is_far_too_long" });
    expect(r.status).toBe(422);
    expect(r.body.detail.message).toContain("X handle");
    r = await call("POST", "brand/accounts", { platform: "instagram", handle: "@zentrapay" });
    expect(r.status).toBe(422); // duplicate
  });

  it("allowlisting retracts an alert, and undo restores it", async () => {
    const det = (await get("detections")).find((d: any) => d.handle === "zentrapayy");
    const r = await call("POST", "brand/accounts", { platform: "instagram", handle: "zentrapayy" });
    expect(r.status).toBe(201);
    expect((await get("detections")).map((d: any) => d.id)).not.toContain(det.id);
    expect((await get(`detections/${det.id}`)).allowlisted).toBe(true);
    await call("DELETE", `detections/${det.id}/allowlist`);
    expect((await get("detections")).map((d: any) => d.id)).toContain(det.id);
  });

  it("status changes and the false-positive penalty", async () => {
    const det = (await get("detections")).find((d: any) => d.status === "open" && d.breakdown.score >= 40);
    const before = det.breakdown.score;
    const after = (await call("PATCH", `detections/${det.id}`, { status: "false_positive" })).body;
    expect(after.status).toBe("false_positive");
    expect(after.breakdown.score).toBeLessThan(before);
    const reopened = (await call("PATCH", `detections/${det.id}`, { status: "open" })).body;
    expect(reopened.breakdown.score).toBe(before);
    expect(reopened.events.map((e: any) => e.to).slice(-2)).toEqual(["false_positive", "open"]);
  });

  it("status persists across rescans", async () => {
    const det = (await get("detections")).find((d: any) => d.status === "open");
    await call("PATCH", `detections/${det.id}`, { status: "confirmed" });
    const scan = await call("POST", "scans");
    expect(scan.status).toBe(202);
    await waitForScan(scan.body.id);
    expect((await get(`detections/${det.id}`)).status).toBe("confirmed");
  });

  it("a source outage does not stop a scan", async () => {
    await call("PATCH", "sources/src_ig", { simulateOutage: true });
    const scan = (await call("POST", "scans")).body;
    const done = await waitForScan(scan.id);
    expect(done.status).toBe("done");
    expect(done.sources.src_ig.ok).toBe(false);
    expect(done.sources.src_x.ok).toBe(true);
    // Last good Instagram results are still listed
    expect((await get("detections")).some((d: any) => d.platform === "instagram")).toBe(true);
    await call("PATCH", "sources/src_ig", { simulateOutage: false });
  });

  it("quick check", async () => {
    let r = (await call("POST", "check", { value: "z3ntra.pay_official" })).body;
    expect(r.result.verdict).toBe("match");
    expect(r.official).toBeNull();
    r = (await call("POST", "check", { value: "@zentrapay" })).body;
    expect(r.official.status).toBe("official");
  });

  it("validates brand updates", async () => {
    expect((await call("PUT", "brand", { name: "Z", description: "short", accounts: [] })).status).toBe(422);
  });

  it("simulated sources are never reported live", async () => {
    for (const s of await get("sources")) if (s.mode === "dataset") expect(["simulated", "down"]).toContain(s.state);
  });

  it("accuracy: official assets are never flagged", async () => {
    const r = await get("accuracy");
    expect(r.officialTested).toBeGreaterThanOrEqual(15);
    expect(r.officialFlagged).toBe(0);
    expect(r.officialRecognised).toBe(r.officialTested);
    expect(r.mentionsFlagged).toBe(0);
    expect(r.precision).toBeGreaterThanOrEqual(0.95);
    expect(r.recall).toBeGreaterThanOrEqual(0.85);
  });

  it("14: a live source falls back to its cache, labelled as cached", async () => {
    const original = CONNECTORS.src_play;
    let fail = false;
    CONNECTORS.src_play = {
      sourceId: "src_play",
      async fetch() {
        if (fail) throw new Error("store unreachable");
        return [candidate({ sourceId: "src_play", channel: "app", platform: "google_play", identifier: "com.cached.example", handle: "com.cached.example", displayName: "Cached Example", url: "" })];
      },
    };
    try {
      const src = { id: "src_play", name: "Google Play", platform: "google_play", channel: "app", mode: "live", health: "operational", simulate_outage: 0 } as SourceRow;
      let [, , , cachedAt] = await fetchWithRetries(src, ["cachetest"]);
      expect(cachedAt).toBeNull();
      expect(sourceState(src, true, cachedAt)).toBe("live");
      fail = true;
      let items, latency;
      [items, latency, , cachedAt] = await fetchWithRetries(src, ["cachetest"]);
      expect(cachedAt).not.toBeNull();
      expect(latency).toBeNull();
      expect(items.map((c) => c.identifier)).toEqual(["com.cached.example"]);
      expect(sourceState(src, true, cachedAt)).toBe("cached"); // never reported as live
    } finally {
      CONNECTORS.src_play = original;
    }
  });
});

describe("search API", () => {
  it("finds scams on Indian platforms and skips official channels", async () => {
    const body = (await call("POST", "search", { query: "zentrapay", platforms: ["sharechat", "linkedin", "whatsapp", "youtube"] })).body;
    const found = new Set(body.results.map((x: any) => `${x.platform}|${x.handle}`));
    for (const k of ["sharechat|zentrapay_sahayata", "linkedin|zentrapay-careers-india", "whatsapp|0029VbZpSupport24"]) expect(found.has(k)).toBe(true);
    const skipped = new Set(body.officialSkipped.map((o: any) => `${o.platform}|${o.handle}`));
    for (const k of ["youtube|zentrapay", "linkedin|zentrapay", "whatsapp|0029VaZentraPay01"]) expect(skipped.has(k)).toBe(true);
    expect([...found].filter((k) => skipped.has(k))).toEqual([]);
  });

  it("all platforms", async () => {
    const r = await call("POST", "search", { query: "zentrapay", platforms: ["all"] });
    expect(r.status).toBe(200);
    const body = r.body;
    expect(body.platforms).toHaveLength(19);
    expect(body.reference).toMatchObject({ type: "brand", name: "ZentraPay" });
    const handles = new Set(body.results.map((x: any) => x.handle));
    expect(handles.has("zentrapay_care_india") && handles.has("com.zentrapay.wallet.upi")).toBe(true);
    // Official accounts are reported as skipped, never as results
    expect(handles.has("zentrapay")).toBe(false);
    expect(body.officialSkipped.some((o: any) => o.handle === "zentrapay")).toBe(true);
    const scores = body.results.map((x: any) => x.breakdown.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("only the selected platforms", async () => {
    const body = (await call("POST", "search", { query: "zentrapay", platforms: ["instagram", "telegram"] })).body;
    expect(new Set(body.platforms.map((p: any) => p.platform))).toEqual(new Set(["instagram", "telegram"]));
    expect(body.results.every((x: any) => ["instagram", "telegram"].includes(x.platform))).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
  });

  it("an official URL", async () => {
    const body = (await call("POST", "search", { query: "https://instagram.com/zentrapay", platforms: ["instagram"] })).body;
    expect(body.pastedUrl).toEqual({ platform: "instagram", identifier: "zentrapay" });
    expect(body.results.every((x: any) => x.handle !== "zentrapay")).toBe(true);
  });

  it("rejects an unknown platform", async () => {
    expect((await call("POST", "search", { query: "zentrapay", platforms: ["myspace"] })).status).toBe(422);
  });

  it("survives a source outage", async () => {
    await call("PATCH", "sources/src_x", { simulateOutage: true });
    const body = (await call("POST", "search", { query: "zentrapay", platforms: ["x", "instagram"] })).body;
    const status = Object.fromEntries(body.platforms.map((p: any) => [p.platform, p]));
    expect(status.x.ok).toBe(false);
    expect(status.instagram.ok).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    await call("PATCH", "sources/src_x", { simulateOutage: false });
  });
});

describe("media", () => {
  it("an uploaded logo is stored in the database and served", async () => {
    const png = await sharp({ create: { width: 96, height: 96, channels: 4, background: { r: 200, g: 30, b: 40, alpha: 1 } } }).png().toBuffer();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "logo.png");
    const original = (await get("brand")).logoUrl;
    const r = await call("POST", "brand/logo", form);
    expect(r.status).toBe(200);
    expect(r.body.logoUrl).toBe(original); // same path, new content
    const { getMedia } = await import("@/server/media");
    const stored = await getMedia(r.body.logoUrl.replace("/media/", ""));
    const meta = await sharp(stored!.data).metadata();
    expect([meta.width, meta.height]).toEqual([96, 96]);
  });

  it("rejects a tiny logo", async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#fff" } }).png().toBuffer();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "logo.png");
    const r = await call("POST", "brand/logo", form);
    expect(r.status).toBe(422);
    expect(r.body.detail.message).toContain("64×64");
  });
});

describe("brands", () => {
  it("switching brand starts clean and restores", async () => {
    const original = await get("brand");
    expect((await get("detections")).length).toBeGreaterThan(0);
    const r = await call("PUT", "brand", {
      name: "Fourcrest Solutions",
      aliases: ["Fourcrest"],
      keywords: ["fourcrest"],
      domains: ["fourcrestsolutions.in"],
      description: "Fourcrest Solutions builds software products and digital services for businesses in India.",
      accounts: [{ platform: "linkedin", handle: "fourcrest-solutions", status: "official" }],
      apps: [],
    });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe("Fourcrest Solutions");
    // Detections and scans of the previous brand are gone
    expect(await get("detections")).toEqual([]);
    expect((await get("scans/latest")).last).toBeNull();

    // Restore the demo brand
    const body = {
      name: original.name,
      aliases: original.aliases.filter((a: string) => a !== original.name),
      keywords: original.keywords,
      domains: original.domains,
      description: original.description,
      publisher: original.publishers[0].name,
      accounts: original.accounts.map((a: any) => ({ platform: a.platform, handle: a.handle, status: a.status, verified: a.verified })),
      apps: original.apps.map((a: any) => ({ platform: a.platform, packageId: a.packageId, name: a.name, publisherId: a.publisherId })),
    };
    expect((await call("PUT", "brand", body)).status).toBe(200);
    const scan = (await call("POST", "scans")).body;
    expect((await waitForScan(scan.id)).officialFlagged).toBe(0);
    expect((await get("detections")).length).toBeGreaterThan(0);
  });

  it("registers, switches and deletes brands", async () => {
    const created = await call("POST", "brands/from-search", {
      name: "Acme Pay",
      publishers: ["Acme Pay"],
      apps: [{ platform: "google_play", packageId: "com.acmepay.app", name: "Acme Pay: UPI" }],
    });
    expect(created.status).toBe(201);
    const list = await get("brands");
    expect(list.find((b: any) => b.name === "Acme Pay").isActive).toBe(false); // the dashboard stays put
    expect((await call("POST", `brands/${created.body.id}/activate`)).body.isActive).toBe(true);
    expect((await call("POST", "brands/from-search", { name: "Acme Pay", apps: [{ platform: "google_play", packageId: "com.acmepay.app" }] })).status).toBe(422);
    const after = (await call("DELETE", `brands/${created.body.id}`)).body;
    expect(after.some((b: any) => b.name === "Acme Pay")).toBe(false);
    expect(after.filter((b: any) => b.isActive)).toHaveLength(1);
  });

  it("unknown routes", async () => {
    expect((await call("GET", "nope")).status).toBe(404);
    expect((await call("DELETE", "health")).status).toBe(405);
  });
});
