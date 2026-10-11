import type { MetadataRoute } from "next";

/** Everyone, including AI reviewers and crawlers, may read the app. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://impostr.live/sitemap.xml",
  };
}
