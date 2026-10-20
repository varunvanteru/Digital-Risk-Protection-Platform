"use client";

import { Database, Info, Layers, Radar, ScanSearch, ShieldCheck, Siren, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { HealthBadge, SeverityIcon } from "@/components/badges";
import { DetectionTable } from "@/components/detection-table";
import { PlatformGlyph } from "@/components/marks";
import { TrendChart, type DayCount } from "@/components/trend-chart";
import { ButtonLink, Card, CardHeader, DotPill, EmptyState, FloatLink, Orb, PageHeader, Segmented, StatCard } from "@/components/ui";
import { formatDateTime, PLATFORM_LABEL } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Detection, Severity } from "@/lib/types";

function istDate(iso: string) {
  return new Date(Date.parse(iso) + 5.5 * 3600e3).toISOString().slice(0, 10);
}

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
// Found but neither dismissed as a false positive nor confirmed as the brand's own.
const isActive = (d: Detection) => d.status !== "false_positive" && d.status !== "official";
const byScore = (a: Detection, b: Detection) => b.breakdown.score - a.breakdown.score;

/** What the last scan searched and checked: shown even when it found nothing, so an empty result reads as "clean", not "broken". */
function LastScan() {
  const { lastScan, sources, scanning } = useStore();
  if (!lastScan) {
    return (
      <Card className="mt-4">
        <CardHeader icon={<ScanSearch />} title="Last scan" description={scanning ? "The first scan is running…" : "No scan yet: press Run scan"} />
      </Card>
    );
  }
  const status = lastScan.sources ?? {};
  const searched = sources.filter((s) => status[s.id]?.ok);
  const notConnected = sources.filter((s) => s.state === "not_connected" || status[s.id]?.state === "not_connected");
  const failed = sources.filter((s) => status[s.id] && !status[s.id].ok && status[s.id].state !== "not_connected" && s.state !== "not_connected");
  const figures: [string, number | string, string?][] = [
    ["Sources searched live", searched.length, "text-ink"],
    ["Accounts and apps checked", lastScan.candidates, "text-ink"],
    ["Official assets recognised", lastScan.officialSkipped, "text-ok"],
    ["Official assets flagged", lastScan.officialFlagged, lastScan.officialFlagged ? "text-crit" : "text-ok"],
  ];
  return (
    <Card className="mt-4">
      <CardHeader
        icon={<ScanSearch />}
        title="Last scan"
        description={lastScan.finishedAt ? `Finished ${formatDateTime(lastScan.finishedAt)}` : "Running…"}
        actions={<FloatLink href="/sources" label="All sources" />}
      />
      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        {figures.map(([label, value, tone]) => (
          <div key={label} className="bg-[var(--card-bg)] px-4 py-3">
            <div className={`tabular font-[family-name:var(--font-heading)] text-[22px] font-bold leading-none ${tone ?? ""}`}>{value}</div>
            <div className="mt-1.5 text-[12px] text-ink-3">{label}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-line px-4 py-3">
        <ul className="flex flex-wrap gap-1.5" aria-label="Sources searched">
          {searched.map((s) => (
            <li key={s.id} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface px-2 text-[11.5px] text-ink-2" title={`${s.name}: ${status[s.id]?.items ?? 0} checked`}>
              <PlatformGlyph platform={s.platform} />
              {s.name}
              <span className="tabular text-ink-3">{status[s.id]?.items ?? 0}</span>
            </li>
          ))}
        </ul>
        {(notConnected.length > 0 || failed.length > 0) && (
          <p className="mt-2 text-[12px] text-ink-3">
            {failed.length > 0 && <span className="text-high">Unavailable this time: {failed.map((s) => s.name).join(", ")}. </span>}
            {notConnected.length > 0 && <>Not connected: {notConnected.map((s) => s.name).join(", ")}.</>}
          </p>
        )}
      </div>
    </Card>
  );
}

export default function OverviewPage() {
  const { brand, detections, sources, lastScan, scanning } = useStore();
  const possiblyOfficial = (lastScan?.possiblyOfficial ?? []).filter((p) => !brand.apps.some((a) => a.packageId === p.packageId));

  const active = useMemo(() => detections.filter(isActive).sort(byScore), [detections]);
  const open = detections.filter((d) => d.status === "open");
  // The five cards count the same findings, so Critical + High + Medium + Low = Found.
  const bySev = (s: Severity) => active.filter((d) => d.breakdown.severity === s).length;
  const attention = open.filter((d) => d.breakdown.severity === "critical" || d.breakdown.severity === "high").sort(byScore).slice(0, 6);
  const [show, setShow] = useState<"all" | Severity>("all");
  const shown = show === "all" ? active : active.filter((d) => d.breakdown.severity === show);
  const FINDINGS_ROWS = 10;

  const trend: DayCount[] = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.parse(istDate(new Date().toISOString())) - (13 - i) * 864e5);
      const date = d.toISOString().slice(0, 10);
      return {
        date,
        label: `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      };
    });
    for (const d of active) {
      const day = days.find((x) => x.date === istDate(d.firstSeen));
      if (day) day[d.breakdown.severity]++;
    }
    return days;
  }, [active]);

  // Most critical first; unhealthy sources always make the cut so outages stay visible.
  const SOURCE_ROWS = 8;
  const ranked = sources
    .map((s) => {
      const rows = active.filter((d) => d.sourceId === s.id);
      return { ...s, found: rows.length, critical: rows.filter((d) => d.breakdown.severity === "critical").length };
    })
    .sort((a, b) => b.critical - a.critical || b.found - a.found || a.name.localeCompare(b.name));
  const attentionNeeded = (s: (typeof ranked)[number]) => s.health !== "operational" && s.health !== "not_connected";
  const unhealthy = ranked.filter(attentionNeeded);
  const bySource = [...unhealthy, ...ranked.filter((s) => !attentionNeeded(s) && s.health !== "not_connected")]
    .slice(0, Math.max(SOURCE_ROWS, unhealthy.length))
    .sort((a, b) => b.critical - a.critical || b.found - a.found || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        eyebrow="Brand protection"
        title="Risk overview"
        description={`Impersonation risk for ${brand.name} across social platforms and app stores.`}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={<Radar />}
          label="Found"
          value={active.length}
          sub={lastScan ? `look-alikes, from ${lastScan.candidates} checked` : scanning ? "First scan running…" : "No scan yet"}
          href="/detections"
          hrefLabel="All detections"
        />
        <StatCard icon={<SeverityIcon severity="critical" />} tone="crit" label="Critical" value={bySev("critical")} sub="Takedown recommended" href="/detections" hrefLabel="Critical detections" />
        <StatCard icon={<SeverityIcon severity="high" />} tone="high" label="High" value={bySev("high")} sub="Review today" href="/detections" hrefLabel="High detections" />
        <StatCard icon={<SeverityIcon severity="medium" />} tone="med" label="Medium" value={bySev("medium")} sub="Look-alike, keep an eye on" href="/detections" hrefLabel="Medium detections" />
        <StatCard icon={<SeverityIcon severity="low" />} tone="ink" label="Low" value={bySev("low")} sub="Mentions, not flagged" href="/detections" hrefLabel="Low-risk mentions" />
      </div>

      <LastScan />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="flex flex-col">
          <CardHeader icon={<TrendingUp />} title="New detections" description="Every severity, by day first seen · last 14 days" />
          <div className="flex-1 px-4 pb-3 pt-4">
            <TrendChart data={trend} />
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<Database />}
            title="By source"
            description={`Top ${bySource.length} of ${sources.filter((s) => s.health !== "not_connected").length} connected, most critical first`}
            actions={<FloatLink href="/sources" label="All sources" />}
          />
          <table className="w-full table-fixed text-[12.5px]">
            <thead>
              <tr className="text-[12px] text-ink-3">
                <th className="h-8 px-3.5 text-left font-medium">Source</th>
                <th className="h-8 w-[68px] px-1.5 text-right font-medium">Found</th>
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
                  <td className="tabular px-1.5 py-2 text-right text-ink">{s.found}</td>
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
              {attention.some((d) => d.breakdown.severity === "critical") && (
                <DotPill tone="crit">{open.filter((d) => d.breakdown.severity === "critical").length} critical</DotPill>
              )}
              <FloatLink href="/detections" label="All detections" />
            </>
          }
        />
        {attention.length ? (
          <DetectionTable rows={attention} compact />
        ) : (
          // A short all-clear line, not a big empty box: the findings below carry the detail.
          <div className="flex items-start gap-3 px-4 py-3.5">
            <Orb size="sm" tone="ok">
              <ShieldCheck />
            </Orb>
            <p className="text-[13px] leading-relaxed text-ink-2">
              <span className="font-semibold text-ink">Nothing Critical or High.</span>{" "}
              {lastScan
                ? `No account or app is clearly impersonating ${brand.name} right now. ${
                    active.length
                      ? `Everything the scan found (${active.length} look-alike${active.length === 1 ? "" : "s"}, lower risk) is listed below.`
                      : "The scan found no look-alikes at all."
                  }`
                : `Run a scan to check ${brand.name}.`}
            </p>
          </div>
        )}
      </Card>

      {/* Everything the scan found, every severity, like Quick check: a quiet brand still sees what was checked and found. */}
      <Card className="mt-4">
        <CardHeader
          icon={<Layers />}
          title="All findings"
          description="Every look-alike found, every severity, highest score first. Low means it resembles the brand but is not flagged."
          actions={
            <Segmented
              label="Severity"
              value={show}
              onChange={setShow}
              options={[
                { value: "all", label: "All", count: active.length },
                ...SEVERITIES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: active.filter((d) => d.breakdown.severity === s).length })),
              ]}
            />
          }
        />
        {shown.length ? (
          <>
            <DetectionTable rows={shown.slice(0, FINDINGS_ROWS)} compact />
            {shown.length > FINDINGS_ROWS && (
              <div className="border-t border-line px-4 py-2.5 text-right">
                <ButtonLink href="/detections" size="sm" variant="ghost">
                  View all {shown.length}
                </ButtonLink>
              </div>
            )}
          </>
        ) : (
          <EmptyState icon={<ShieldCheck />} title={active.length ? "None at this severity" : "No look-alikes found"}>
            {active.length
              ? "Choose another severity above."
              : lastScan
                ? `The scan checked ${lastScan.candidates} accounts and apps and none of them resembles ${brand.name}. New brands often look like this; scans keep watching.`
                : "Run a scan to see what resembles the brand."}
          </EmptyState>
        )}
      </Card>
    </>
  );
}
