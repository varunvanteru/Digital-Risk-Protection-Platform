/**
 * The live connectors' parsers, offline: Telegram pages, YouTube and Reddit API records, and
 * web-search results. The page and API shapes below are copied from real responses.
 */

import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  NotConnected,
  parseAudience,
  parseTelegramPage,
  redditCommunity,
  redditUser,
  SourceNotConnected,
  telegramHandles,
  webCandidates,
  webProfileHandle,
  webProfileUrl,
  YouTubeLive,
  youtubeChannel,
} from "@/server/connectors/live";

const tgPage = (title: string, desc: string, image: string, extra = "") =>
  `<html><head><meta property="og:title" content="${title}"><meta property="og:image" content="${image}">` +
  `<meta property="og:description" content="${desc}"></head><body><div class="tgme_page_title"><span dir="auto">${title}</span></div>` +
  (extra ? `<div class="tgme_page_extra">${extra}</div>` : "") +
  "</body></html>";

describe("Telegram", () => {
  it("builds the usernames an impersonator would pick, within Telegram's rules", () => {
    const hs = telegramHandles(["PhonePe", "Phone Pe"]);
    expect(hs.slice(0, 1)).toEqual(["phonepe"]);
    expect(hs).toContain("phonepe_support");
    expect(hs).toContain("phonepecustomercare");
    expect(hs.every((h) => /^[a-z][a-z0-9_]{4,31}$/.test(h) && !h.endsWith("_"))).toBe(true);
    expect(new Set(hs).size).toBe(hs.length);
    // Too short to build a brand username from.
    expect(telegramHandles(["ab"])).toEqual([]);
  });

  it("reads a real channel page", () => {
    const c = parseTelegramPage(
      tgPage("Paytm care", "Refund help &amp; KYC, message https://wa.me/919800000000", "https://cdn4.telesco.pe/file/abc.jpg", "1 374 915 subscribers"),
      "paytm_care",
    )!;
    expect(c).toMatchObject({
      platform: "telegram", identifier: "paytm_care", handle: "paytm_care", displayName: "Paytm care",
      url: "https://t.me/paytm_care", audience: 1374915, image: "https://cdn4.telesco.pe/file/abc.jpg",
    });
    expect(c.bio).toBe("Refund help & KYC, message https://wa.me/919800000000");
    expect(c.links).toEqual(["https://wa.me/919800000000"]);
  });

  it("treats Telegram's 'Contact @name' page as no account, and drops filler text and generated avatars", () => {
    expect(parseTelegramPage(tgPage("Telegram: Contact @nobody_here", "", "https://telegram.org/img/t_logo_2x.png"), "nobody_here")).toBeNull();
    const c = parseTelegramPage(tgPage("Ijj", "You can view and join @phonepecustomercare right away.", "data:image/svg+xml;base64,AAAA"), "phonepecustomercare")!;
    expect(c.bio).toBe("");
    expect(c.image).toBeNull();
  });
});

describe("audience counts", () => {
  it("reads the counts platforms and search snippets show", () => {
    expect(parseAudience("1 374 915 subscribers")).toBe(1374915);
    expect(parseAudience("12.5K followers, 30 following")).toBe(12500);
    expect(parseAudience("3,201 members")).toBe(3201);
    expect(parseAudience("2M likes")).toBe(2_000_000);
    expect(parseAudience("no numbers here")).toBe(0);
  });
});

describe("YouTube", () => {
  it("maps a channel record, using the @handle when the channel has one", () => {
    const c = youtubeChannel({
      id: "UCe0domeQWPT2ZeIQDJg9XkA",
      snippet: { title: "PhonePe", customUrl: "@phonepe_", description: "Official channel. https://www.phonepe.com", publishedAt: "2016-03-01T10:00:00Z", thumbnails: { high: { url: "https://yt3.ggpht.com/x" } } },
      statistics: { subscriberCount: "245000" },
    });
    expect(c).toMatchObject({
      platform: "youtube", identifier: "phonepe_", handle: "phonepe_", url: "https://www.youtube.com/@phonepe_",
      audience: 245000, createdOn: "2016-03-01", image: "https://yt3.ggpht.com/x", links: ["https://www.phonepe.com"],
    });
    const noHandle = youtubeChannel({ id: "UCabc", snippet: { title: "Pay Care" }, statistics: { hiddenSubscriberCount: true } });
    expect(noHandle).toMatchObject({ identifier: "ucabc", url: "https://www.youtube.com/channel/UCabc", audience: 0 });
  });

  it("is not connected without an API key, and never returns anything then", async () => {
    const yt = new YouTubeLive();
    expect(yt.notConnected()).toMatch(/YOUTUBE_API_KEY/);
    await expect(yt.fetch(["phonepe"])).rejects.toBeInstanceOf(SourceNotConnected);
  });
});

