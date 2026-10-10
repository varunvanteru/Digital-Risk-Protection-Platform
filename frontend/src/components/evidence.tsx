import clsx from "clsx";
import { Check, Minus, ShieldCheck, X } from "lucide-react";
import type { EvidenceChecks, Verdict } from "@/lib/types";

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  OFFICIAL: { label: "Official", className: "bg-ok-bg text-ok" },
  LIKELY_OFFICIAL: { label: "Likely official", className: "bg-ok-bg text-ok" },
  SUSPICIOUS: { label: "Suspicious", className: "bg-crit-bg text-crit" },
  LOOKALIKE: { label: "Look-alike", className: "bg-med-bg text-med" },
  MENTION: { label: "Mention", className: "bg-low-bg text-low" },
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict];
  return (
    <span className={clsx("inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-semibold uppercase tracking-wide", v.className)}>
      {(verdict === "OFFICIAL" || verdict === "LIKELY_OFFICIAL") && <ShieldCheck className="size-3" />}
      {v.label}
    </span>
  );
}

function Flag({ label, value }: { label: string; value: boolean | null | undefined }) {
  const Icon = value === true ? Check : value === false ? X : Minus;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="text-ink-3">{label}</span>
      <Icon
        aria-label={value === true ? "yes" : value === false ? "no" : "not known"}
        className={clsx("size-3", value === true ? "text-ok" : value === false ? "text-crit" : "text-ink-3")}
        strokeWidth={2.5}
      />
    </span>
  );
}

function Pct({ label, value }: { label: string; value?: number }) {
  if (value === undefined) return null;
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink-3">{label} </span>
      <span className={clsx("tabular font-medium", value >= 0.8 ? "text-ink" : "text-ink-2")}>{Math.round(value * 100)}%</span>
    </span>
  );
}

/**
 * The signals behind a decision on one line: similarities as %, identity checks as ✓ / ✗ / – (not known).
 * "Publisher" is – when no official publisher is on record: unknown is not treated as a mismatch.
 */
export function EvidenceStrip({ checks, app }: { checks: EvidenceChecks; app: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
      <Pct label="Name" value={checks.nameSimilarity} />
      <Pct label={app ? "Icon" : "Picture"} value={checks.iconSimilarity} />
      {checks.descriptionSimilarity !== undefined && checks.descriptionSimilarity >= 0.3 && (
        <Pct label="Text" value={checks.descriptionSimilarity} />
      )}
      <Flag label={app ? "Official ID" : "Official handle"} value={checks.officialIdMatch ?? false} />
      {app && <Flag label="Publisher" value={checks.publisherMatch} />}
      {checks.contactMismatch && <Flag label="Official contact" value={false} />}
      {checks.suspiciousKeywords && checks.suspiciousKeywords.length > 0 && (
        <span className="whitespace-nowrap">
          <span className="text-ink-3">Keywords </span>
          <span className="font-medium text-crit">{checks.suspiciousKeywords.join(", ")}</span>
        </span>
      )}
    </div>
  );
}

/** Full signal table for a detection's evidence view. */
export function EvidenceTable({ checks, app }: { checks: EvidenceChecks; app: boolean }) {
  const yesNo = (v: boolean | null | undefined, good: boolean) =>
    v === undefined || v === null ? (
      <span className="text-ink-3">Not known</span>
    ) : (
      <span className={clsx("inline-flex items-center gap-1 font-medium", v === good ? "text-ok" : "text-crit")}>
        {v ? <Check className="size-3.5" /> : <X className="size-3.5" />}
        {v ? "Yes" : "No"}
      </span>
    );
  const pctCell = (v?: number) => (v === undefined ? <span className="text-ink-3">–</span> : <span className="tabular font-medium text-ink">{Math.round(v * 100)}%</span>);
  const rows: [string, React.ReactNode][] = [
    [app ? "Official app ID" : "Official handle", yesNo(checks.officialIdMatch ?? false, true)],
    ...(app ? ([["Official developer account", yesNo(checks.officialDeveloperMatch ?? false, true)], ["Publisher matches official", yesNo(checks.publisherMatch, true)]] as [string, React.ReactNode][]) : []),
    ["Name similarity", pctCell(checks.nameSimilarity)],
    [app ? "Icon similarity" : "Picture similarity", pctCell(checks.iconSimilarity)],
    ["Description similarity", pctCell(checks.descriptionSimilarity)],
    [
      "Suspicious keywords",
      checks.suspiciousKeywords && checks.suspiciousKeywords.length ? (
        <span className="font-medium text-crit">{checks.suspiciousKeywords.join(", ")}</span>
      ) : (
        <span className="text-ink-3">None</span>
      ),
    ],
    ["Unofficial contact or links", yesNo(checks.contactMismatch, false)],
  ];
  return (
    <dl className="grid grid-cols-[minmax(160px,max-content)_1fr] gap-x-6 gap-y-2 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}