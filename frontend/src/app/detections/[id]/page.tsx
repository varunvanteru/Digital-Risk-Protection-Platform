"use client";

import clsx from "clsx";
import { ArrowLeft, Ban, CircleX, ExternalLink, FileDown, Flag, LoaderCircle, ShieldCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { EvidenceTable, VerdictChip } from "@/components/evidence";
import { initialsOf } from "@/components/detection-table";
import { BrandMark, PlatformLabel } from "@/components/marks";
import { Button, Card, CardHeader, EmptyState, KeyValue, Mono, Tag } from "@/components/ui";
import { api, ApiError, mediaUrl } from "@/lib/api";
import { CLASS_LABEL, PLATFORM_LABEL, STATUS_LABEL, ageInDays, formatCount, formatDate, formatDateTime, handleDisplay } from "@/lib/format";
import { SEVERITY_ACTION, signalLabel } from "@/lib/scoring";
import { useStore } from "@/lib/store";
import type { Detection, DetectionDetail, DetectionStatus } from "@/lib/types";

function signed(n: number) {
  const v = (Math.abs(n) * 100).toFixed(1);
  return n < 0 ? `−${v}` : `+${v}`;
}

function Breakdown({ d }: { d: Detection }) {
  const { parts, boosts, cap, score } = d.breakdown;
  return (
    <Card>
      <CardHeader title="Score breakdown" description="Each signal is scored 0 to 1, then weighted. Boosts and caps follow fixed rules." />
      <div className="px-4 py-3">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[12px] text-ink-3">
              <th className="pb-2 text-left font-medium">Signal</th>
              <th className="w-[38%] pb-2 text-left font-medium">Match</th>
              <th className="w-14 pb-2 text-right font-medium">Weight</th>
              <th className="w-14 pb-2 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.key} className="border-t border-line">
                <td className="py-2 pr-3 text-ink">{signalLabel(p.key, d.channel)}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-[var(--chart-bar)]" style={{ width: `${p.value * 100}%` }} />
                    </div>
                    <span className="tabular w-9 text-right font-mono text-[12px] text-ink-2">{Math.round(p.value * 100)}%</span>
                  </div>
                </td>
                <td className="tabular py-2 text-right font-mono text-[12px] text-ink-3">{p.weight.toFixed(2)}</td>
                <td className="tabular py-2 text-right font-mono text-[12px] text-ink">{(p.contribution * 100).toFixed(1)}</td>
              </tr>
            ))}
            {boosts.map((b) => (
              <tr key={b.label} className="border-t border-line">
                <td colSpan={3} className="py-2 pr-3 text-ink-2">
                  <span className="mr-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-3">{b.amount < 0 ? "Penalty" : "Boost"}</span>
                  {b.label}
                </td>
                <td className="tabular py-2 text-right font-mono text-[12px] text-ink">{signed(b.amount)}</td>
              </tr>
            ))}
            {cap && (
              <tr className="border-t border-line">
                <td colSpan={3} className="py-2 pr-3 text-ink-2">
                  <span className="mr-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-3">Cap</span>
                  {cap}
                </td>
                <td className="tabular py-2 text-right font-mono text-[12px] text-ink">39</td>
              </tr>
            )}
            <tr className="border-t border-line-strong">
              <td colSpan={3} className="pt-2.5 font-medium text-ink">
                Risk score
              </td>
              <td className="tabular pt-2.5 text-right font-mono text-[13px] font-semibold text-ink">{score}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Compare({ d }: { d: Detection }) {
  const { brand } = useStore();
  const isApp = d.channel === "app";
  const officialAccount = brand.accounts.find((a) => a.platform === d.platform && a.status === "official") ?? brand.accounts[0];
  const officialApp = brand.apps.find((a) => a.platform === d.platform) ?? brand.apps[0];

  const official =
    isApp && officialApp
      ? { name: officialApp.name, id: officialApp.packageId, publisher: officialApp.publisher, platform: officialApp.platform }
      : officialAccount
        ? { name: officialAccount.displayName, id: handleDisplay(officialAccount.platform, officialAccount.handle), publisher: undefined, platform: officialAccount.platform }
        : null;
  if (!official) return null;

  const rows: { k: string; suspect: React.ReactNode; official: React.ReactNode; differs?: boolean }[] = [
    {
      k: isApp ? "Icon" : "Picture",
      suspect: <BrandMark variant={d.mark} size={44} initials={initialsOf(d.displayName)} src={mediaUrl(d.iconUrl)} />,
      official: <BrandMark size={44} src={mediaUrl(brand.logoUrl)} />,
    },
    { k: "Name", suspect: d.displayName, official: official.name },
    {
      k: isApp ? "Package" : "Handle",
      suspect: <Mono>{handleDisplay(d.platform, d.handle)}</Mono>,
      official: <Mono>{official.id}</Mono>,
    },
  ];
  if (isApp) {
    rows.push({ k: "Publisher", suspect: d.publisher ?? "Unknown", official: official.publisher, differs: (d.signals.publisher ?? 0) >= 0.5 });
  }
  rows.push({
    k: isApp ? "Description" : "Bio",
    suspect: d.bio ? <span className="line-clamp-6 text-ink-2">{d.bio}</span> : <span className="text-ink-3">Empty</span>,
    official: <span className="text-ink-2">{brand.description}</span>,
  });
  rows.push({
    k: isApp ? "Released" : "Created",
    suspect: d.createdAt ? `${formatDate(d.createdAt)} · ${ageInDays(d.createdAt)} days ago` : "Unknown",
    official: "On the allowlist",
  });

  return (
    <Card>
      <CardHeader title="Compared with the official asset" description={`Official counterpart on ${PLATFORM_LABEL[official.platform]}`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="text-[12px] text-ink-3">
              <th className="w-24 px-4 py-2 text-left font-medium" />
              <th className="px-4 py-2 text-left font-medium">This detection</th>
              <th className="border-l border-line px-4 py-2 text-left font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-ok" />
                  Official
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className="border-t border-line align-top">
                <td className="px-4 py-2.5 text-[12.5px] text-ink-3">{r.k}</td>
                <td className={clsx("px-4 py-2.5 leading-relaxed", r.differs ? "font-medium text-crit" : "text-ink")}>{r.suspect}</td>
                <td className="border-l border-line px-4 py-2.5 leading-relaxed text-ink">{r.official}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function downloadEvidence(d: Detection) {
  const payload = {
    detection: d.id,
    capturedAt: new Date().toISOString(),
    platform: PLATFORM_LABEL[d.platform],
    url: d.url,
    name: d.displayName,
    handle: d.handle,
    publisher: d.publisher,
    score: d.breakdown.score,
    severity: d.breakdown.severity,
    reasons: d.reasons,
    signals: d.signals,
    links: d.links,
    firstSeen: d.firstSeen,
    lastSeen: d.lastSeen,
    scanId: d.scanId,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `evidence-${d.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function DetectionPage() {
  const { id } = useParams<{ id: string }>();
  const { setStatus, refresh } = useStore();
  const [d, setD] = useState<DetectionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<DetectionStatus | "undo" | null>(null);

  const load = useCallback(() => {
    api
      .detection(id)
      .then((x) => {
        setD(x);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof ApiError && e.status === 404 ? "not_found" : e instanceof Error ? e.message : "Failed to load"));
  }, [id]);

  useEffect(load, [load]);

  async function act(status: DetectionStatus) {
    setBusy(status);
    try {
      setD(await setStatus(id, status));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function undoAllowlist() {
    setBusy("undo");
    try {
      setD(await api.undoAllowlist(id));
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  if (error === "not_found") {
    return (
      <>
        <BackLink />
        <Card>
          <EmptyState icon={<CircleX />} title="Detection not found">
            <p>It may have been removed. Go back to the list to see current detections.</p>
          </EmptyState>
        </Card>
      </>
    );
  }
  if (!d) {
    return (
      <>
        <BackLink />
        <div className="flex items-center gap-2 text-[13px] text-ink-3" role="status">
          {error ? <span className="text-crit">{error}</span> : <><LoaderCircle className="size-4 animate-spin" /> Loading</>}
        </div>
      </>
    );
  }

  if (d.allowlisted) {
    return (
      <>
        <BackLink />
        <Card>
          <EmptyState icon={<ShieldCheck />} title={`${handleDisplay(d.platform, d.handle)} is on the allowlist`}>
            <p>It is part of the brand profile as an official asset and will not be flagged in future scans.</p>
            <Button size="sm" className="mt-3" onClick={undoAllowlist} disabled={busy !== null}>
              {busy === "undo" ? <LoaderCircle className="animate-spin" /> : <Undo2 />}
              Undo
            </Button>
          </EmptyState>
        </Card>
      </>
    );
  }

  const { score, severity } = d.breakdown;
  const spin = (s: DetectionStatus) => (busy === s ? <LoaderCircle className="animate-spin" /> : null);

  return (
    <>
      <BackLink />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <BrandMark variant={d.mark} size={48} initials={initialsOf(d.displayName)} src={mediaUrl(d.iconUrl)} />
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold tracking-[-0.01em]">{d.displayName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Mono className="text-ink-2">{handleDisplay(d.platform, d.handle)}</Mono>
              <PlatformLabel platform={d.platform} />
              <Tag>{CLASS_LABEL[d.cls]}</Tag>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.status === "open" && (
            <>
              <Button variant="primary" onClick={() => act("confirmed")} disabled={busy !== null}>
                {spin("confirmed") ?? <Flag />}
                Confirm threat
              </Button>
              <Button onClick={() => act("false_positive")} disabled={busy !== null}>
                {spin("false_positive") ?? <CircleX />}
                False positive
              </Button>
              <Button onClick={() => act("official")} disabled={busy !== null}>
                {spin("official") ?? <ShieldCheck />}
                It&apos;s official
              </Button>
            </>
          )}
          {d.status === "confirmed" && (
            <Button variant="primary" onClick={() => act("takedown_requested")} disabled={busy !== null}>
              {spin("takedown_requested") ?? <Ban />}
              Request takedown
            </Button>
          )}
          {d.status !== "open" && (
            <Button variant="ghost" onClick={() => act("open")} disabled={busy !== null}>
              {spin("open") ?? <Undo2 />}
              Reopen
            </Button>
          )}
          <Button variant="ghost" onClick={() => downloadEvidence(d)}>
            <FileDown />
            Evidence
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 text-[13px] text-crit">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-4 py-4">
              <div className="flex items-baseline gap-1.5">
                <span className="tabular text-[36px] font-semibold leading-none tracking-[-0.03em]">{score}</span>
                <span className="text-[13px] text-ink-3">/ 100</span>
              </div>
              <div>
                <SeverityBadge severity={severity} />
                <p className="mt-1 text-[12.5px] text-ink-2">{SEVERITY_ACTION[severity]}</p>
              </div>
            </div>
            <div className="px-4 py-3">
              <h2 className="mb-2 text-[12.5px] font-medium text-ink-3">Why this was flagged</h2>
              <ol className="space-y-2">
                {d.reasons.map((r, i) => (
                  <li key={r} className="flex gap-3 text-[13.5px] leading-relaxed text-ink">
                    <span className="tabular mt-[3px] flex size-[18px] shrink-0 items-center justify-center rounded border border-line text-[10.5px] font-medium text-ink-3">
                      {i + 1}
                    </span>
                    {r}
                  </li>
                ))}
              </ol>
            </div>
          </Card>

          {d.checks && Object.keys(d.checks).length > 0 && (
            <Card>
              <CardHeader
                title="Evidence checks"
                description="Identity checks ran first; this item did not match any official asset, so it was scored."
                actions={<VerdictChip verdict={d.verdict} />}
              />
              <div className="px-4 py-3">
                <EvidenceTable checks={d.checks} app={d.channel === "app"} />
              </div>
            </Card>
          )}
          <Compare d={d} />
          <Breakdown d={d} />
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <div className="px-4 py-3">
              <KeyValue
                items={[
                  { k: "Status", v: <StatusBadge status={d.status} /> },
                  { k: "Source", v: PLATFORM_LABEL[d.platform] },
                  {
                    k: d.channel === "app" ? "Installs" : "Followers",
                    v: (
                      <span className="tabular">
                        {formatCount(d.audience)}
                        {d.channel === "app" && d.audience ? "+" : ""}
                      </span>
                    ),
                  },
                  { k: "First seen", v: formatDateTime(d.firstSeen) },
                  { k: "Last seen", v: formatDateTime(d.lastSeen) },
                  { k: "Scan", v: <Mono>{d.scanId}</Mono> },
                  {
                    k: "Link",
                    v: (
                      <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                        Open
                        <ExternalLink className="size-3" />
                      </a>
                    ),
                  },
                ]}
              />
            </div>
          </Card>

          {d.links.length > 0 && (
            <Card>
              <CardHeader title="Links in profile" />
              <ul className="space-y-1.5 px-4 py-3">
                {d.links.map((l) => (
                  <li key={l} className="flex items-center justify-between gap-2">
                    <Mono className="truncate text-ink">{l}</Mono>
                    <span className="shrink-0 text-[11.5px] text-ink-3">Not official</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Activity" />
            <ol className="space-y-2.5 px-4 py-3 text-[12.5px]">
              <li className="flex justify-between gap-3">
                <span className="text-ink">First detected</span>
                <span className="tabular text-ink-3">{formatDateTime(d.firstSeen)}</span>
              </li>
              {d.events.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-ink">
                    {e.action === "allowlisted" ? "Added to allowlist" : `${e.from ? STATUS_LABEL[e.from] : "—"} → ${e.to ? STATUS_LABEL[e.to] : "—"}`}
                  </span>
                  <span className="tabular shrink-0 text-ink-3">{formatDateTime(e.at)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/detections" className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink">
      <ArrowLeft className="size-3.5" />
      Detections
    </Link>
  );
}
