"use client";

import clsx from "clsx";
import { ArrowDown, ArrowRight, ArrowUp, ExternalLink } from "lucide-react";
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

/** Marks a detection from curated sample data, so it is never mistaken for a live find. */
export function SampleTag() {
  return (
    <span
      title="Sample data: a curated example for this demo, not found by a live search. Live searches cover Google Play and the App Store."
      className="chip inline-flex h-[18px] shrink-0 items-center rounded-full bg-surface-2 px-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink-3"
    >
      Sample
    </span>
  );
}

export function Identity({ d, size = 28 }: { d: Detection; size?: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandMark variant={d.mark} size={size} initials={initialsOf(d.displayName)} src={mediaUrl(d.iconUrl)} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-ink">{d.displayName}</span>
          {d.sample && <SampleTag />}
        </div>
        <div className="truncate font-mono text-[11.5px] text-ink-3">{handleDisplay(d.platform, d.handle)}</div>
      </div>
    </div>
  );
}

/**
 * Opens the account, page or app itself on its platform, in a new tab. It does not trigger the row's
 * own click (which opens the detection), so both work from the same row.
 */
export function OpenLink({ d, className }: { d: Detection; className?: string }) {
  if (!d.url || d.sample) return null; // curated test data has no real page
  return (
    <a
      href={d.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      title={`Open on the platform: ${d.url}`}
      className={clsx("ext-link inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-medium", className)}
    >
      Open
      <ExternalLink className="size-3.5" />
    </a>
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

  const open = (id: string) => router.push(`/detections/${id}`);

  return (
    <>
      {/* Phones: one stacked row per detection, nothing cut off at the edge */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((d) => (
          <li key={d.id} className="relative">
            <button
              onClick={() => open(d.id)}
              className={clsx(
                "flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2",
                d.status === "false_positive" && "opacity-60",
              )}
            >
              <div className="flex w-full items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Identity d={d} />
                </div>
                <PlatformGlyph platform={d.platform} />
              </div>
              <p className="line-clamp-2 text-[12.5px] leading-snug text-ink-2">{d.reasons[0]}</p>
              <div className="flex w-full items-center justify-between gap-3 text-[12px] text-ink-3">
                <ScoreCell score={d.breakdown.score} severity={d.breakdown.severity} />
                <span className="flex items-center gap-3">
                  {!compact && <StatusBadge status={d.status} />}
                  <span className="tabular">{formatShortDate(d.firstSeen)}</span>
                  {/* room for the Open link, which sits outside the button (a link cannot be inside one) */}
                  {d.url && !d.sample && <span aria-hidden className="w-12" />}
                  <span aria-hidden className="float-btn size-7 [&_svg]:size-3.5">
                    <ArrowRight />
                  </span>
                </span>
              </div>
            </button>
            <OpenLink d={d} className="absolute bottom-[18px] right-[52px]" />
          </li>
        ))}
      </ul>
    <div className="hidden overflow-x-auto md:block">
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
            <th className={clsx(th, "w-[84px]")}>
              <span className="sr-only">Link</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.id}
              tabIndex={0}
              onClick={() => open(d.id)}
              onKeyDown={(e) => e.key === "Enter" && open(d.id)}
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
              <td className="px-4 py-2.5 text-right">
                <OpenLink d={d} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
