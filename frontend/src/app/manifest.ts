import type { MetadataRoute } from "next";

/** Web app manifest: lets the site be installed as an app on phones and desktops. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    // The name shown under the icon once the app is installed.
    name: "IMPOSTR",
    short_name: "IMPOSTR",
    description: "Find fake social profiles, brand pages and apps impersonating your brand.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Splash screen while the installed app opens: the logo on black.
    background_color: "#000000",
    theme_color: "#111111",
    categories: ["security", "business", "productivity"],
    icons: [
      { src: "/icons/impostr-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/impostr-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/impostr-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Quick check", url: "/check", icons: [{ src: "/icons/impostr-192.png", sizes: "192x192" }] },
      { name: "Detections", url: "/detections", icons: [{ src: "/icons/impostr-192.png", sizes: "192x192" }] },
    ],
  };
}
