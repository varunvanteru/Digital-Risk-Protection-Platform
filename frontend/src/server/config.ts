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
  // Password for pausing and resuming sources, which every workspace shares. Unset: open.
  adminPassword: process.env.ADMIN_PASSWORD || "",
  // data/ holds what the app uses: the labelled test set of the Accuracy page and the word list.
  dataDir: path.join(process.cwd(), "data"),
  // The automated tests' curated datasets, their test brand and its images (fixture mode only).
  fixturesDir: path.join(process.cwd(), "tests", "fixtures"),
  // "live" (default): every source searches the real platform, or is shown as not connected.
  // "fixtures": the curated datasets stand in for the social sources; used only by the automated
  // tests, so they are repeatable and offline.
  dataMode: process.env.DATA_MODE === "fixtures" ? ("fixtures" as const) : ("live" as const),
  // API keys for the live connectors. A connector without its key is shown as not connected.
  youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
  braveApiKey: process.env.BRAVE_SEARCH_API_KEY || "",
  // Second web-search provider (Google results): used when Brave is out of credit or fails, or alone.
  serperApiKey: process.env.SERPER_API_KEY || "",
};
