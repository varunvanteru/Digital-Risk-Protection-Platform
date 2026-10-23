/**
 * The Accuracy page in live mode, the mode the deployed app runs in. The labelled test set must come
 * from its data files, not the live sources, so it gives the same result in every mode.
 */

import { afterAll, describe, expect, it } from "vitest";

process.env.DATA_MODE = "live"; // before the server modules load and read their settings

describe("accuracy in live mode", () => {
  afterAll(async () => {
    const { pool } = await import("@/server/db");
    await pool().end();
  });

  it("scores the whole labelled set: 82 of 82, no official asset flagged", async () => {
    const { settings } = await import("@/server/config");
    expect(settings.dataMode).toBe("live");
    const { runEvaluation } = await import("@/server/evaluation");
    const r = await runEvaluation();
    expect(r.cases).toBe(82);
    const rows = r.rows as { outcome: string; correct: boolean; label: string; group: string }[];
    // Only unrelated accounts may be missing from the search for the brand; every official, fake and mention is found.
    expect(rows.filter((x) => x.outcome === "NOT RETURNED" && x.label !== "unrelated").map((x) => x.group)).toEqual([]);
    expect(rows.filter((x) => !x.correct)).toEqual([]);
    expect(r.officialFlagged).toBe(0);
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
  });
});
