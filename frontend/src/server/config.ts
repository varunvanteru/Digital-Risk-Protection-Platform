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
  // Password for actions that change data (edit brands, change detection status, simulate outages).
  // Unset: open, as in local development. Set it in hPanel for the public site.
  adminPassword: process.env.ADMIN_PASSWORD || "",
  // data/ holds the labelled test set, the word list and the test fixtures.
  dataDir: path.join(process.cwd(), "data"),
  // "live" (default): every source searches the real platform, or is shown as not connected.
  // "fixtures": the curated datasets stand in for the social sources; used only by the automated
  // tests, so they are repeatable and offline.
  dataMode: process.env.DATA_MODE === "fixtures" ? ("fixtures" as const) : ("live" as const),
  // API keys for the live connectors. A connector without its key is shown as not connected.
  youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
  braveApiKey: process.env.BRAVE_SEARCH_API_KEY || "",
  redditClientId: process.env.REDDIT_CLIENT_ID || "",
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET || "",
};
