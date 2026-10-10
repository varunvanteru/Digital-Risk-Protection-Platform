/**
 * Allowlist-first regression tests (port of backend/tests/test_official.py): official
 * assets are verified before scoring and never flagged; impersonation is still detected.
 * No brand-specific code is involved: each brand is just a profile.
 */

import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { emptyContext, type BrandContext } from "@/server/detection/context";
import { analyseName } from "@/server/detection/lookalike";
import { normalizePublisher, packageNamespace } from "@/server/detection/official";
import { evaluate } from "@/server/detection/signals";
import { suggestOfficial } from "@/server/services/search";
import { app, demoAvatar, flagged, profiles, social, TODAY } from "./helpers";

afterAll(() => pool().end());

const P = profiles();

describe("publisher normalisation", () => {
  it.each(["PhonePe Private Limited", "PHONEPE PRIVATE LIMITED", "PhonePe Pvt. Ltd.", "PhonePe Pvt Ltd", "PhonePe"])("%s", (name) => {
    expect(normalizePublisher(name)).toBe("phonepe");
  });

  it("keeps meaningful words", () => {
    expect(normalizePublisher("ZentraPay Technologies Pvt Ltd")).toBe("zentrapay technologies");
    expect(normalizePublisher("HDFC Bank Ltd.")).toBe("hdfc bank");
  });

  it("package namespace", () => {
    expect(packageNamespace("com.phonepe.app.business")).toBe("com.phonepe");
    expect(packageNamespace("in.co.example.app")).toBe("in.co.example");
  });
});

describe("official verification before scoring", () => {
  it("1: official app ID is official", async () => {
    const ev = await evaluate(app("com.phonepe.app", "PhonePe UPI, Payment, Recharge", "PhonePe", "TEST-PLAY-DEV-PHONEPE"), P.PhonePe, TODAY);
    expect(ev.status).toBe("OFFICIAL");
    expect(ev.official!.level).toBe(1);
    expect(ev.breakdown).toBeNull();
  });

  it("2: official publisher + metadata", async () => {
    const ev = await evaluate(app("com.phonepe.insurance", "PhonePe Insurance", "PhonePe Pvt. Ltd.", null), P.PhonePe, TODAY);
    expect(["OFFICIAL", "LIKELY_OFFICIAL"]).toContain(ev.status);
    expect(ev.official).not.toBeNull();
  });

  it("3: official variant from the same developer", async () => {
    const ev = await evaluate(
      app("com.phonepe.stockbroking", "PhonePe Invest (Share.Market)", "PhonePe", "TEST-PLAY-DEV-PHONEPE", { bio: "Invest in stocks. Read reviews." }),
      P.PhonePe,
      TODAY,
    );
    expect(ev.status).toBe("OFFICIAL");
    expect(ev.official!.level).toBe(3);
  });

  it("4: fake app with a similar name", async () => {
    const ev = await evaluate(
      app("com.quickhelp.phonepay.refund", "Phone Pe Refund Help", "QuickHelp Apps", "4440009998887776", {
        bio: "Share your UPI PIN with our agent to reverse it.", createdOn: "2026-09-20", audience: 1000,
      }),
      P.PhonePe,
      TODAY,
    );
    expect(flagged(ev)).toBe(true);
    expect(["SUSPICIOUS", "LOOKALIKE"]).toContain(ev.status);
  });

  it("5: fake app with a similar icon", async () => {
    const ev = await evaluate(
      app("com.example.payfast", "PayFast Wallet", "PayFast Ltd", "123", {
        image: demoAvatar("copy"),
        bio: "ZentraPay lets you pay bills, send money over UPI and manage cards in one secure app.",
      }),
      P.ZentraPay,
      TODAY,
    );
    expect(ev.signals.logo).toBeGreaterThanOrEqual(0.9);
    expect(flagged(ev)).toBe(true);
  });

  it("6: customer-care keywords", async () => {
    const ev = await evaluate(
      app("com.fastsupport.phonepecare", "PhonePe Customer Care - Fast Support", "Fast Support Apps", "555", {
        bio: "Get the PhonePe customer care number and helpline support instantly. Toll free number for refunds.",
        createdOn: "2026-09-25", audience: 500,
      }),
      P.PhonePe,
      TODAY,
    );
    expect(flagged(ev)).toBe(true);
    expect(ev.status).toBe("SUSPICIOUS");
    expect(ev.checks.publisherMatch).toBe(false);
  });

  it("7: an unrelated app that mentions the brand is not flagged", async () => {
    const ev = await evaluate(
      app("com.fincompare.upicompare", "Compare PhonePe Payments", "FinCompare Labs", "333", {
        bio: "Compare UPI apps like PhonePe, Google Pay and Paytm side by side. Not affiliated with any payment provider.",
        createdOn: "2023-04-02", audience: 50000,
      }),
      P.PhonePe,
      TODAY,
    );
    expect(flagged(ev)).toBe(false);
    expect(ev.status).toBe("MENTION");
  });

  it("8 and 9: homoglyph and leetspeak", () => {
    expect(analyseName("PhonеPe", ["PhonePe"]).verdict).toBe("match"); // Cyrillic e
    expect(analyseName("Ph0nePe", ["PhonePe"]).verdict).toBe("match");
  });

  it("10: an official app with the brand in its title is not flagged", async () => {
    // The exact reported case: 'PhonePe Business: Merchant App' scored 75 / High before the fix.
    const ev = await evaluate(
      app("id1463742453", "PhonePe Business: Merchant App", "PHONEPE PRIVATE LIMITED", "TEST-APPLE-PHONEPE", {
        platform: "app_store", bio: "Accept payments. 24x7 support. Verified settlements.",
        links: ["https://www.phonepe.com/business-solutions"],
      }),
      P.PhonePe,
      TODAY,
    );
    expect(ev.official).not.toBeNull();
    expect(ev.status).toBe("OFFICIAL");
  });

  it("10b: an unregistered brand is not treated as a wrong publisher", async () => {
    const blank = emptyContext({ brandId: "adhoc", name: "PhonePe", aliases: ["PhonePe"] });
    const ev = await evaluate(
      app("id1463742453", "PhonePe Business: Merchant App", "PHONEPE PRIVATE LIMITED", "1", {
        platform: "app_store", bio: "Accept payments. 24x7 support. Verified settlements.",
        links: ["https://www.phonepe.com/business-solutions"],
      }),
      blank,
      TODAY,
    );
    expect(ev.signals.publisher).toBe(0.0);
    expect(ev.signals.claims).toBeLessThan(0.5);
    expect(ev.lookalikeDomain).toBe(false);
    expect(flagged(ev)).toBe(false);
  });

  it("11: official social handle", async () => {
    expect((await evaluate(social("phonepe", "PhonePe", "Official PhonePe account."), P.PhonePe, TODAY)).status).toBe("OFFICIAL");
  });

  it("12: fake social handle is critical", async () => {
    const ev = await evaluate(
      social("phonepe_support_help", "PhonePe Customer Support",
        "Official PhonePe helpline. Share your registered number and OTP to get your refund. wa.me/919900112233",
        { links: ["wa.me/919900112233", "phonepe-refund.in"], createdOn: "2026-10-06", audience: 85 }),
      P.PhonePe,
      TODAY,
    );
    expect(flagged(ev)).toBe(true);
    expect(ev.breakdown!.severity).toBe("critical");
  });

  it("a copied publisher name under another developer account is fraud", async () => {
    const ev = await evaluate(
      app("com.phonepe.kyc.verify", "PhonePe KYC Verify", "PhonePe Private Limited", "9990001112223334", {
        bio: "Complete your PhonePe KYC to avoid account block. Enter the OTP you receive to verify.",
        createdOn: "2026-10-03", audience: 100,
      }),
      P.PhonePe,
      TODAY,
    );
    expect(ev.official).toBeNull();
    expect(flagged(ev)).toBe(true);
    expect(ev.reasons.some((r) => r.includes("different developer account"))).toBe(true);
  });
});

