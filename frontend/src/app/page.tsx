"use client";

import { Database, Info, Radar, ShieldCheck, Siren, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { HealthBadge, SeverityIcon } from "@/components/badges";
import { DetectionTable } from "@/components/detection-table";
import { PlatformGlyph } from "@/components/marks";
import { TrendChart, type DayCount } from "@/components/trend-chart";
import { ButtonLink, Card, CardHeader, DotPill, EmptyState, FloatLink, Orb, PageHeader, StatCard } from "@/components/ui";
import { PLATFORM_LABEL } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Severity } from "@/lib/types";


function istDate(iso: string) {
  return new Date(Date.parse(iso) + 5.5 * 3600e3).toISOString().slice(0, 10);
}

export default function OverviewPage() {
  const { brand, detections, sources, lastScan } = useStore();
  const possiblyOfficial = (lastScan?.possiblyOfficial ?? []).filter((p) => !brand.apps.some((a) => a.packageId === p.packageId));

  const flagged = detections.filter((d) => d.breakdown.severity !== "low");
  const open = flagged.filter((d) => d.status === "open");
  const bySev = (s: Severity) => open.filter((d) => d.breakdown.severity === s).length;
  const attention = open.filter((d) => d.breakdown.severity === "critical" || d.breakdown.severity === "high").slice(0, 6);
  const protectedCount = brand.accounts.length + brand.apps.length;

  const trend: DayCount[] = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.parse(istDate(new Date().toISOString())) - (13 - i) * 864e5);
      const date = d.toISOString().slice(0, 10);
      return {
        date,
        label: `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`,
        count: 0,
      };
    });
    for (const d of flagged) {
      const day = days.find((x) => x.date === istDate(d.firstSeen));
      if (day) day.count++;
    }
    return days;
  }, [flagged]);

  // Most critical first; unhealthy sources always make the cut so outages stay visible.
  const SOURCE_ROWS = 8;
  const ranked = sources
    .map((s) => {
      const rows = flagged.filter((d) => d.sourceId === s.id);
      return { ...s, flagged: rows.length, critical: rows.filter((d) => d.breakdown.severity === "critical").length };
    })
    .sort((a, b) => b.critical - a.critical || b.flagged - a.flagged || a.name.localeCompare(b.name));
  const unhealthy = ranked.filter((s) => s.health !== "operational");
  const bySource = [...unhealthy, ...ranked.filter((s) => s.health === "operational")]
    .slice(0, Math.max(SOURCE_ROWS, unhealthy.length))
    .sort((a, b) => b.critical - a.critical || b.flagged - a.flagged || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        eyebrow="Brand protection"
        title="Risk overview"
        description={`Impersonation risk for ${brand.name} across social platforms and app stores.`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Radar />}
          label="Open detections"
          value={open.length}
          sub={lastScan ? `From ${lastScan.candidates} candidates in the last scan` : "No scan yet"}
          href="/detections"
          hrefLabel="All detections"
        />
        <StatCard icon={<SeverityIcon severity="critical" />} tone="crit" label="Critical" value={bySev("critical")} sub="Takedown recommended" href="/detections" hrefLabel="Critical detections" />
        <StatCard icon={<SeverityIcon severity="high" />} tone="high" label="High" value={bySev("high")} sub="Review today" href="/detections" hrefLabel="High detections" />
        <StatCard
          icon={<ShieldCheck />}
          tone="ok"
          label="Official assets flagged"
          value={lastScan?.officialFlagged ?? 0}
          sub={`${protectedCount} assets on the allowlist`}
          href="/brand"
          hrefLabel="Brand profile"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="flex flex-col">
          <CardHeader icon={<TrendingUp />} title="New detections" description="Medium severity and above, by day first seen · last 14 days" />
          <div className="flex-1 px-4 pb-3 pt-4">
            <TrendChart data={trend} />
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<Database />}
            title="By source"
            description={`Top ${bySource.length} of ${sources.length}, most critical first`}
            actions={<FloatLink href="/sources" label="All sources" />}
          />
          <table className="w-full table-fixed text-[12.5px]">
            <thead>
              <tr className="text-[12px] text-ink-3">
                <th className="h-8 px-3.5 text-left font-medium">Source</th>
                <th className="h-8 w-[68px] px-1.5 text-right font-medium">Flagged</th>
                <th className="h-8 w-[64px] px-1.5 text-right font-medium">Critical</th>
                <th className="h-8 w-9 pr-3.5 text-right font-medium">
                  <span className="sr-only">Health</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {bySource.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="px-3.5 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-ink">
                      <PlatformGlyph platform={s.platform} />
                      <span className="truncate">{s.name}</span>
                    </span>
                  </td>
                  <td className="tabular px-1.5 py-2 text-right text-ink">{s.flagged}</td>
                  <td className="tabular px-1.5 py-2 text-right text-ink-2">{s.critical}</td>
                  <td className="pr-3.5 py-2 text-right" title={s.note ?? undefined}>
                    <HealthBadge health={s.health} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {possiblyOfficial.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] sm:flex-row sm:items-center">
          <Orb size="sm" className="hidden sm:inline-flex">
            <Info />
          </Orb>
          <p className="flex-1 leading-relaxed text-ink-2">
            {possiblyOfficial.length === 1 ? (
              <>
                <span className="font-medium text-ink">{possiblyOfficial[0].name}</span> ({PLATFORM_LABEL[possiblyOfficial[0].platform]} ·{" "}
                <span className="font-mono text-[12px]">{possiblyOfficial[0].packageId}</span>) was verified as official but is not in the brand profile.
              </>
            ) : (
              <>
                <span className="font-medium text-ink">{possiblyOfficial.length} apps</span> were verified as official but are not in the brand profile, e.g.{" "}
                <span className="font-medium text-ink">{possiblyOfficial[0].name}</span> ({PLATFORM_LABEL[possiblyOfficial[0].platform]} ·{" "}
                <span className="font-mono text-[12px]">{possiblyOfficial[0].packageId}</span>).
              </>
            )}{" "}
            None were flagged. Add them so they are matched by ID.
          </p>
          <ButtonLink href="/brand#apps" size="sm">
            Review and add
          </ButtonLink>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader
          icon={<Siren />}
          title="Needs attention"
          description="Open Critical and High detections, highest score first"
          actions={
            <>
              {bySev("critical") > 0 && <DotPill tone="crit">{bySev("critical")} critical</DotPill>}
              <FloatLink href="/detections" label="All detections" />
            </>
          }
        />
        {attention.length ? (
          <DetectionTable rows={attention} compact />
        ) : (
          <EmptyState icon={<ShieldCheck />} title="Nothing needs attention">
            No open Critical or High detections for {brand.name}. Official assets are excluded before scoring, so they never appear here.
          </EmptyState>
        )}
      </Card>
    </>
  );
}
