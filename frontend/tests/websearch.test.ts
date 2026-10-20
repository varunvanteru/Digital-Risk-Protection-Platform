/**
 * Web search providers: Brave first, Serper when Brave is out of credit, and the shared 12-hour cache.
 * The providers' HTTP replies are stubbed, so no real credits are spent; the cache uses the test database.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { settings } from "@/server/config";
import { webSearch, WebSearchLive } from "@/server/connectors/live";
import { exec } from "@/server/db";
import { ready } from "@/server/init";

const saved = { brave: settings.braveApiKey, serper: settings.serperApiKey };
const calls: string[] = [];

function stubProviders(brave: { status: number; body: unknown }) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("https://api.search.brave.com/")) {
      calls.push("brave");
      return new Response(JSON.stringify(brave.body), { status: brave.status });
    }
    if (String(url) === "https://google.serper.dev/search") {
      calls.push("serper");
      const q = JSON.parse(String(init?.body)).q as string;
      return new Response(
        JSON.stringify({ organic: [{ title: "PhonePe Care Help (@phonepe.care.help) • Instagram photos and videos", link: "https://www.instagram.com/phonepe.care.help/", snippet: `result for ${q}` }] }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected request ${url}`);
  });
}

beforeAll(async () => {
  await ready();
  await exec("DELETE FROM source_cache WHERE source_id = 'websearch'");
  settings.braveApiKey = "test-brave";
  settings.serperApiKey = "test-serper";
});

afterAll(() => {
  vi.unstubAllGlobals();
  settings.braveApiKey = saved.brave;
  settings.serperApiKey = saved.serper;
});

describe("web search providers", () => {
  it("falls back to Serper when Brave's credits are used up, and says so", async () => {
    stubProviders({ status: 402, body: { error: { detail: "Prepaid credit balance is insufficient" } } });
    const out = await webSearch("phonepe site:instagram.com");
    expect(out.provider).toBe("Serper");
    expect(out.skipped).toEqual(["Brave: Brave Search credits are used up for this month"]);
    expect(out.results[0].url).toBe("https://www.instagram.com/phonepe.care.help/");
    expect(calls).toEqual(["brave", "serper"]);
  });

  it("does not ask an exhausted provider again for a while", async () => {
    calls.length = 0;
    const out = await webSearch("paytm site:instagram.com");
    expect(out.provider).toBe("Serper");
    expect(calls).toEqual(["serper"]); // Brave skipped, not called
    expect(out.skipped[0]).toMatch(/^Brave: Brave Search credits are used up/);
  });

  it("shares a query's results with every workspace for 12 hours", async () => {
    calls.length = 0;
    const out = await webSearch("PhonePe site:instagram.com"); // same query, any case
    expect(out.provider).toBeNull(); // answered from the shared cache
    expect(calls).toEqual([]);
    expect(out.results[0].url).toBe("https://www.instagram.com/phonepe.care.help/");
  });

  it("turns the results into accounts and notes the provider for the Sources page", async () => {
    calls.length = 0;
    const ig = new WebSearchLive("src_ig", "instagram");
    const found = await ig.fetch(["zomato"]);
    expect(found.map((c) => c.handle)).toEqual(["phonepe.care.help"]);
    expect(ig.statusNote()).toBe("Searched via Serper; Brave: Brave Search credits are used up for this month");
  });

  it("says plainly when every result came from the shared 12-hour results", async () => {
    calls.length = 0;
    const ig = new WebSearchLive("src_ig", "instagram");
    await ig.fetch(["zomato"]); // same queries as above: all from the shared results
    expect(calls).toEqual([]);
    expect(ig.statusNote()).toBe("From a live web search in the last 12 hours, shared by all users to save search credits");
  });

  it("is connected with either key, and not connected with neither", () => {
    const ig = new WebSearchLive("src_ig", "instagram");
    settings.braveApiKey = "";
    expect(ig.notConnected()).toBeNull(); // Serper alone is enough
    settings.serperApiKey = "";
    expect(ig.notConnected()).toMatch(/BRAVE_SEARCH_API_KEY or SERPER_API_KEY/);
    settings.braveApiKey = "test-brave";
    settings.serperApiKey = "test-serper";
  });
});
