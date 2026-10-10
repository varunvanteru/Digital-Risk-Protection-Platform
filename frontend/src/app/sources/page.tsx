"use client";

import clsx from "clsx";
import { HealthBadge } from "@/components/badges";
import { PlatformGlyph } from "@/components/marks";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useState } from "react";
import { useStore } from "@/lib/store";
import type { SourceState } from "@/lib/types";

const STATE: Record<SourceState, { label: string; className: string; note: string }> = {
  live: { label: "Live", className: "bg-ok-bg text-ok", note: "Searched live" },
  cached: { label: "Cached", className: "bg-high-bg text-high", note: "Live source down; last good results" },
  simulated: { label: "Simulated", className: "bg-low-bg text-ink-2", note: "Curated sample data (no open API)" },
  down: { label: "Down", className: "bg-crit-bg text-crit", note: "Unavailable" },
};

export default function SourcesPage() {
  const { sources, setOutage } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  async function toggle(id: string, on: boolean) {
    setBusy(id);
    try {
      await setOutage(id, on);
    } finally {
      setBusy(null);
    }
  }
  const groups = [
    { title: "App stores", rows: sources.filter((s) => s.channel === "app") },
    { title: "Social platforms", rows: sources.filter((s) => s.channel === "social") },
  ];

  return (
    <>
      <PageHeader
        title="Sources"
        description="Where candidates come from. Each source runs on its own with a 10-second timeout and 2 retries, so one failing source never stops a scan."
      />

      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} />
            {/* Phones: stacked rows */}
            <ul className="divide-y divide-line md:hidden">
              {g.rows.map((s) => (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 font-medium text-ink">
                      <PlatformGlyph platform={s.platform} />
                      <span className="truncate">{s.name}</span>
                    </div>
                    <span
                      className={clsx("inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] font-semibold uppercase tracking-wide", STATE[s.state].className)}
                      title={STATE[s.state].note}
                    >
                      {STATE[s.state].label}
                    </span>
                  </div>
                  {s.note && (
                    <p className={clsx("mt-1 text-[12px]", s.health === "unavailable" ? "text-crit" : "text-high")}>{s.note}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-ink-2">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <HealthBadge health={s.health} />
                      <span className="tabular">{s.health === "operational" ? `${s.itemsLastScan} items` : "—"}</span>
                      {s.health === "operational" && s.latencyMs !== null && <span className="tabular font-mono text-ink-3">{s.latencyMs} ms</span>}
                    </span>
                    {!s.simulateOutage ? (
                      <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => toggle(s.id, true)}>
                        Simulate outage
                      </Button>
                    ) : (
                      <Button size="sm" disabled={busy === s.id} onClick={() => toggle(s.id, false)}>
                        End outage
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] table-fixed text-[13px]">
                <thead className="border-b border-line bg-surface-2/50 text-[12px] text-ink-3">
                  <tr>
                    <th className="h-9 px-4 text-left font-medium">Source</th>
                    <th className="h-9 w-32 px-4 text-left font-medium">State</th>
                    <th className="h-9 w-32 px-4 text-left font-medium">Health</th>
                    <th className="h-9 w-36 px-4 text-left font-medium">Last success</th>
                    <th className="h-9 w-24 px-4 text-right font-medium">Latency</th>
                    <th className="h-9 w-32 px-4 text-right font-medium">Items, last scan</th>
                    <th className="h-9 w-40 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((s) => (
                    <tr key={s.id} className="border-b border-line align-middle last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium text-ink">
                          <PlatformGlyph platform={s.platform} />
                          {s.name}
                        </div>
                        {s.note && (
                          <p className={clsx("mt-1 max-w-sm text-[12px]", s.health === "unavailable" ? "text-crit" : "text-high")}>
                            {s.note}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx("inline-flex h-5 items-center rounded px-1.5 text-[11px] font-semibold uppercase tracking-wide", STATE[s.state].className)}
                          title={`${STATE[s.state].note} · ${s.mode === "live" ? "Live connector" : "Curated dataset"}`}
                        >
                          {STATE[s.state].label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <HealthBadge health={s.health} />
                      </td>
                      <td className="tabular px-4 py-3 text-ink-2">{s.lastSuccess ? formatDateTime(s.lastSuccess) : "Never"}</td>
                      <td className="tabular px-4 py-3 text-right font-mono text-[12px] text-ink-2">
                        {s.health === "operational" && s.latencyMs !== null ? `${s.latencyMs} ms` : "—"}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-ink">{s.health === "operational" ? s.itemsLastScan : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {!s.simulateOutage ? (
                          <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => toggle(s.id, true)}>
                            Simulate outage
                          </Button>
                        ) : (
                          <Button size="sm" disabled={busy === s.id} onClick={() => toggle(s.id, false)}>
                            End outage
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}

        <Card>
          <CardHeader title="When a source fails" />
          <ul className="grid gap-px overflow-hidden bg-line sm:grid-cols-3 [&>li]:bg-surface">
            {[
              ["Scan continues", "Other sources run as normal. The top bar shows how many sources need attention."],
              ["Last results stay", "Detections from the last good run stay visible, marked with their scan time."],
              ["Signals degrade", "A missing logo or description only switches off that signal; the score uses the rest."],
            ].map(([t, d]) => (
              <li key={t} className="px-4 py-3">
                <div className="text-[13px] font-medium text-ink">{t}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{d}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
