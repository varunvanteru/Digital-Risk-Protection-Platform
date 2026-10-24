/** Unit tests for the detection engine (port of backend/tests/test_engine.py). */

import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { DEMO_LOGO } from "@/server/demoAssets";
import { clearImageCache, compare } from "@/server/detection/images";
import { analyseName, nameSimilarity } from "@/server/detection/lookalike";
import { scoreDetection, severityOf } from "@/server/detection/scoring";
import { behaviourSignal, claimsSignal, contextLabel, isLookalikeDomain, textSimilarity } from "@/server/detection/text";
import { pyRound } from "@/server/util";
import { demoAvatar } from "./helpers";

afterAll(() => pool().end());

const ALIASES = ["ZentraPay", "Zentra", "Zentra Pay"];

describe("look-alike names", () => {
  it.each([
    ["z3ntra.pay_official", "Homoglyph / leetspeak"],
    ["zentrapay_support_india", "Added words"],
    ["zentra.pay", "Spacing / separators"],
    ["zentarpay", "Character swap"],
    ["zentrapayy", "Missing / doubled letter"],
    ["zentrаpay", "Homoglyph / leetspeak"], // Cyrillic a
    ["instagram.com/zentrapay_care_india", "Added words"],
  ])("%s is caught (%s)", (name, variation) => {
    const r = analyseName(name, ALIASES);
    expect(r.verdict).toBe("match");
    expect(r.variations).toContain(variation);
  });

  it.each(["Zentro Foods", "sentra", "paytm", "chai_and_code"])("%s is not flagged", (name) => {
    expect(analyseName(name, ALIASES).verdict).toBe("no_match");
  });

  it("unrelated words are only partial", () => {
    const r = analyseName("zentrafitness", ALIASES);
    expect(r.verdict).toBe("partial");
    expect(r.guards.length).toBeGreaterThan(0);
  });

  it("a misspelling of a shortened brand name is only partial", () => {
    // "Zenvra: The Real Debt Tracker", a real unrelated Play Store app: one letter off "Zentra", not "ZentraPay".
    expect(nameSimilarity(["Zenvra: The Real Debt Tracker", "com.wantok.zenvra"], ALIASES)[0]).toBeLessThan(0.85);
    expect(analyseName("zenvra", ALIASES).verdict).toBe("partial");
    // The exact short name and misspellings of the full name still match.
    expect(nameSimilarity(["Zentra Lite"], ALIASES)[0]).toBeGreaterThanOrEqual(0.85);
    expect(analyseName("zentrpay", ALIASES).verdict).toBe("match");
  });

  it("finds the brand inside a long app title", () => {
    const [score, r] = nameSimilarity(["ZentraPay Wallet - UPI & Bills"], ALIASES);
    expect(score).toBe(0.85);
    expect(r.method).toContain("inside a longer name");
  });
});

describe("scoring", () => {
  it("severity bands", () => {
    expect([80, 79, 60, 59, 40, 39].map(severityOf)).toEqual(["critical", "high", "high", "medium", "medium", "low"]);
  });

  it("a single strong signal is capped Low", () => {
    // Uncapped this would be 55: one strong signal plus several middling ones.
    const bd = scoreDetection("social", { name: 1.0, logo: 0.45, claims: 0.45, behaviour: 0.35 });
    expect(bd.score).toBe(39);
    expect(bd.cap).toBeTruthy();
  });

  it("a brand look-alike name with scam behaviour is flagged", () => {
    // e.g. "Zentra Rewards: spin and win cashback" from a 2-week-old account
    const bd = scoreDetection("social", { name: 0.95, logo: 0.07, behaviour: 0.4 });
    expect(bd.severity).toBe("medium");
    expect(bd.boosts.map((b) => b.label)).toContain("Brand look-alike name with scam behaviour");
    // ... but an openly labelled fan or news account is still capped
    expect(scoreDetection("social", { name: 0.95, behaviour: 0.4 }, false, "fan").score).toBe(39);
  });

  it("a publisher mismatch alone does not lift a name match", () => {
    expect(scoreDetection("app", { name: 0.85, publisher: 1.0, logo: 0.2 }).severity).toBe("low");
  });

  it("a fan label caps the score", () => {
    expect(scoreDetection("social", { name: 0.95, logo: 0.99, text: 0.6 }, false, "fan").score).toBe(39);
  });

  it("boosts apply", () => {
    const bd = scoreDetection("social", { name: 0.9, logo: 0.9, claims: 0.8, behaviour: 0.9 }, true);
    expect(bd.boosts.map((b) => b.label)).toContain("Links to a look-alike of an official domain");
    expect(bd.score).toBe(100);
  });

  it("rounds like Python (ties to even)", () => {
    expect([pyRound(0.5), pyRound(1.5), pyRound(2.5), pyRound(38.5)]).toEqual([0, 2, 2, 38]);
    expect([pyRound(0.125, 2), pyRound(0.375, 2), pyRound(2.675, 2), pyRound(0.25, 1)]).toEqual([0.12, 0.38, 2.67, 0.2]);
  });
});

