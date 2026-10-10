/**
 * MySQL / MariaDB access. The schema matches backend/app/models.py column for
 * column, so the Python reference engine and this server share one database.
 *
 * Queries use the text protocol (pool.query), like PyMySQL, so FLOAT and DOUBLE
 * values read back exactly as the Python engine sees them.
 */

import mysql from "mysql2/promise";
import { settings } from "./config";

type Pool = mysql.Pool;
const g = globalThis as unknown as { __bsPool?: Pool };

export function pool(): Pool {
  if (!g.__bsPool) {
    g.__bsPool = mysql.createPool({
      host: settings.mysqlHost,
      port: settings.mysqlPort,
      user: settings.mysqlUser,
      password: settings.mysqlPassword,
      database: settings.mysqlDb,
      charset: "utf8mb4",
      dateStrings: true, // DATETIME stays naive UTC text, as stored
      supportBigNumbers: true,
      connectionLimit: 8,
      connectTimeout: 20_000,
      enableKeepAlive: true,
    });
  }
  return g.__bsPool;
}

export type Row = Record<string, unknown>;

export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool().query(sql, params);
  return rows as T[];
}

export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(sql, params))[0] ?? null;
}

export async function exec(sql: string, params: unknown[] = []): Promise<mysql.ResultSetHeader> {
  const [res] = await pool().query(sql, params);
  return res as mysql.ResultSetHeader;
}

/** JSON columns: objects on MySQL 8, text on MariaDB (where JSON is LONGTEXT). */
export function js<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

export const bool = (v: unknown) => v === 1 || v === true || v === "1";

