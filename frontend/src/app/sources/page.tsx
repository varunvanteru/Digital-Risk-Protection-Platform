"use client";

import clsx from "clsx";
import { HealthBadge } from "@/components/badges";
import { PlatformGlyph } from "@/components/marks";
import { Share2, Store } from "lucide-react";
import { Button, Card, CardHeader, PageHeader, StepOrb } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useState } from "react";
import { useStore } from "@/lib/store";
import type { SourceState } from "@/lib/types";

const STATE: Record<SourceState, { label: string; className: string; note: string }> = {
  live: { label: "Live", className: "bg-ok-bg text-ok", note: "Searched live" },
  cached: { label: "Cached", className: "bg-high-bg text-high", note: "Live source down; last good results" },
  simulated: { label: "Simulated", className: "bg-low-bg text-ink-2", note: "Curated sample data (no open API)" },
  down: { label: "Down", className: "bg-crit-bg text-crit", note: "Unavailable" },
  not_connected: { label: "Not connected", className: "bg-surface-2 text-ink-3", note: "Not searched: no public API, or its API key is not set" },
};

// The outage buttons are a demo of graceful handling, not real data: say so where they are.
const OUTAGE_TIP = "Test only: pauses this source as if it were down, so the next scan shows the rest carrying on. Nothing is deleted.";

// A source's note: red when it failed, amber when degraded, grey when it is information only
// (not connected, or which provider answered).
const noteColor = (health: string) => (health === "unavailable" ? "text-crit" : health === "degraded" ? "text-high" : "text-ink-3");

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
    { title: "App stores", icon: <Store />, rows: sources.filter((s) => s.channel === "app") },
    { title: "Social platforms", icon: <Share2 />, rows: sources.filter((s) => s.channel === "social") },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Where data comes from"
        title="Data sources"
        description="Where candidates come from. Each source runs on its own with a 10-second timeout and 2 retries, so one failing source never stops a scan."
      />

      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader icon={g.icon} title={g.title} description={`${g.rows.length} sources · ${g.rows.filter((s) => s.mode === "live" && s.state !== "not_connected").length} live · ${g.rows.filter((s) => s.state === "not_connected").length} not connected`} />
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
                    <p className={clsx("mt-1 text-[12px]", noteColor(s.health))}>{s.note}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-ink-2">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <HealthBadge health={s.health} />
                      <span className="tabular">{s.health === "operational" ? `${s.itemsLastScan} items` : "—"}</span>
                      {s.health === "operational" && s.latencyMs !== null && <span className="tabular font-mono text-ink-3">{s.latencyMs} ms</span>}
                    </span>
                    {s.state === "not_connected" ? null : !s.simulateOutage ? (
                      <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => toggle(s.id, true)} title={OUTAGE_TIP}>
                        Pause source
                      </Button>
                    ) : (
                      <Button size="sm" disabled={busy === s.id} onClick={() => toggle(s.id, false)} title="Resume this source; it is searched again on the next scan">

                        Resume source
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
                          <p className={clsx("mt-1 max-w-sm text-[12px]", noteColor(s.health))}>
                            {s.note}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx("inline-flex h-5 items-center rounded px-1.5 text-[11px] font-semibold uppercase tracking-wide", STATE[s.state].className)}
                          title={`${STATE[s.state].note} · ${s.mode === "live" ? "Live connector" : s.mode === "off" ? "No public API" : "Curated dataset"}`}
                        >
                          {STATE[s.state].label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <HealthBadge health={s.health} />
                      </td>
                      <td className="tabular px-4 py-3 text-ink-2">
                        {s.state === "not_connected" ? "—" : s.lastSuccess ? formatDateTime(s.lastSuccess) : "Never"}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-mono text-[12px] text-ink-2">
                        {s.health === "operational" && s.latencyMs !== null ? `${s.latencyMs} ms` : "—"}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-ink">{s.health === "operational" ? s.itemsLastScan : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {s.state === "not_connected" ? null : !s.simulateOutage ? (
                          <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => toggle(s.id, true)} title={OUTAGE_TIP}>
                            Pause source
                          </Button>
                        ) : (
                          <Button size="sm" disabled={busy === s.id} onClick={() => toggle(s.id, false)} title="Resume this source; it is searched again on the next scan">

                            Resume source
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

        <div>
          <div className="eyebrow mb-1 mt-4 text-[12px]">Graceful degradation</div>
          <h2 className="page-title mb-4 !text-[22px] text-ink">
            When a source <em>fails</em>
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {[
              ["Scan continues", "Other sources run as normal. The top bar shows how many sources need attention."],
              ["Last results stay", "Detections from the last good run stay visible, marked with their scan time."],
              ["Signals degrade", "A missing logo or description only switches off that signal; the score uses the rest."],
            ].map(([t, d], i) => (
              <li key={t}>
                <Card className="h-full p-5">
                  <StepOrb n={i + 1} />
                  <div className="card-title mt-4 text-[13.5px] font-semibold text-ink">{t}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{d}</p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
