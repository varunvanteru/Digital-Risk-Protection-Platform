"use client";

import { useEffect, useRef, useState } from "react";

export interface DayCount {
  date: string; // YYYY-MM-DD
  label: string; // "4 Oct"
  critical: number;
  high: number;
  medium: number;
}

/** Stack order, bottom to top, with the severity colours used everywhere else in the app. */
const SERIES = [
  { key: "critical", label: "Critical", color: "var(--chart-crit)" },
  { key: "high", label: "High", color: "var(--chart-high)" },
  { key: "medium", label: "Medium", color: "var(--chart-med)" },
] as const;

const total = (d: DayCount) => d.critical + d.high + d.medium;

/**
 * Stacked column chart: new detections per day, split by severity. Colour always comes
 * with a label (legend and tooltip), never alone. Hover or focus a day for its numbers.
 */
export function TrendChart({ data, height = 220 }: { data: DayCount[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: height });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({
        w: Math.max(260, Math.round(entry.contentRect.width)),
        h: Math.max(height, Math.round(entry.contentRect.height)),
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);
  const W = size.w;
  const H = size.h;
  const pad = { l: 28, r: 8, t: 12, b: 24 };
  const max = Math.max(4, ...data.map(total));
  const step = max <= 4 ? 1 : max <= 10 ? 2 : 5;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = innerW / data.length;
  const barW = Math.min(26, slot * 0.56);
  const y = (v: number) => pad.t + innerH - (v / top) * innerH;
  const every = Math.max(1, Math.ceil(48 / slot));
  const last = data.length - 1;
  const lastRegular = Math.floor(last / every) * every;
  const showLabel = (i: number) => i % every === 0 || (i === last && (last - lastRegular) * slot >= 48);
  const GAP = 1.5; // surface-coloured gap between stacked segments

  return (
    <div className="flex h-full flex-col">
      <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-2" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div ref={box} className="relative flex-1" style={{ minHeight: height }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block max-w-full" role="img" aria-label="New detections per day by severity, last 14 days">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--ink-3)" className="tabular">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + slot * i + slot / 2;
            const x = cx - barW / 2;
            let base = 0;
            const segs = SERIES.filter((s) => d[s.key] > 0).map((s) => {
              const from = base;
              base += d[s.key];
              return { ...s, from, to: base };
            });
            return (
              <g
                key={d.date}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${d.label}: ${d.critical} critical, ${d.high} high, ${d.medium} medium`}
                className="outline-none"
              >
                <rect x={cx - slot / 2} y={pad.t} width={slot} height={innerH} fill={hover === i ? "var(--surface-2)" : "transparent"} />
                <g opacity={hover === null || hover === i ? 1 : 0.45}>
                  {segs.map((s, j) => {
                    const isTop = j === segs.length - 1;
                    const y1 = y(s.to) + (isTop ? 0 : GAP / 2);
                    const y2 = y(s.from) - (j === 0 ? 0 : GAP / 2);
                    const h = Math.max(0, y2 - y1);
                    const r = isTop ? Math.min(4, h / 2, barW / 2) : 0;
                    // Rounded top on the topmost segment only, square everywhere else.
                    return (
                      <path
                        key={s.key}
                        d={`M${x} ${y2} V${y1 + r} Q${x} ${y1} ${x + r} ${y1} H${x + barW - r} Q${x + barW} ${y1} ${x + barW} ${y1 + r} V${y2} Z`}
                        fill={s.color}
                      />
                    );
                  })}
                </g>
                {showLabel(i) && (
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth={1} />
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-md border border-line bg-surface px-2.5 py-2 text-[12px] shadow-lg"
            style={{ left: `${Math.min(85, Math.max(15, ((pad.l + slot * hover + slot / 2) / W) * 100))}%` }}
          >
            <div className="mb-1 font-medium text-ink">
              {data[hover].label} · {total(data[hover])} new
            </div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4 text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tabular text-ink">{data[hover][s.key]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
