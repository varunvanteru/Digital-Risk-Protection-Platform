import type { Channel, Detection, Severity, SignalKey, Signals } from "./types";

/** Weights from the design doc, section "Risk scoring and explainability". */
export const WEIGHTS: Record<Channel, Partial<Record<SignalKey, number>>> = {
  social: { name: 0.3, logo: 0.25, text: 0.1, claims: 0.15, behaviour: 0.2 },
  app: { name: 0.25, logo: 0.25, text: 0.15, claims: 0.1, behaviour: 0.05, publisher: 0.2 },
};

export const SIGNAL_LABEL: Record<SignalKey, string> = {
  name: "Name similarity",
  logo: "Logo / icon similarity",
  text: "Bio / description similarity",
  claims: "Impersonation claims",
  behaviour: "Scam behaviour",
  publisher: "Publisher mismatch",
};

export const APP_SIGNAL_LABEL: Partial<Record<SignalKey, string>> = {
  behaviour: "Risk context",
};

export function signalLabel(key: SignalKey, channel: Channel) {
  return (channel === "app" && APP_SIGNAL_LABEL[key]) || SIGNAL_LABEL[key];
}

export interface ScoreBreakdown {
  score: number;
  severity: Severity;
  parts: { key: SignalKey; value: number; weight: number; contribution: number }[];
  boosts: { label: string; amount: number }[];
  cap?: string;
}

type ScoreInput = Pick<Detection, "channel" | "signals" | "lookalikeDomain" | "contextLabel">;

export function scoreDetection(d: ScoreInput): ScoreBreakdown {
  const weights = WEIGHTS[d.channel];
  const parts = (Object.keys(weights) as SignalKey[]).map((key) => {
    const value = d.signals[key] ?? 0;
    const weight = weights[key] ?? 0;
    return { key, value, weight, contribution: value * weight };
  });

  let total = parts.reduce((sum, p) => sum + p.contribution, 0);
  const boosts: ScoreBreakdown["boosts"] = [];
  const s: Signals = d.signals;

  const identityMatch = (s.name ?? 0) >= 0.8 || (s.logo ?? 0) >= 0.8;
  const posing = d.channel === "social" ? (s.claims ?? 0) >= 0.5 : (s.publisher ?? 0) >= 0.5;
  if (identityMatch && posing) {
    boosts.push({
      label:
        d.channel === "social"
          ? "Strong name or logo match while claiming to be official"
          : "Strong name or icon match from a different publisher",
      amount: 0.15,
    });
    total += 0.15;
  }
  if (d.lookalikeDomain) {
    boosts.push({ label: "Links to a look-alike of an official domain", amount: 0.1 });
    total += 0.1;
  }

  let score = Math.round(100 * Math.min(1, total));
  let cap: string | undefined;

  const strong = parts.filter((p) => p.value > 0.5).length;
  if (strong <= 1 && score > 39) {
    score = 39;
    cap = "Only one signal is strong, so the score is capped at Low";
  }
  if (d.contextLabel && score > 39) {
    score = 39;
    cap = `Openly labelled as ${d.contextLabel}, so the score is capped at Low`;
  }

  return { score, severity: severityOf(score), parts, boosts, cap };
}

export function severityOf(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export const SEVERITY_ACTION: Record<Severity, string> = {
  critical: "Takedown recommended",
  high: "Review today",
  medium: "Watchlist",
  low: "Listed, not flagged",
};
