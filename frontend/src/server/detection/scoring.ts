/** Risk score from signal values. Weights and rules from the design doc. Port of scoring.py. */

import { pyRound } from "../util";

export type Channel = "social" | "app";
export type Signals = Record<string, number>;

export const WEIGHTS: Record<Channel, [string, number][]> = {
  social: [["name", 0.3], ["logo", 0.25], ["text", 0.1], ["claims", 0.15], ["behaviour", 0.2]],
  app: [["name", 0.25], ["logo", 0.25], ["text", 0.15], ["claims", 0.1], ["behaviour", 0.05], ["publisher", 0.2]],
};

// Publisher mismatch is true for every non-official app, so it never counts
// as the second strong signal on its own.
const CONTEXT_ONLY = new Set(["publisher"]);

export interface Part {
  key: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface Breakdown {
  score: number;
  severity: "critical" | "high" | "medium" | "low";
  parts: Part[];
  boosts: { label: string; amount: number }[];
  cap: string | null;
}

export function severityOf(score: number): Breakdown["severity"] {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function scoreDetection(
  channel: Channel,
  signals: Signals,
  lookalikeDomain = false,
  contextLabel: string | null = null,
  feedbackPenalty = 0.0,
): Breakdown {
  const get = (k: string) => Number(signals[k] ?? 0.0);
  const parts: Part[] = WEIGHTS[channel].map(([k, w]) => ({
    key: k,
    value: pyRound(get(k), 3),
    weight: w,
    contribution: pyRound(get(k) * w, 4),
  }));
  let total = 0;
  for (const p of parts) total += p.contribution;
  const boosts: { label: string; amount: number }[] = [];

  const identity = get("name") >= 0.8 || get("logo") >= 0.8;
  const posing = channel === "social" ? get("claims") >= 0.5 : get("publisher") >= 0.5;
  if (identity && posing) {
    boosts.push({
      label: channel === "social" ? "Strong name or logo match while claiming to be official" : "Strong name or icon match from a different publisher",
      amount: 0.15,
    });
    total += 0.15;
  }
  if (channel === "social" && get("name") >= 0.8 && get("behaviour") >= 0.8) {
    boosts.push({ label: "Uses the brand name to run a scam", amount: 0.1 });
    total += 0.1;
  }
  // A strong brand look-alike name together with clear scam behaviour (money lures, fees,
  // urgency, a brand-new account) is a scam even without a copied logo: count it as a second
  // strong signal. Fan, news and review accounts are still capped by their label below.
  const brandLure = channel === "social" && get("name") >= 0.85 && get("behaviour") >= 0.4 && get("behaviour") < 0.8;
  if (brandLure) {
    boosts.push({ label: "Brand look-alike name with scam behaviour", amount: 0.1 });
    total += 0.1;
  }
  if (lookalikeDomain) {
    boosts.push({ label: "Links to a look-alike of an official domain", amount: 0.1 });
    total += 0.1;
  }
  // The penalty applies after the 100-point ceiling, so it always lowers the score.
  let capped = Math.min(1.0, total);
  if (feedbackPenalty) {
    boosts.push({ label: "Marked as a false positive by an analyst", amount: -feedbackPenalty });
    capped -= feedbackPenalty;
  }

  let score = pyRound(100 * Math.max(0.0, capped));
  let cap: string | null = null;
  // Linking to a look-alike of the official domain is strong evidence on its own.
  const strong =
    parts.filter((p) => p.value > 0.5 && !CONTEXT_ONLY.has(p.key)).length + (lookalikeDomain ? 1 : 0) + (brandLure && get("behaviour") <= 0.5 ? 1 : 0);
  if (strong <= 1 && score > 39) {
    score = 39;
    cap = "Only one signal is strong, so the score is capped at Low";
  }
  if (contextLabel && score > 39) {
    score = 39;
    cap = `Openly labelled as ${contextLabel}, so the score is capped at Low`;
  }
  return { score, severity: severityOf(score), parts, boosts, cap };
}