describe("text signals", () => {
  it("spots a copied description", () => {
    const official = "ZentraPay lets you pay bills, send money over UPI and manage cards in one secure app.";
    expect(textSimilarity(official.replace("ZentraPay", "ZentraPay Wallet"), official)).toBeGreaterThan(0.7);
    expect(textSimilarity("Home workouts and diet plans.", official)).toBeLessThan(0.1);
  });

  it("claims and context labels", () => {
    const [score, hits] = claimsSignal("ZentraPay Care", "Official helpline 24x7", false);
    expect(score).toBeGreaterThanOrEqual(0.9);
    expect(hits).toContain("official");
    expect(claimsSignal("ZentraPay", "Official account", true)[0]).toBe(0);
    expect(contextLabel("Unofficial fan page, not affiliated")).toBe("fan");
  });

  it("scam behaviour", () => {
    const [score, reasons, lookalike] = behaviourSignal(
      "DM your registered number and OTP for an instant refund. wa.me/9198",
      ["zentrapay-refund.xyz"],
      "2026-10-04",
      112,
      "2026-10-10",
      ["zentrapay.com", "zentrapay.in"],
      ["zentrapay", "zentra"],
    );
    expect(score).toBeGreaterThanOrEqual(0.8);
    expect(lookalike).toBe(true);
    expect(reasons.some((r) => r.includes("days old"))).toBe(true);
  });

  it("affiliate marketing: referral and promo codes, affiliate networks, tracking links", () => {
    const sig = (bio: string, links: string[] = []) => behaviourSignal(bio, links, null, 5000, "2026-10-10", ["phonepe.com"], ["phonepe"]);
    let [score, reasons] = sig("Use my code PHN500 for extra 20% off on every PhonePe recharge!");
    expect(score).toBeGreaterThanOrEqual(0.25);
    expect(reasons).toContain("Promotes a referral or promo code (“use my code”)");
    [score, reasons] = sig("PhonePe deals daily", ["https://earnkaro.com/r/abc123"]);
    expect(reasons).toContain("Routes through an affiliate marketing network (earnkaro.com)");
    [score, reasons] = sig("PhonePe offers", ["https://phonepe-offers.shop/?ref=deal42", "https://deals.example.in/p?aff=99"]);
    expect(reasons.filter((r) => r.startsWith("Uses an affiliate or referral tracking link"))).toEqual(["Uses an affiliate or referral tracking link (?ref=…)"]); // once per profile
    expect(score).toBeLessThanOrEqual(1);
    // Ordinary link parameters (tag, pid, aid) and plain wording are not affiliate evidence.
    [score, reasons] = sig("Tips and news about UPI payments", ["https://www.youtube.com/watch?v=abc&pid=12&tag=upi"]);
    expect(reasons.some((r) => /affiliate|referral|promo/i.test(r))).toBe(false);
  });

  it("look-alike domains", () => {
    const official = ["zentrapay.com", "zentrapay.in"];
    expect(isLookalikeDomain("zentrapaay.in", official, ["zentrapay"])).toBe(true);
    expect(isLookalikeDomain("zentrapay.in", official, ["zentrapay"])).toBe(false);
    expect(isLookalikeDomain("anydesk.com", official, ["zentrapay"])).toBe(false);
  });

  it("other companies' own sites that share a word with the brand are not look-alikes", () => {
    // Real developer sites of unrelated "Zentra ..." apps found in a live Play / App Store scan.
    const official = ["zentrapay.com", "zentrapay.in"];
    const aliases = ["zentrapay", "zentra", "zentrapay"];
    for (const d of ["zentra.co", "zentrapos.com", "energyzentra.com", "tryzentra.com", "zenta.in", "zentra.ar", "myzentra.com", "zentravpn.com"])
      expect(isLookalikeDomain(d, official, aliases), d).toBe(false);
    for (const d of ["zentrapay-refund.xyz", "zentrapaay.in", "z3ntrapay-kyc.top", "zentrapay.co", "my-zentrapay.help"])
      expect(isLookalikeDomain(d, official, aliases), d).toBe(true);
    expect(isLookalikeDomain("ph0nepe-rewards.top", ["phonepe.com"], ["phonepe", "phonepe"])).toBe(true);
  });
});

