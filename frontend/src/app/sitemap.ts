import type { MetadataRoute } from "next";

const PAGES = ["/", "/how-to-use", "/setup", "/detections", "/check", "/brand", "/sources", "/accuracy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: `https://impostr.live${p === "/" ? "" : p}`, changeFrequency: "weekly", priority: p === "/" || p === "/how-to-use" ? 1 : 0.7 }));
}
