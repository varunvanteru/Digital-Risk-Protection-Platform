"use client";

import clsx from "clsx";
import { HealthBadge } from "@/components/badges";
import { PlatformGlyph } from "@/components/marks";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";

const MODE_LABEL = { live: "Live", dataset: "Dataset", manual: "Manual" } as const;

export default function SourcesPage() {
  const { sources, setSourceHealth } = useStore();
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead className="border-b border-line bg-surface-2/50 text-[12px] text-ink-3">
                  <tr>
                    <th className="h-9 px-4 text-left font-medium">Source</th>
                    <th className="h-9 px-4 text-left font-medium">Mode</th>
                    <th className="h-9 px-4 text-left font-medium">Health</th>
                    <th className="h-9 px-4 text-left font-medium">Last success</th>
                    <th className="h-9 px-4 text-right font-medium">Latency</th>
                    <th className="h-9 px-4 text-right font-medium">Items, last scan</th>
                    <th className="h-9 w-36 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((s) => (
                    <tr key={s.id} className="border-b border-line align-top last:border-0">
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
                      <td className="px-4 py-3 text-ink-2">{MODE_LABEL[s.mode]}</td>
                      <td className="px-4 py-3">
                        <HealthBadge health={s.health} />
                      </td>
                      <td className="tabular px-4 py-3 text-ink-2">{formatDateTime(s.lastSuccess)}</td>
                      <td className="tabular px-4 py-3 text-right font-mono text-[12px] text-ink-2">
                        {s.health === "operational" && s.latencyMs !== null ? `${s.latencyMs} ms` : "—"}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-ink">{s.health === "operational" ? s.itemsLastScan : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {s.health === "operational" ? (
                          <Button size="sm" variant="ghost" onClick={() => setSourceHealth(s.id, "unavailable")}>
                            Simulate outage
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => setSourceHealth(s.id, "operational")}>
                            Retry now
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