describe("logo similarity on pixels", () => {
  it("recognises a copy and a mirror, not an unrelated logo", async () => {
    clearImageCache();
    const official = `/media/${DEMO_LOGO}`;
    const copy = (await compare(official, demoAvatar("copy")))!;
    const mirror = (await compare(official, demoAvatar("mirror")))!;
    const other = (await compare(official, demoAvatar("unrelated")))!;
    expect(copy.score).toBeGreaterThanOrEqual(0.9);
    expect(copy.kind).toBe("copy");
    expect(mirror.score).toBeGreaterThanOrEqual(0.9);
    expect(mirror.kind).toBe("mirror");
    expect(other.score).toBeLessThan(0.5);
  });
});

// Real Indian brands that are commonly impersonated; found in manual testing.
const REAL: Record<string, string[]> = {
  PhonePe: ["PhonePe", "Phone Pe"],
  Paytm: ["Paytm"],
  Flipkart: ["Flipkart"],
  Swiggy: ["Swiggy"],
  Zomato: ["Zomato"],
  IRCTC: ["IRCTC", "IRCTC Rail Connect"],
  SBI: ["SBI", "YONO", "YONO SBI", "State Bank of India"],
};

describe("real brands", () => {
  it.each([
    ["PhonePe", "ph0nepe"], ["PhonePe", "phonepe_support_india"], ["PhonePe", "phonpe"],
    ["Paytm", "paytrn"], ["Paytm", "pay.tm"], ["Paytm", "paytym"],
    ["Flipkart", "fl1pkart"], ["Flipkart", "flipkart.offers"], ["Flipkart", "filpkart"],
    ["Swiggy", "swigy"], ["Zomato", "zomato_refunds"], ["Zomato", "z0mato"],
    ["IRCTC", "irctc_helpline"], ["IRCTC", "irtc"],
    ["SBI", "yono_sbi_kyc"], ["SBI", "sbi.customer.care"], ["SBI", "statebankofindia_help"],
  ])("%s look-alike %s is caught", (brand, name) => {
    expect(analyseName(name, REAL[brand]).verdict).toBe("match");
  });

  it.each([
    ["PhonePe", "phone"], ["PhonePe", "iphone"], ["Zomato", "tomato"], ["Swiggy", "swing"],
    ["Flipkart", "flipboard"], ["Paytm", "paytime"], ["SBI", "yoga"], ["IRCTC", "ircon"],
  ])("%s: ordinary word %s is not flagged", (brand, name) => {
    expect(analyseName(name, REAL[brand]).verdict).toBe("no_match");
  });
});
