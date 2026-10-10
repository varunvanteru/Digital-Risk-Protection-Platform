/** Fresh test schema before the run, dropped afterwards. */
import { testEnv } from "./env.mts";

export async function setup() {
  Object.assign(process.env, testEnv());
  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${process.env.MYSQL_DB}\``);
  await conn.query(`CREATE DATABASE \`${process.env.MYSQL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  const { createSchema, pool } = await import("../src/server/db");
  await createSchema();
  await pool().end();

  return async () => {
    const c = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
    });
    await c.query(`DROP DATABASE IF EXISTS \`${process.env.MYSQL_DB}\``);
    await c.end();
  };
}
