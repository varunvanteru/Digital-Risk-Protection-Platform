"use client";

import clsx from "clsx";
import { LoaderCircle, ScanSearch, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { SeverityIcon, severityLabel } from "@/components/badges";
import { DetectionTable, type SortKey } from "@/components/detection-table";
import { Button, Card, EmptyState, Input, PageHeader, Segmented, Select } from "@/components/ui";
import { PLATFORM_LABEL, STATUS_LABEL } from "@/lib/format";
import { SEVERITY_ORDER } from "@/lib/scoring";
import { useStore } from "@/lib/store";
import type { Channel, DetectionStatus, Platform, Severity } from "@/lib/types";

type ChannelFilter = "all" | Channel;
type StatusFilter = "active" | "all" | DetectionStatus;

// Every severity by default, so a quiet brand still sees everything the scan found; Low can be switched off.
const DEFAULT_SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export default function DetectionsPage() {
  const { detections, scanning, lastScan, brand, runScan } = useStore();
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [severities, setSeverities] = useState<Severity[]>(DEFAULT_SEVERITIES);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "score", dir: "desc" });

  const platforms = useMemo(
    () => Array.from(new Set(detections.filter((d) => channel === "all" || d.channel === channel).map((d) => d.platform))),
    [detections, channel],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = detections.filter((d) => {
      if (channel !== "all" && d.channel !== channel) return false;
      if (platform !== "all" && d.platform !== platform) return false;
      if (!severities.includes(d.breakdown.severity)) return false;
      if (status === "active" && (d.status === "false_positive" || d.status === "official")) return false;
      if (status !== "active" && status !== "all" && d.status !== status) return false;
      if (q && !`${d.displayName} ${d.handle} ${d.publisher ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sort.dir === "desc" ? -1 : 1;
    return filtered.sort((a, b) =>
      sort.key === "score"
        ? dir * (a.breakdown.score - b.breakdown.score)
        : dir * (Date.parse(a.firstSeen) - Date.parse(b.firstSeen)),
    );
  }, [detections, query, channel, platform, severities, status, sort]);

  const count = (c: ChannelFilter) => detections.filter((d) => (c === "all" || d.channel === c) && severities.includes(d.breakdown.severity)).length;
  const isDefault =
    !query && channel === "all" && platform === "all" && status === "active" && severities.join() === DEFAULT_SEVERITIES.join();

  function reset() {
    setQuery("");
    setChannel("all");
    setPlatform("all");
    setSeverities(DEFAULT_SEVERITIES);
    setStatus("active");
  }

  function toggleSeverity(s: Severity) {
    setSeverities((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : SEVERITY_ORDER.filter((x) => x === s || cur.includes(x))));
  }

  function onSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }

  return (
    <>
      <PageHeader
        eyebrow="Threat queue"
        title="All detections"
        description="Accounts and apps that resemble your brand, scored 0 to 100. Official assets are excluded before scoring."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, handle or publisher"
            className="pl-8"
            aria-label="Search detections"
          />
        </div>
        <Segmented
          label="Channel"
          value={channel}
          onChange={(v) => {
            setChannel(v);
            setPlatform("all");
          }}
          options={[
            { value: "all", label: "All", count: count("all") },
            { value: "social", label: "Social", count: count("social") },
            { value: "app", label: "Apps", count: count("app") },
          ]}
        />
        <Select
          aria-label="Platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform | "all")}
          className="min-w-0 flex-1 basis-36 sm:w-auto sm:flex-none"
        >
          <option value="all">All platforms</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="min-w-0 flex-1 basis-36 sm:w-auto sm:flex-none"
        >
          <option value="active">Active (hide dismissed)</option>
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_LABEL) as DetectionStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Severity">
          {SEVERITY_ORDER.map((s) => {
            const on = severities.includes(s);
            return (
              <button
                key={s}
                aria-pressed={on}
                onClick={() => toggleSeverity(s)}
                className={clsx(
                  "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-[12px] font-medium transition-colors",
                  on ? "border-line-strong bg-surface text-ink" : "border-dashed border-line-strong text-ink-3 hover:text-ink-2",
                )}
              >
                <SeverityIcon severity={s} className={clsx(!on && "opacity-50")} />
                {severityLabel(s)}
              </button>
            );
          })}
        </div>

        {!isDefault && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset
          </Button>
        )}
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[12.5px] text-ink-3">
          <span className="tabular">
            {rows.length} of {detections.length} detections
          </span>
          {!severities.includes("low") && (
            <button onClick={() => toggleSeverity("low")} className="hover:text-ink">
              Low-risk mentions are hidden
            </button>
          )}
        </div>
        {rows.length ? (
          <DetectionTable rows={rows} sort={sort} onSort={onSort} />
        ) : !detections.length && scanning ? (
          <EmptyState icon={<LoaderCircle className="animate-spin" />} title="Scanning sources">
            <p>The scan is running. Detections appear here when it finishes, usually within a minute.</p>
          </EmptyState>
        ) : !detections.length && !lastScan ? (
          <EmptyState icon={<ScanSearch />} title="No scan yet">
            <p>Press Run scan to search every source for look-alikes of {brand.name}.</p>
            <Button size="sm" variant="primary" className="mt-3" onClick={runScan}>
              <ScanSearch />
              Run scan
            </Button>
          </EmptyState>
        ) : (
          <EmptyState icon={<SlidersHorizontal />} title="No detections match these filters">
            <p>
              {query
                ? `Nothing matches “${query}”. Try a shorter search or another platform.`
                : "Try including more severities or statuses."}
            </p>
            <Button size="sm" className="mt-3" onClick={reset}>
              Reset filters
            </Button>
          </EmptyState>
        )}
      </Card>
    </>
  );
}
