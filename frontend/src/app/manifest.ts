import type { MetadataRoute } from "next";

/** Web app manifest: lets the site be installed as an app on phones and desktops. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BrandShield — Digital Risk Protection",
    short_name: "BrandShield",
    description: "Find fake social profiles, brand pages and apps impersonating your brand.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#edf0f5",
    theme_color: "#111111",
    categories: ["security", "business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Quick check", url: "/check", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Detections", url: "/detections", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
