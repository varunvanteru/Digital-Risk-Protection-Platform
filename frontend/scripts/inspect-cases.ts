/**
 * Print the full signals and scoring for chosen curated cases of the fixture test set.
 * DATA_MODE=fixtures npx tsx scripts/inspect-cases.ts handle1 handle2
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { settings } from "../src/server/config";
import { SocialDataset, StoreDataset } from "../src/server/connectors/datasets";
import { pool } from "../src/server/db";
import { evaluate } from "../src/server/detection/signals";
import { context } from "../src/server/evaluation";
import { CONNECTORS } from "../src/server/services/scan";

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(settings.fixturesDir, "labelled_cases.json"), "utf8"));
  const brand = data.brands.find((b: { name: string }) => b.name === data.dataset_labels.brand);
  const ctx = context(brand);
  const want = new Set(process.argv.slice(2).map((h) => h.toLowerCase()));
  for (const conn of Object.values(CONNECTORS)) {
    if (!(conn instanceof SocialDataset || conn instanceof StoreDataset)) continue;
    for (const c of await conn.fetch([...brand.keywords, brand.name])) {
      if (!want.has(c.identifier)) continue;
      const ev = await evaluate(c, ctx, data.today);
      console.log(`\n== ${c.platform} ${c.handle} "${c.displayName}"  bio: ${c.bio}`);
      console.log("signals", JSON.stringify(ev.signals), "score", ev.breakdown?.score, ev.breakdown?.cap ?? "");
      console.log("reasons", ev.reasons);
    }
  }
  await pool().end();
}
main();
