"use client";

import { useState } from "react";

export interface DayCount {
  date: string; // YYYY-MM-DD
  label: string; // "4 Oct"
  count: number;
}

/**
 * Single-series column chart. One measure, so one ink colour and no legend;
 * the card title names the series. Hover or focus a day for its value.
 */
export function TrendChart({ data, height = 168 }: { data: DayCount[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 28, r: 8, t: 12, b: 24 };
  const max = Math.max(4, ...data.map((d) => d.count));
  const step = max <= 4 ? 1 : 2;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const top = ticks.at(-1) ?? max;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = innerW / data.length;
  const barW = Math.min(22, slot * 0.56);
  const y = (v: number) => pad.t + innerH - (v / top) * innerH;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="New detections per day, last 14 days">
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
              {(i % 2 === 0 || i === data.length - 1) && (
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
