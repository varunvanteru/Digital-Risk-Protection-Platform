/**
 * Parity check: run the labelled test set through this engine and compare every
 * row with the Python reference engine's output.
 *
 *   backend\.venv\Scripts\python backend\eval_dump.py > py.json
 *   npx tsx scripts/parity.ts py.json
 */

import "./load-env";
import fs from "node:fs";
import { pool } from "../src/server/db";
import { runEvaluation } from "../src/server/evaluation";

async function main() {
  const py = JSON.parse(fs.readFileSync(process.argv[2], "utf8").replace(/^﻿/, ""));
  const js = await runEvaluation();
  const fields = ["outcome", "status", "score", "severity", "reason"] as const;
  let diffs = 0;
  js.rows.forEach((r, i) => {
    const p = py.rows[i];
    const bad = fields.filter((f) => JSON.stringify(r[f]) !== JSON.stringify(p[f]));
    if (bad.length) {
      diffs++;
      console.log(`row ${i} ${r.platform}:${r.handle}`);
      for (const f of bad) console.log(`   ${f}: node=${JSON.stringify(r[f])} python=${JSON.stringify(p[f])}`);
    }
  });
  const summary = ["cases", "precision", "recall", "f1", "officialTested", "officialRecognised", "officialFlagged", "mentionsFlagged"] as const;
  for (const k of summary) console.log(`${k.padEnd(20)} node=${js[k]}  python=${py[k]}${js[k] === py[k] ? "" : "   <-- differs"}`);
  console.log(`rows compared: ${js.rows.length}, rows differing: ${diffs}`);
  await pool().end();
}

main();
