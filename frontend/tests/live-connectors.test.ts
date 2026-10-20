/**
 * The live connectors' parsers, offline: Telegram pages, YouTube and Reddit API records, and
 * web-search results. The page and API shapes below are copied from real responses.
 */

import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  discordInvite,
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
    // Phone numbers in a page name are not a follower count (a real Facebook page title).
    expect(parseAudience("Phone pee customer care 08825176742 06291670660. 35 likes. Just for fun")).toBe(35);
    expect(parseAudience("Call 9800000000 now, 1,204 followers")).toBe(1204);
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
      ["facebook", "https://www.facebook.com/community/whats-new/phonepe-not-working/", null],
      ["x", "https://x.com/PhonePeCare_/status/1799", "PhonePeCare_"],
      ["x", "https://twitter.com/search?q=phonepe", null],
      ["linkedin", "https://in.linkedin.com/company/phonepe-internet", "phonepe-internet"],
      ["linkedin", "https://www.linkedin.com/posts/someone_activity-1", null],
      ["linkedin", "https://in.linkedin.com/in/manjeet-singh-a60752159", "in/manjeet-singh-a60752159"],
      ["threads", "https://www.threads.net/@paytm.offers/post/C9", "paytm.offers"],
      ["pinterest", "https://in.pinterest.com/paytmcashback/", "paytmcashback"],
      ["pinterest", "https://www.pinterest.com/pin/12345/", null],
      ["quora", "https://www.quora.com/profile/PhonePe-Customer-Care", "PhonePe-Customer-Care"],
      ["quora", "https://phonepehelp.quora.com/", "space:phonepehelp"],
      ["quora", "https://www.quora.com/What-is-PhonePe", null],
      ["snapchat", "https://www.snapchat.com/add/paytm_offers", "paytm_offers"],
      ["sharechat", "https://sharechat.com/profile/phonepe_rewards", "phonepe_rewards"],
      // Shapes from the live search
      ["whatsapp", "https://www.whatsapp.com/channel/0029VaPhonePe01Offers", "0029VaPhonePe01Offers"],
      ["whatsapp", "https://chat.whatsapp.com/KfGqPaytmRefund12345", "group:KfGqPaytmRefund12345"],
      ["whatsapp", "https://api.whatsapp.com/send?text=PhonePe", null],
      ["whatsapp", "https://faq.whatsapp.com/1324084875126592/", null],
      ["discord", "https://discord.com/invite/smartphones-542326846239277064", "smartphones-542326846239277064"],
      ["discord", "https://discord.gg/paytmhelp", "paytmhelp"],
      ["discord", "https://support.discord.com/hc/en-us/community/posts/1", null],
      ["moj", "https://mojapp.in/@paytm_offers", "paytm_offers"],
      ["moj", "https://mojapp.in/video/1782384542", null],
      ["josh", "https://share.myjosh.in/profile/954b6e78-2a5d-4493-867d-a619f3de4951", "954b6e78-2a5d-4493-867d-a619f3de4951"],
      ["josh", "https://share.myjosh.in/tags/pleasebus", null],
    ];
    for (const [platform, url, handle] of cases) expect([platform, url, webProfileHandle(platform, url)]).toEqual([platform, url, handle]);
    expect(webProfileUrl("facebook", "100089999999999")).toBe("https://www.facebook.com/profile.php?id=100089999999999");
    expect(webProfileUrl("quora", "space:phonepehelp")).toBe("https://phonepehelp.quora.com");
    expect(webProfileUrl("linkedin", "in/manjeet-singh-a60752159")).toBe("https://www.linkedin.com/in/manjeet-singh-a60752159");
    expect(webProfileUrl("linkedin", "paytmmoney")).toBe("https://www.linkedin.com/company/paytmmoney");
    expect(webProfileUrl("whatsapp", "0029VaPhonePe01Offers")).toBe("https://whatsapp.com/channel/0029VaPhonePe01Offers");
    expect(webProfileUrl("whatsapp", "group:KfGqPaytmRefund12345")).toBe("https://chat.whatsapp.com/KfGqPaytmRefund12345");
    expect(webProfileUrl("discord", "paytmhelp")).toBe("https://discord.gg/paytmhelp");
    expect(webProfileUrl("moj", "paytm_offers")).toBe("https://mojapp.in/@paytm_offers");
  });

  it("cleans the page titles platforms use", () => {
    expect(cleanTitle("PhonePe Support (@phonepe.support.help) • Instagram photos and videos")).toBe("PhonePe Support");
    expect(cleanTitle("Paytm Care India | Facebook")).toBe("Paytm Care India");
    expect(cleanTitle("PhonePe Care (@PhonePeCare_) / X")).toBe("PhonePe Care");
    expect(cleanTitle("Paytm Offers on Threads")).toBe("Paytm Offers");
    expect(cleanTitle("PhonePe &amp; UPI Help - Quora")).toBe("PhonePe & UPI Help");
    // Real titles from the live search
    expect(cleanTitle('Paytm Travel Care on X: "@brajtomar1 Hi Braj, we are sorry"')).toBe("Paytm Travel Care");
    expect(cleanTitle("Paytm Payments Bank (@PaytmBank) / ...")).toBe("Paytm Payments Bank");
    expect(cleanTitle("Paytm (paytm) – Profile | Pinterest")).toBe("Paytm");
    expect(cleanTitle("Fortress Solutions (@fortsol) / Posts")).toBe("Fortress Solutions");
  });

  it("uses the handle when the platform shows a login wall or its own name as the title", () => {
    const [fb] = webCandidates("facebook", [{ title: "Log in or sign up to view", url: "https://www.facebook.com/foresitesolutions", description: "" }], "src_fb");
    const [ig] = webCandidates("instagram", [{ title: "Instagram", url: "https://www.instagram.com/fourst/", description: "" }], "src_ig");
    expect(fb.displayName).toBe("foresitesolutions");
    expect(ig.displayName).toBe("fourst");
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

describe("Discord invites", () => {
  const found = webCandidates("discord", [{ title: "Join the Paytm Help Discord Server!", url: "https://discord.gg/paytmhelp", description: "Refund and KYC help" }], "src_discord")[0];

  it("takes the server's real name, description, icon and member count from Discord's invite lookup", () => {
    const c = discordInvite(
      { approximate_member_count: 1234, guild: { id: "1029384756", name: "Paytm Help Desk", description: "Official refund help, DM admin https://wa.me/919800000000", icon: "abc123", features: [] } },
      found,
    )!;
    expect(c).toMatchObject({
      platform: "discord", identifier: "paytmhelp", url: "https://discord.gg/paytmhelp", displayName: "Paytm Help Desk",
      audience: 1234, publisherId: "1029384756", image: "https://cdn.discordapp.com/icons/1029384756/abc123.png?size=256", verified: false,
    });
    expect(c.bio).toContain("Official refund help");
    expect(c.links).toContain("https://wa.me/919800000000");
  });

  it("drops invites that lead to no server", () => {
    expect(discordInvite(null, found)).toBeNull();
    expect(discordInvite({ channel: { id: "1" } }, found)).toBeNull();
  });
});

describe("platforms with no public search", () => {
  it("say so and return nothing", async () => {
    const wa = new NotConnected("src_wa", "Not connected: WhatsApp has no public search or API for channels");
    expect(wa.notConnected()).toMatch(/WhatsApp/);
    await expect(wa.fetch()).rejects.toBeInstanceOf(SourceNotConnected);
  });
});
