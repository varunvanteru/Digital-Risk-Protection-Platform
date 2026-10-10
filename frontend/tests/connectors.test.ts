/** Live connectors, run against recorded responses (no network). Port of test_connectors.py. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceUnavailable } from "@/server/connectors/base";
import { AppStoreLive, GooglePlayLive, parsePlayDate } from "@/server/connectors/stores";
import { parseQuery } from "@/server/services/urls";

const play = vi.hoisted(() => ({ search: vi.fn(), app: vi.fn() }));
vi.mock("google-play-scraper", () => ({ default: play }));

afterEach(() => {
  vi.unstubAllGlobals();
  play.search.mockReset();
  play.app.mockReset();
});

const ITUNES = {
  resultCount: 1,
  results: [
    {
      trackId: 6450011223,
      trackName: "Zentra Pay: Rewards",
      sellerName: "Rewardly Labs",
      artistId: 1690023344,
      artworkUrl512: "https://is1-ssl.mzstatic.com/x.png",
      description: "Earn rewards on every Zentra Pay transaction.",
      releaseDate: "2026-09-22T07:00:00Z",
      userRatingCount: 41,
      trackViewUrl: "https://apps.apple.com/in/app/id6450011223",
    },
  ],
};

describe("App Store", () => {
  it("parses results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ITUNES), { status: 200 })));
    const [c] = await new AppStoreLive().fetch(["zentra"]);
    expect(c.identifier).toBe("id6450011223");
    expect(c.publisher).toBe("Rewardly Labs");
    expect(c.publisherId).toBe("1690023344");
    expect(c.createdOn).toBe("2026-09-22");
  });

  it("reports a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(new AppStoreLive().fetch(["zentra"])).rejects.toBeInstanceOf(SourceUnavailable);
  });
});

describe("Google Play", () => {
  it("searches and enriches", async () => {
    play.search.mockResolvedValue([{ appId: "com.zentrapay.wallet.upi", title: "ZentraPay Wallet", developer: "ZP Tech Apps", icon: "https://x/icon.png" }]);
    play.app.mockResolvedValue({
      title: "ZentraPay Wallet",
      description: "Pay bills over UPI",
      maxInstalls: 812,
      released: "Oct 1, 2026",
      developer: "ZP Tech Apps",
      developerId: "6630011920045123",
      privacyPolicy: "https://sites.google.com/view/zptech",
      icon: "https://x/icon.png",
    });
    const conn = new GooglePlayLive();
    const [c] = await conn.fetch(["zentra"]);
    expect(c.identifier).toBe("com.zentrapay.wallet.upi");
    await conn.enrich(c);
    expect(c.publisherId).toBe("6630011920045123");
    expect(c.audience).toBe(812);
    expect(c.createdOn).toBe("2026-10-01");
  });

  it("reports a failure", async () => {
    play.search.mockRejectedValue(new Error("blocked"));
    await expect(new GooglePlayLive().fetch(["zentra"])).rejects.toBeInstanceOf(SourceUnavailable);
  });

  it("parses the store's date formats", () => {
    expect(parsePlayDate("Aug 29, 2016")).toBe("2016-08-29");
    expect(parsePlayDate("29 Aug 2016")).toBe("2016-08-29");
    expect(parsePlayDate("August 29, 2016")).toBe("2016-08-29");
    expect(parsePlayDate("29 August 2016")).toBeNull();
    expect(parsePlayDate("")).toBeNull();
  });
});

describe("pasted URLs (port of test_search.py)", () => {
  it("names and URLs", () => {
    expect(parseQuery("ZentraPay").name).toBe("ZentraPay");
    expect(parseQuery("@zentrapay").name).toBe("zentrapay");
    let q = parseQuery("https://www.instagram.com/zentrapay/");
    expect([q.platform, q.identifier, q.name]).toEqual(["instagram", "zentrapay", "zentrapay"]);
    q = parseQuery("x.com/ZentraPay");
    expect([q.platform, q.identifier]).toEqual(["x", "zentrapay"]);
    q = parseQuery("https://play.google.com/store/apps/details?id=com.zentrapay.app");
    expect([q.platform, q.identifier, q.name]).toEqual(["google_play", "com.zentrapay.app", "zentrapay"]);
    q = parseQuery("https://apps.apple.com/in/app/zentrapay/id1234567890");
    expect([q.platform, q.identifier]).toEqual(["app_store", "id1234567890"]);
  });

  it("Indian platform URLs", () => {
    const cases: Record<string, [string, string]> = {
      "https://www.youtube.com/@zentrapay": ["youtube", "zentrapay"],
      "https://www.linkedin.com/company/zentrapay/": ["linkedin", "zentrapay"],
      "https://whatsapp.com/channel/0029VaZentraPay01": ["whatsapp", "0029vazentrapay01"],
      "https://www.threads.net/@zentrapay": ["threads", "zentrapay"],
      "https://sharechat.com/profile/zentrapay_sahayata": ["sharechat", "zentrapay_sahayata"],
      "https://mojapp.in/@zentrapay.cashback": ["moj", "zentrapay.cashback"],
      "https://share.myjosh.in/profile/zentra_pay_rewards": ["josh", "zentra_pay_rewards"],
      "https://in.pinterest.com/zentrapayindia/": ["pinterest", "zentrapayindia"],
      "https://www.reddit.com/user/ZentraPay_Support_Team": ["reddit", "zentrapay_support_team"],
      "https://www.quora.com/profile/ZentraPay-Customer-Care-Number": ["quora", "zentrapay-customer-care-number"],
      "https://discord.gg/zentrapay-rewards": ["discord", "zentrapay-rewards"],
      "https://www.snapchat.com/add/zentrapay_snap": ["snapchat", "zentrapay_snap"],
    };
    for (const [url, expected] of Object.entries(cases)) {
      const q = parseQuery(url);
      expect([q.platform, q.identifier], url).toEqual(expected);
    }
  });
});