/** Create the database if missing. On shared hosting it already exists and the user may not create one. */
export async function ensureDatabase(): Promise<void> {
  const conn = await mysql.createConnection({
    host: settings.mysqlHost,
    port: settings.mysqlPort,
    user: settings.mysqlUser,
    password: settings.mysqlPassword,
    connectTimeout: 20_000,
  });
  try {
    const [rows] = await conn.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = ?", [settings.mysqlDb]);
    if ((rows as unknown[]).length === 0) {
      await conn.query(`CREATE DATABASE \`${settings.mysqlDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }
  } finally {
    await conn.end();
  }
}

// Same DDL SQLAlchemy emits for backend/app/models.py (CreateTable, mysql dialect).
const TABLES: [string, string][] = [
  ["brands", `CREATE TABLE IF NOT EXISTS brands (
    id VARCHAR(40) NOT NULL, name VARCHAR(60) NOT NULL, aliases JSON NOT NULL, keywords JSON NOT NULL,
    domains JSON NOT NULL, description TEXT NOT NULL, logo_path VARCHAR(255), legal_name VARCHAR(160),
    is_active BOOL NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY (id))`],
  ["media_files", `CREATE TABLE IF NOT EXISTS media_files (
    path VARCHAR(255) NOT NULL, data MEDIUMBLOB NOT NULL, mtime DOUBLE NOT NULL, PRIMARY KEY (path))`],
  ["source_cache", `CREATE TABLE IF NOT EXISTS source_cache (
    id INTEGER NOT NULL AUTO_INCREMENT, source_id VARCHAR(30) NOT NULL, query_key VARCHAR(255) NOT NULL,
    fetched_at DATETIME NOT NULL, payload JSON NOT NULL, PRIMARY KEY (id),
    CONSTRAINT uq_source_cache UNIQUE (source_id, query_key))`],
  ["sources", `CREATE TABLE IF NOT EXISTS sources (
    id VARCHAR(30) NOT NULL, name VARCHAR(60) NOT NULL, platform VARCHAR(20) NOT NULL, channel VARCHAR(10) NOT NULL,
    mode VARCHAR(10) NOT NULL, health VARCHAR(12) NOT NULL, last_success DATETIME, latency_ms INTEGER,
    items_last_scan INTEGER NOT NULL, note VARCHAR(255), simulate_outage BOOL NOT NULL, state VARCHAR(12),
    PRIMARY KEY (id))`],
  ["detections", `CREATE TABLE IF NOT EXISTS detections (
    id VARCHAR(40) NOT NULL, brand_id VARCHAR(40) NOT NULL, source_id VARCHAR(30) NOT NULL, channel VARCHAR(10) NOT NULL,
    platform VARCHAR(20) NOT NULL, identifier VARCHAR(160) NOT NULL, cls VARCHAR(20) NOT NULL,
    display_name VARCHAR(200) NOT NULL, handle VARCHAR(160) NOT NULL, url VARCHAR(500) NOT NULL, mark VARCHAR(12) NOT NULL,
    icon_url VARCHAR(500), bio TEXT NOT NULL, audience INTEGER NOT NULL, created_on DATE, publisher VARCHAR(160),
    publisher_id VARCHAR(80), links JSON NOT NULL, first_seen DATETIME NOT NULL, last_seen DATETIME NOT NULL,
    scan_id VARCHAR(30) NOT NULL, signals JSON NOT NULL, reasons JSON NOT NULL, lookalike_domain BOOL NOT NULL,
    context_label VARCHAR(12), score INTEGER NOT NULL, severity VARCHAR(10) NOT NULL, status VARCHAR(20) NOT NULL,
    feedback_penalty FLOAT NOT NULL, checks JSON, PRIMARY KEY (id),
    CONSTRAINT uq_detection UNIQUE (brand_id, platform, identifier),
    FOREIGN KEY(brand_id) REFERENCES brands (id) ON DELETE CASCADE)`],
  ["official_assets", `CREATE TABLE IF NOT EXISTS official_assets (
    id INTEGER NOT NULL AUTO_INCREMENT, brand_id VARCHAR(40) NOT NULL, kind VARCHAR(10) NOT NULL,
    platform VARCHAR(20) NOT NULL, identifier VARCHAR(160) NOT NULL, handle VARCHAR(160) NOT NULL,
    canonical_id VARCHAR(160) NOT NULL, display_name VARCHAR(160) NOT NULL, status VARCHAR(12) NOT NULL,
    verified BOOL NOT NULL, publisher VARCHAR(120), publisher_id VARCHAR(80), created_at DATETIME NOT NULL,
    store_title VARCHAR(200), icon_url VARCHAR(500), validated_at DATETIME, validation_status VARCHAR(20),
    validation_note VARCHAR(255), PRIMARY KEY (id), CONSTRAINT uq_asset UNIQUE (brand_id, platform, identifier),
    FOREIGN KEY(brand_id) REFERENCES brands (id) ON DELETE CASCADE)`],
  ["publishers", `CREATE TABLE IF NOT EXISTS publishers (
    id INTEGER NOT NULL AUTO_INCREMENT, brand_id VARCHAR(40) NOT NULL, name VARCHAR(120) NOT NULL,
    publisher_id VARCHAR(80) NOT NULL, aliases JSON, PRIMARY KEY (id),
    FOREIGN KEY(brand_id) REFERENCES brands (id) ON DELETE CASCADE)`],
  ["scans", `CREATE TABLE IF NOT EXISTS scans (
    id VARCHAR(30) NOT NULL, brand_id VARCHAR(40) NOT NULL, status VARCHAR(12) NOT NULL, started_at DATETIME NOT NULL,
    finished_at DATETIME, candidates INTEGER NOT NULL, official_skipped INTEGER NOT NULL,
    official_flagged INTEGER NOT NULL, new_detections INTEGER NOT NULL, source_status JSON NOT NULL, PRIMARY KEY (id),
    FOREIGN KEY(brand_id) REFERENCES brands (id) ON DELETE CASCADE)`],
  ["detection_events", `CREATE TABLE IF NOT EXISTS detection_events (
    id INTEGER NOT NULL AUTO_INCREMENT, detection_id VARCHAR(40) NOT NULL, at DATETIME NOT NULL,
    action VARCHAR(30) NOT NULL, from_status VARCHAR(20), to_status VARCHAR(20), PRIMARY KEY (id),
    FOREIGN KEY(detection_id) REFERENCES detections (id) ON DELETE CASCADE)`],
];

// Columns added after the first release, with their DDL: added to older databases on start.
const ADDED_COLUMNS: [string, string, string][] = [
  ["brands", "legal_name", "VARCHAR(160)"],
  ["brands", "is_active", "BOOL NOT NULL DEFAULT 0"],
  ["publishers", "aliases", "JSON"],
  ["official_assets", "store_title", "VARCHAR(200)"],
  ["official_assets", "icon_url", "VARCHAR(500)"],
  ["official_assets", "validated_at", "DATETIME"],
  ["official_assets", "validation_status", "VARCHAR(20)"],
  ["official_assets", "validation_note", "VARCHAR(255)"],
  ["sources", "state", "VARCHAR(12)"],
  ["detections", "checks", "JSON"],
];

export const TABLE_NAMES = TABLES.map(([name]) => name);

export async function createSchema(): Promise<void> {
  for (const [, ddl] of TABLES) await exec(ddl);
  const have = await q<{ t: string; c: string }>(
    "SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE()",
  );
  const set = new Set(have.map((r) => `${r.t}.${r.c}`));
  for (const [table, column, ddl] of ADDED_COLUMNS) {
    if (!set.has(`${table}.${column}`)) await exec(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${ddl}`);
  }
}

/** Drop every table (tests and the demo reset only). */
export async function dropSchema(): Promise<void> {
  const conn = await pool().getConnection(); // FOREIGN_KEY_CHECKS is per connection
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const name of [...TABLE_NAMES].reverse()) await conn.query(`DROP TABLE IF EXISTS \`${name}\``);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
}
