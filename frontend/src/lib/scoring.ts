import type { Channel, Severity, SignalKey } from "./types";

/** Display labels only. Scores are computed by the backend (backend/app/detection/scoring.py). */
export const SIGNAL_LABEL: Record<SignalKey, string> = {
  name: "Name similarity",
  logo: "Logo / icon similarity",
  text: "Bio / description similarity",
  claims: "Impersonation claims",
  behaviour: "Scam behaviour",
  publisher: "Publisher mismatch",
};

const APP_SIGNAL_LABEL: Partial<Record<SignalKey, string>> = {
  behaviour: "Risk context",
};

export function signalLabel(key: SignalKey, channel: Channel) {
  return (channel === "app" && APP_SIGNAL_LABEL[key]) || SIGNAL_LABEL[key];
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export const SEVERITY_ACTION: Record<Severity, string> = {
  critical: "Takedown recommended",
  high: "Review today",
  medium: "Watchlist",
  low: "Listed, not flagged",
};
