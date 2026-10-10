import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root; a stray lockfile higher up the tree confuses inference.
  outputFileTracingRoot: path.join(__dirname),
  // The API (src/server) uses these at runtime from node_modules instead of bundling them.
  serverExternalPackages: ["mysql2", "sharp", "google-play-scraper"],
};

export default nextConfig;
