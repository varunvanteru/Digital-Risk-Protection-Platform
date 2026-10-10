"use client";

import { useEffect, useRef, useState } from "react";

export interface DayCount {
  date: string; // YYYY-MM-DD
  label: string; // "4 Oct"
  count: number;
}

/**
 * Single-series column chart. One measure, so one ink colour and no legend;
 * the card title names the series. Hover or focus a day for its value.
 */
export function TrendChart({ data, height = 220 }: { data: DayCount[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the container's real pixel size so text and bars keep their size, and the chart
  // fills the card when the card is taller than the minimum height.
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
  const max = Math.max(4, ...data.map((d) => d.count));
  const step = max <= 4 ? 1 : 2;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const top = ticks.at(-1) ?? max;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = innerW / data.length;
  const barW = Math.min(28, slot * 0.56);
  const y = (v: number) => pad.t + innerH - (v / top) * innerH;
  // Label every n-th day so labels (~44 px wide) never touch; the last day is labelled when it fits.
  const every = Math.max(1, Math.ceil(48 / slot));
  const last = data.length - 1;
  const lastRegular = Math.floor(last / every) * every;
  const showLabel = (i: number) => i % every === 0 || (i === last && (last - lastRegular) * slot >= 48);

  return (
    <div ref={box} className="relative h-full" style={{ minHeight: height }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block max-w-full" role="img" aria-label="New detections per day, last 14 days">
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
          const h = Math.max(0, y(0) - y(d.count));
          const r = Math.min(4, h / 2);
          return (
            <g
              key={d.date}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${d.label}: ${d.count} new`}
              className="outline-none"
            >
              <rect x={cx - slot / 2} y={pad.t} width={slot} height={innerH} fill={hover === i ? "var(--surface-2)" : "transparent"} />
              {d.count > 0 && (
                <path
                  d={`M${cx - barW / 2} ${y(0)} V${y(d.count) + r} Q${cx - barW / 2} ${y(d.count)} ${cx - barW / 2 + r} ${y(d.count)} H${cx + barW / 2 - r} Q${cx + barW / 2} ${y(d.count)} ${cx + barW / 2} ${y(d.count) + r} V${y(0)} Z`}
                  fill="var(--chart-bar)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
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
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-sm"
          style={{ left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%` }}
        >
          <div className="text-ink-3">{data[hover].label}</div>
          <div className="tabular font-medium text-ink">
            {data[hover].count} new detection{data[hover].count === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}
