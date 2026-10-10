/**
 * Copy image files from a folder (e.g. ../backend/media, written by the Python engine)
 * into the media_files table, keeping their modification times. Existing rows are kept.
 *
 *   npx tsx scripts/import-media.ts ../backend/media
 */

import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { createSchema, exec, pool } from "../src/server/db";

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(png|jpe?g|webp|gif)$/i.test(e.name)) yield p;
  }
}

async function main() {
  const root = path.resolve(process.argv[2] ?? "../backend/media");
  await createSchema();
  let added = 0;
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const res = await exec("INSERT IGNORE INTO media_files (path, data, mtime) VALUES (?, ?, ?)", [
      rel,
      fs.readFileSync(file),
      fs.statSync(file).mtimeMs / 1000,
    ]);
    added += res.affectedRows;
  }
  console.log(`Imported ${added} new image(s) from ${root}`);
  await pool().end();
}

main();
