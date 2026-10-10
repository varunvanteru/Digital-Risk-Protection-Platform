import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root; a stray lockfile higher up the tree confuses inference.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
