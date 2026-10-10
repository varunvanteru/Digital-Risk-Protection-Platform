/** Print the full signals and scoring for chosen labelled cases. npx tsx scripts/inspect-cases.ts handle1 handle2 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { SocialDataset, StoreDataset } from "../src/server/connectors/datasets";
import { pool } from "../src/server/db";
import { evaluate } from "../src/server/detection/signals";
import { context } from "../src/server/evaluation";
import { CONNECTORS } from "../src/server/services/scan";

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "labelled_cases.json"), "utf8"));
  const zp = data.brands.find((b: { name: string }) => b.name === "ZentraPay");
  const ctx = context(zp);
  const want = new Set(process.argv.slice(2).map((h) => h.toLowerCase()));
  for (const conn of Object.values(CONNECTORS)) {
    if (!(conn instanceof SocialDataset || conn instanceof StoreDataset)) continue;
    for (const c of await conn.fetch([...zp.keywords, zp.name])) {
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
