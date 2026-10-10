import path from "node:path";

/** Server settings from environment variables (hPanel → Environment variables, or .env.local). */
export const settings = {
  mysqlHost: process.env.MYSQL_HOST ?? "localhost",
  mysqlPort: Number(process.env.MYSQL_PORT ?? 3306),
  mysqlUser: process.env.MYSQL_USER ?? "root",
  mysqlPassword: process.env.MYSQL_PASSWORD ?? "",
  mysqlDb: process.env.MYSQL_DB ?? "brandshield",
  // Per-source network budget from the design doc: 10 s timeout, 2 retries.
  sourceTimeoutMs: Number(process.env.SOURCE_TIMEOUT_S ?? 10) * 1000,
  sourceRetries: Number(process.env.SOURCE_RETRIES ?? 2),
  // Validate official apps against the live stores. Off in offline tests.
  validateAssets: (process.env.VALIDATE_ASSETS ?? "1") === "1",
  // data/ holds the simulated datasets, the labelled test set and the word list.
  dataDir: path.join(process.cwd(), "data"),
};
