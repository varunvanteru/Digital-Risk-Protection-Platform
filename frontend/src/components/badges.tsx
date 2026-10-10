import clsx from "clsx";
import { Ban, CircleCheck, CircleDot, CircleAlert, Flag, OctagonAlert, ShieldCheck, TriangleAlert, CircleX } from "lucide-react";
import { STATUS_LABEL } from "@/lib/format";
import type { DetectionStatus, Severity, SourceHealth } from "@/lib/types";

const SEVERITY: Record<Severity, { label: string; text: string; bg: string; Icon: typeof OctagonAlert }> = {
  critical: { label: "Critical", text: "text-crit", bg: "bg-crit-bg", Icon: OctagonAlert },
  high: { label: "High", text: "text-high", bg: "bg-high-bg", Icon: TriangleAlert },
  medium: { label: "Medium", text: "text-med", bg: "bg-med-bg", Icon: CircleAlert },
  low: { label: "Low", text: "text-low", bg: "bg-low-bg", Icon: CircleDot },
};

export function severityLabel(s: Severity) {
  return SEVERITY[s].label;
}

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const { Icon, text } = SEVERITY[severity];
  return <Icon aria-hidden className={clsx("size-3.5", text, className)} strokeWidth={2.2} />;
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const { label, text, bg, Icon } = SEVERITY[severity];
  return (
    <span className={clsx("inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11.5px] font-medium", text, bg, className)}>
      <Icon aria-hidden className="size-3" strokeWidth={2.4} />
      {label}
    </span>
  );
}

/** Score with its severity, e.g. "87 Critical". Number first: it is what people sort by. */
export function ScoreCell({ score, severity }: { score: number; severity: Severity }) {
  const { text, Icon, label } = SEVERITY[severity];
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular w-7 text-right font-mono text-[13px] font-medium text-ink">{score}</span>
      <span className={clsx("inline-flex items-center gap-1 text-[12px] font-medium", text)}>
        <Icon aria-hidden className="size-3.5" strokeWidth={2.2} />
        {label}
      </span>
    </span>
  );
}

const STATUS_ICON: Record<DetectionStatus, typeof Flag> = {
  open: CircleDot,
  confirmed: Flag,
  takedown_requested: Ban,
  false_positive: CircleX,
  official: ShieldCheck,
};

export function StatusBadge({ status }: { status: DetectionStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-[12.5px]",
        status === "open" ? "text-ink-2" : status === "false_positive" ? "text-ink-3" : "text-ink",
      )}
    >
      <Icon aria-hidden className="size-3.5 text-ink-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

const HEALTH: Record<SourceHealth, { label: string; text: string; dot: string; Icon: typeof CircleCheck }> = {
  operational: { label: "Operational", text: "text-ok", dot: "bg-ok", Icon: CircleCheck },
  degraded: { label: "Degraded", text: "text-high", dot: "bg-high", Icon: TriangleAlert },
  unavailable: { label: "Unavailable", text: "text-crit", dot: "bg-crit", Icon: CircleX },
};

export function HealthBadge({ health, compact }: { health: SourceHealth; compact?: boolean }) {
  const { label, text, Icon } = HEALTH[health];
  return (
    <span className={clsx("inline-flex items-center gap-1 text-[12px] font-medium", text)}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2.2} />
      {!compact && label}
    </span>
  );
}

export function healthLabel(h: SourceHealth) {
  return HEALTH[h].label;
}