describe("cross-store twin (L5) and suggestions", () => {
  // Like Swiggy: the official app is verified on Google Play only; no App Store developer is known yet.
  function twinCtx(): BrandContext {
    const base = P.ZentraPay;
    return {
      ...base,
      officialTitles: new Set(["zentrapayupibillscards"]),
      publisherIdsByPlatform: new Map([["google_play", base.publisherIdsByPlatform.get("google_play")!]]),
      allowlist: new Set([...base.allowlist].filter((k) => !k.startsWith("app_store|"))),
    };
  }

  it("a twin under the legal entity's publisher name is likely official", async () => {
    const c = app("id9990001", "ZentraPay: UPI, Bills & Cards", "Zentra Technologies Holdings", "777", {
      platform: "app_store", image: demoAvatar("copy"), audience: 2_500_000,
    });
    const ev = await evaluate(c, twinCtx(), TODAY);
    expect(ev.status).toBe("LIKELY_OFFICIAL");
    expect(ev.official!.level).toBe(5);
  });

  it("a twin without an established audience is still scored", async () => {
    const c = app("id9990002", "ZentraPay: UPI, Bills & Cards", "Copycat Apps", "778", {
      platform: "app_store", image: demoAvatar("copy"), audience: 40,
    });
    const ev = await evaluate(c, twinCtx(), TODAY);
    expect(ev.official).toBeNull();
    expect(flagged(ev)).toBe(true);
  });

  it("suggests the official apps of an unregistered brand", () => {
    const blank = emptyContext({ brandId: "adhoc", name: "Acme Pay", aliases: ["Acme Pay"] });
    const live = (platform: string, handle: string, title: string, publisher: string, pid: string, audience: number) =>
      app(handle, title, publisher, pid, { platform, audience, sourceId: platform === "google_play" ? "src_play" : "src_appstore" });
    const s = suggestOfficial("Acme Pay", [
      live("google_play", "com.acmepay.app", "Acme Pay: UPI", "Acme Pay", "DEV1", 5_000_000),
      live("google_play", "com.acmepay.merchant", "Acme Pay for Business", "Acme Pay", "DEV1", 200_000),
      live("google_play", "com.fake.acmepay", "Acme Pay Customer Care", "Help Apps", "DEV9", 50),
      live("app_store", "id100", "Acme Pay: UPI", "Acme Technologies Pvt Ltd", "AP1", 300_000),
    ], blank)!;
    const ids = new Set(s.apps.map((a) => a.packageId));
    for (const id of ["com.acmepay.app", "com.acmepay.merchant", "id100"]) expect(ids.has(id)).toBe(true); // incl. the App Store twin
    expect(ids.has("com.fake.acmepay")).toBe(false);
  });
});
