import path from "node:path";
import { defineConfig } from "vitest/config";
import { testEnv } from "./tests/env.mts";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.mts"],
    fileParallelism: false, // the files share one test database
    testTimeout: 120_000,
    hookTimeout: 300_000,
    env: testEnv(),
  },
});