describe("Reddit", () => {
  it("maps users and communities", () => {
    expect(redditUser({ name: "PhonePe_Support", created_utc: 1700000000, subreddit: { title: "PhonePe Support", public_description: "DM for refunds", subscribers: 12 }, icon_img: "https://styles.redditmedia.com/a.png?width=256&amp;s=1" })).toMatchObject({
      platform: "reddit", identifier: "phonepe_support", url: "https://www.reddit.com/user/PhonePe_Support", displayName: "PhonePe Support",
      bio: "DM for refunds", createdOn: "2023-11-14", image: "https://styles.redditmedia.com/a.png",
    });
    expect(redditUser({ name: "gone", is_suspended: true })).toBeNull();
    expect(redditCommunity({ display_name: "paytmhelp", title: "Paytm Help", subscribers: 900, public_description: "" })).toMatchObject({
      identifier: "paytmhelp", handle: "r/paytmhelp", url: "https://www.reddit.com/r/paytmhelp", audience: 900,
    });
  });
});

describe("web search results", () => {
  it("finds the account behind profile, page and post URLs, and skips site pages", () => {
    const cases: [string, string, string | null][] = [
      ["instagram", "https://www.instagram.com/phonepe.support.help/", "phonepe.support.help"],
      ["instagram", "https://www.instagram.com/p/C1abcDEF/", null],
      ["instagram", "https://www.instagram.com/reel/C1abc/", null],
      ["facebook", "https://m.facebook.com/PaytmCareIndia/posts/12345", "PaytmCareIndia"],
      ["facebook", "https://www.facebook.com/people/Paytm-Refund/100089999999999/", "100089999999999"],
      ["facebook", "https://www.facebook.com/groups/paytmhelp/", "groups/paytmhelp"],
      ["facebook", "https://www.facebook.com/watch/?v=1", null],
      ["x", "https://x.com/PhonePeCare_/status/1799", "PhonePeCare_"],
      ["x", "https://twitter.com/search?q=phonepe", null],
      ["linkedin", "https://in.linkedin.com/company/phonepe-internet", "phonepe-internet"],
      ["linkedin", "https://www.linkedin.com/posts/someone_activity-1", null],
      ["threads", "https://www.threads.net/@paytm.offers/post/C9", "paytm.offers"],
      ["pinterest", "https://in.pinterest.com/paytmcashback/", "paytmcashback"],
      ["pinterest", "https://www.pinterest.com/pin/12345/", null],
      ["quora", "https://www.quora.com/profile/PhonePe-Customer-Care", "PhonePe-Customer-Care"],
      ["quora", "https://phonepehelp.quora.com/", "space:phonepehelp"],
      ["quora", "https://www.quora.com/What-is-PhonePe", null],
      ["snapchat", "https://www.snapchat.com/add/paytm_offers", "paytm_offers"],
      ["sharechat", "https://sharechat.com/profile/phonepe_rewards", "phonepe_rewards"],
    ];
    for (const [platform, url, handle] of cases) expect([platform, url, webProfileHandle(platform, url)]).toEqual([platform, url, handle]);
    expect(webProfileUrl("facebook", "100089999999999")).toBe("https://www.facebook.com/profile.php?id=100089999999999");
    expect(webProfileUrl("quora", "space:phonepehelp")).toBe("https://phonepehelp.quora.com");
  });

  it("cleans the page titles platforms use", () => {
    expect(cleanTitle("PhonePe Support (@phonepe.support.help) • Instagram photos and videos")).toBe("PhonePe Support");
    expect(cleanTitle("Paytm Care India | Facebook")).toBe("Paytm Care India");
    expect(cleanTitle("PhonePe Care (@PhonePeCare_) / X")).toBe("PhonePe Care");
    expect(cleanTitle("Paytm Offers on Threads")).toBe("Paytm Offers");
    expect(cleanTitle("PhonePe &amp; UPI Help - Quora")).toBe("PhonePe & UPI Help");
  });

  it("merges several results for the same account into one candidate", () => {
    const cs = webCandidates(
      "instagram",
      [
        { title: "PhonePe Support (@phonepe.support.help) • Instagram photos and videos", url: "https://www.instagram.com/phonepe.support.help/", description: "<strong>2,104 followers</strong> · Official helpline, DM for refund" },
        { title: "Refund post", url: "https://www.instagram.com/phonepe.support.help/reel/abc/", description: "Call 9800000000 for KYC" },
        { title: "Explore", url: "https://www.instagram.com/explore/tags/phonepe/", description: "" },
      ],
      "src_ig",
    );
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({
      platform: "instagram", identifier: "phonepe.support.help", displayName: "PhonePe Support", audience: 2104,
      url: "https://www.instagram.com/phonepe.support.help/",
    });
    expect(cs[0].bio).toContain("Official helpline, DM for refund");
    expect(cs[0].bio).toContain("Call 9800000000 for KYC");
  });
});

describe("platforms with no public search", () => {
  it("say so and return nothing", async () => {
    const wa = new NotConnected("src_wa", "Not connected: WhatsApp has no public search or API for channels");
    expect(wa.notConnected()).toMatch(/WhatsApp/);
    await expect(wa.fetch()).rejects.toBeInstanceOf(SourceNotConnected);
  });
});
