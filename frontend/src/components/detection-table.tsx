"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { CLASS_LABEL, formatShortDate, handleDisplay } from "@/lib/format";
import { mediaUrl } from "@/lib/api";
import type { Detection } from "@/lib/types";
import { ScoreCell, StatusBadge } from "./badges";
import { BrandMark, PlatformGlyph } from "./marks";

export type SortKey = "score" | "firstSeen";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("");
}

export { initialsOf };

export function Identity({ d, size = 28 }: { d: Detection; size?: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandMark variant={d.mark} size={size} initials={initialsOf(d.displayName)} src={mediaUrl(d.iconUrl)} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-ink">{d.displayName}</div>
        <div className="truncate font-mono text-[11.5px] text-ink-3">{handleDisplay(d.platform, d.handle)}</div>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort?: { key: SortKey; dir: "asc" | "desc" };
  onSort?: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === k;
  if (!onSort) return <th className={className}>{label}</th>;
  return (
    <th className={className} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        {active && (sort!.dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );
}

export function DetectionTable({
  rows,
  compact,
  sort,
  onSort,
}: {
  rows: Detection[];
  compact?: boolean;
  sort?: { key: SortKey; dir: "asc" | "desc" };
  onSort?: (k: SortKey) => void;
}) {
  const router = useRouter();
  const th = "h-9 px-4 text-left text-[12px] font-medium text-ink-3 whitespace-nowrap";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead className="border-b border-line bg-surface-2/50">
          <tr>
            <SortHeader label="Score" k="score" sort={sort} onSort={onSort} className={clsx(th, "w-[150px]")} />
            <th className={th}>Detection</th>
            <th className={clsx(th, "w-[60px]")}>Source</th>
            {!compact && <th className={clsx(th, "w-[150px]")}>Class</th>}
            <th className={th}>Strongest evidence</th>
            <SortHeader label="First seen" k="firstSeen" sort={sort} onSort={onSort} className={clsx(th, "w-[96px]")} />
            {!compact && <th className={clsx(th, "w-[170px]")}>Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.id}
              tabIndex={0}
              onClick={() => router.push(`/detections/${d.id}`)}
              onKeyDown={(e) => e.key === "Enter" && router.push(`/detections/${d.id}`)}
              className={clsx(
                "cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2",
                d.status === "false_positive" && "opacity-60",
              )}
            >
              <td className="px-4 py-2.5">
                <ScoreCell score={d.breakdown.score} severity={d.breakdown.severity} />
              </td>
              <td className="max-w-[280px] px-4 py-2.5">
                <Identity d={d} />
              </td>
              <td className="px-4 py-2.5">
                <PlatformGlyph platform={d.platform} />
              </td>
              {!compact && <td className="px-4 py-2.5 text-[12.5px] text-ink-2">{CLASS_LABEL[d.cls]}</td>}
              <td className="max-w-[360px] px-4 py-2.5">
                <p className="line-clamp-2 text-[12.5px] leading-snug text-ink-2">{d.reasons[0]}</p>
              </td>
              <td className="tabular px-4 py-2.5 text-[12.5px] text-ink-2 whitespace-nowrap">{formatShortDate(d.firstSeen)}</td>
              {!compact && (
                <td className="whitespace-nowrap px-4 py-2.5">
                  <StatusBadge status={d.status} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
