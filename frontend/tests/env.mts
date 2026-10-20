/** Test settings: local MySQL credentials from .env.local, a separate schema, offline validation. */
import fs from "node:fs";
import path from "node:path";

export function testEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const file = path.join(import.meta.dirname, "..", ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(MYSQL_[A-Z_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return {
    ...env,
    // Integration tests use their own schema so the dev database is never touched.
    MYSQL_DB: "brandshield_test_node",
    SOURCE_RETRIES: "0",
    SOURCE_TIMEOUT_S: "5",
    // Offline: never call the live stores to validate official apps during tests.
    VALIDATE_ASSETS: "0",
    // Repeatable: the curated fixtures stand in for the social sources.
    DATA_MODE: "fixtures",
  };
}
