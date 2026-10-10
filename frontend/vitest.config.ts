import path from "node:path";
import { defineConfig } from "vitest/config";
import { testEnv } from "./tests/env";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false, // the files share one test database
    testTimeout: 120_000,
    hookTimeout: 300_000,
    env: testEnv(),
  },
});
