"use client";

import clsx from "clsx";
import { Check, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { severityLabel } from "@/components/badges";
import { PlatformLogo } from "@/components/platform-logo";
import { Button, Card, CardHeader, PageHeader, Segmented } from "@/components/ui";
import { api } from "@/lib/api";
import { ALL_PLATFORMS } from "@/lib/format";
import type { AccuracyReport, Platform } from "@/lib/types";

type Filter = "all" | "official" | "fake" | "mention" | "unrelated" | "errors";

const LABEL: Record<AccuracyReport["rows"][number]["label"], string> = {
  official: "Official",
  fake: "Fake",
  mention: "Mention",
  unrelated: "Unrelated",
};

function Metric({ label, value, sub, strong }: { label: string; value: string; sub: string; strong?: boolean }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div className={clsx("tabular mt-1.5 text-[28px] font-semibold leading-none tracking-[-0.02em]", strong ? "text-ok" : "text-ink")}>{value}</div>
      <div className="mt-2 text-[12.5px] text-ink-3">{sub}</div>
    </div>
  );
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function AccuracyPage() {
  const [report, setReport] = useState<AccuracyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .accuracy()
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not run the evaluation"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    if (!report) return [];
    if (filter === "errors") return report.rows.filter((r) => !r.correct);
    if (filter === "all") return report.rows;
    return report.rows.filter((r) => r.label === filter);
  }, [report, filter]);

  return (
    <>
      <PageHeader
        title="Accuracy"
        description="Every labelled case runs through the same engine as scans and Quick check: official verification first, then risk scoring. Nothing on this page is typed in by hand."
        actions={
          <Button onClick={load} disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Re-run
          </Button>
        }
      />

      {error && <p className="mb-4 text-[13px] text-crit">{error}</p>}
      {!report ? (
        <div className="flex items-center gap-2 text-[13px] text-ink-3" role="status">
          <LoaderCircle className="size-4 animate-spin" /> Running the labelled test set
        </div>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-4 border-b border-line bg-ok-bg/60 px-5 py-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-surface text-ok">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <div className="tabular text-[22px] font-semibold tracking-[-0.01em] text-ink">
                  {report.officialFlagged} of {report.officialTested} official assets flagged
                </div>
                <p className="text-[13px] text-ink-2">
                  {report.officialRecognised} of {report.officialTested} verified as official and excluded before risk scoring, including variants found
                  through their developer account. {report.mentionsFlagged} legitimate mentions or unrelated names flagged.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4 [&>*]:bg-surface">
              <Metric label="Precision" value={pct(report.precision)} sub={`${report.falsePositives} false positives`} />
              <Metric label="Recall" value={pct(report.recall)} sub={`${report.falseNegatives} fakes missed`} />
              <Metric label="F1" value={report.f1.toFixed(3)} sub={`${report.cases} labelled cases`} />
              <Metric label="Correct" value={`${report.rows.filter((r) => r.correct).length}/${report.cases}`} sub={Object.entries(report.byBrand).map(([b, v]) => `${b} ${v.correct}/${v.cases}`).join(" · ")} />
            </div>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card>
              <CardHeader title="Confusion matrix" description="Positive class = fake" />
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[12px] text-ink-3">
                    <th className="h-9 px-4 text-left font-medium" />
                    <th className="h-9 px-3 text-right font-medium">Flagged</th>
                    <th className="h-9 px-4 text-right font-medium">Not flagged</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  <tr className="border-t border-line">
                    <td className="px-4 py-2.5 text-ink-2">Fake</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink">{report.truePositives}</td>
                    <td className="px-4 py-2.5 text-right text-crit">{report.falseNegatives}</td>
                  </tr>
                  <tr className="border-t border-line">
                    <td className="px-4 py-2.5 text-ink-2">Not fake</td>
                    <td className="px-3 py-2.5 text-right text-crit">{report.falsePositives}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-ink">{report.trueNegatives}</td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-ink-3">{report.definition}</p>
            </Card>

            <Card>
              <CardHeader
                title="Labelled cases"
                description="Official, fake, legitimate mentions and unrelated names, with the engine's outcome"
                actions={
                  <Segmented<Filter>
                    label="Filter cases"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "all", label: "All", count: report.rows.length },
                      { value: "official", label: "Official", count: report.officialTested },
                      { value: "fake", label: "Fake", count: report.rows.filter((r) => r.label === "fake").length },
                      { value: "mention", label: "Mention" },
                      { value: "unrelated", label: "Unrelated" },
                      { value: "errors", label: "Errors", count: report.rows.filter((r) => !r.correct).length },
                    ]}
                  />
                }
              />
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full min-w-[760px] text-[12.5px]">
                  <thead className="sticky top-0 border-b border-line bg-surface text-[12px] text-ink-3">
                    <tr>
                      <th className="h-9 w-10 px-4 text-left font-medium" />
                      <th className="h-9 px-2 text-left font-medium">Label</th>
                      <th className="h-9 px-2 text-left font-medium">Case</th>
                      <th className="h-9 px-2 text-left font-medium">Outcome</th>
                      <th className="h-9 px-4 text-left font-medium">First reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.brand}-${r.handle}-${i}`} className="border-b border-line align-top last:border-0">
                        <td className="px-4 py-2">
                          {r.correct ? <Check aria-label="correct" className="size-4 text-ok" /> : <X aria-label="wrong" className="size-4 text-crit" />}
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium text-ink">{LABEL[r.label]}</div>
                          <div className="text-[11.5px] text-ink-3">{r.brand}</div>
                        </td>
                        <td className="max-w-[260px] px-2 py-2">
                          <div className="flex items-center gap-1.5 truncate text-ink">
                            {ALL_PLATFORMS.includes(r.platform as Platform) && <PlatformLogo platform={r.platform as Platform} size={12} />}
                            <span className="truncate">{r.name}</span>
                          </div>
                          <div className="truncate text-[11.5px] text-ink-3">{r.group}</div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span
                            className={clsx(
                              "font-medium",
                              r.outcome === "FLAGGED" ? "text-crit" : r.outcome.includes("OFFICIAL") ? "text-ok" : "text-ink-2",
                            )}
                          >
                            {r.outcome.replace("_", " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase())}
                          </span>
                          {r.severity && (
                            <div className="tabular text-[11.5px] text-ink-3">
                              {r.score} · {severityLabel(r.severity)}
                            </div>
                          )}
                        </td>
                        <td className="max-w-[340px] px-4 py-2 text-ink-2">
                          <span className="line-clamp-2">{r.reason}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
