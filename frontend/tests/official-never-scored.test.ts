/** Test 13: official assets never reach risk scoring. */

import { afterAll, expect, it, vi } from "vitest";
import { pool } from "@/server/db";
import { evaluate } from "@/server/detection/signals";
import { app, profiles, social, TODAY } from "./helpers";

vi.mock("@/server/detection/scoring", async (orig) => ({
  ...(await orig<typeof import("@/server/detection/scoring")>()),
  scoreDetection: () => {
    throw new Error("risk scoring called for an official asset");
  },
}));

afterAll(() => pool().end());

it("13: official candidates stop before scoring", async () => {
  const ctx = profiles().PhonePe;
  for (const c of [
    app("com.phonepe.app", "PhonePe", "PhonePe", "TEST-PLAY-DEV-PHONEPE"),
    app("com.phonepe.app.business", "PhonePe Business", "PhonePe", "TEST-PLAY-DEV-PHONEPE"),
    social("phonepe", "PhonePe"),
  ]) {
    expect((await evaluate(c, ctx, TODAY)).official).not.toBeNull();
  }
});
