"use client";

import clsx from "clsx";
import { CircleCheck, CircleDot, LoaderCircle, OctagonAlert, ScanSearch, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardHeader, EmptyState, Input, Mono, PageHeader, Tag } from "@/components/ui";
import { handleDisplay } from "@/lib/format";
import { api } from "@/lib/api";
import type { QuickCheck } from "@/lib/types";

type Verdict = QuickCheck["result"]["verdict"];
import { useStore } from "@/lib/store";

const EXAMPLES = [
  "z3ntra.pay_official",
  "zentrapay_support_india",
  "zentarpay",
  "Zentra Pay",
  "zentrа_pay",
  "Zentro Foods",
  "sentra",
  "zentrafitness",
  "@zentrapay",
];

const VERDICT: Record<Verdict, { label: string; text: string; bg: string; Icon: typeof OctagonAlert }> = {
  match: { label: "Look-alike", text: "text-crit", bg: "bg-crit-bg", Icon: OctagonAlert },
  partial: { label: "Partial match", text: "text-high", bg: "bg-high-bg", Icon: TriangleAlert },
  no_match: { label: "Not a look-alike", text: "text-ok", bg: "bg-ok-bg", Icon: CircleCheck },
};

export default function QuickCheckPage() {
  const { brand } = useStore();
  const [value, setValue] = useState("z3ntra.pay_official");

  const [data, setData] = useState<QuickCheck | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask the backend engine, debounced so typing stays smooth.
  useEffect(() => {
    if (!value.trim()) {
      setData(null);
      return;
    }
    setPending(true);
    const t = window.setTimeout(() => {
      api
        .check(value)
        .then((r) => {
          setData(r);
          setError(null);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Check failed"))
        .finally(() => setPending(false));
    }, 200);
    return () => window.clearTimeout(t);
  }, [value]);

  const result = value.trim() ? data?.result ?? null : null;
  const official = value.trim() ? data?.official ?? null : null;

  return (
    <>
      <PageHeader
        title="Quick check"
        description={`Paste a handle, page name, app title or profile URL to see how it compares with ${brand.name}. Runs the same look-alike pipeline as the scanner.`}
      />

      <Card>
        <div className="p-4">
          <label htmlFor="check-input" className="sr-only">
            Name, handle or URL
          </label>
          <div className="relative">
            <ScanSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input
              id="check-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. zentrapay_care_india or instagram.com/zentrapay_care_india"
              className="h-11 pl-9 font-mono text-[14px]"
              autoComplete="off"
              spellCheck={false}
            />
            {pending && (
              <LoaderCircle aria-label="Checking" className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-3" />
            )}
          </div>
          {error && <p className="mt-2 text-[12.5px] text-crit">{error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] text-ink-3">Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setValue(ex)}
                className={clsx(
                  "rounded border px-1.5 py-0.5 font-mono text-[11.5px] transition-colors",
                  value === ex ? "border-ink bg-ink text-inverse" : "border-line bg-surface-2 text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {!result ? (
        <Card className="mt-4">
          {value.trim() && pending ? (
            <EmptyState icon={<LoaderCircle className="animate-spin" />} title="Checking" />
          ) : (
            <EmptyState icon={<ScanSearch />} title="Enter a name to check">
              Results appear as you type.
            </EmptyState>
          )}
        </Card>
      ) : official ? (
        <Card className="mt-4">
          <div className="flex items-start gap-3 px-4 py-4">
            <ShieldCheck className="mt-0.5 size-5 text-ok" />
            <div>
              <p className="text-[14px] font-medium">
                {handleDisplay(official.platform, official.handle)} is an {official.status} account on the allowlist
              </p>
              <p className="mt-1 text-[13px] text-ink-2">
                Allowlisted assets skip detection entirely (Gate 1) and are checked again before any alert is written (Gate 2). It
                will never be flagged.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
          <Card>
            <CardHeader title="Result" />
            <div className="px-4 py-4">
              {(() => {
                const v = VERDICT[result.verdict];
                return (
                  <div className="flex items-center gap-3">
                    <span className={clsx("flex size-9 items-center justify-center rounded-md", v.bg, v.text)}>
                      <v.Icon className="size-[18px]" strokeWidth={2.2} />
                    </span>
                    <div>
                      <div className={clsx("text-[15px] font-semibold", v.text)}>{v.label}</div>
                      <div className="text-[12.5px] text-ink-3">
                        Name similarity <span className="tabular font-mono text-ink">{result.score.toFixed(2)}</span> against{" "}
                        <Mono className="text-ink">{result.alias}</Mono>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <p className="mt-4 text-[13px] leading-relaxed text-ink-2">{result.explanation}</p>

              <dl className="mt-4 space-y-3 border-t border-line pt-4 text-[13px]">
                <div>
                  <dt className="text-[12px] text-ink-3">Method</dt>
                  <dd className="mt-0.5 text-ink">{result.method}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-ink-3">Variations found</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {result.variations.length ? (
                      result.variations.map((v) => <Tag key={v}>{v}</Tag>)
                    ) : (
                      <span className="text-ink-3">None</span>
                    )}
                  </dd>
                </div>
                {result.guards.length > 0 && (
                  <div>
                    <dt className="text-[12px] text-ink-3">Over-flagging guards applied</dt>
                    <dd className="mt-1 space-y-1">
                      {result.guards.map((g) => (
                        <p key={g} className="flex gap-2 text-ink">
                          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                          {g}
                        </p>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Normalisation" description="Each step the name goes through before matching" />
            <ol>
              {result.steps.map((s, i) => (
                <li key={s.label} className="grid grid-cols-[24px_1fr] gap-3 border-b border-line px-4 py-3 last:border-0">
                  <span
                    className={clsx(
                      "tabular mt-0.5 flex size-5 items-center justify-center rounded text-[10.5px] font-medium",
                      s.changed ? "bg-ink text-inverse" : "border border-line text-ink-3",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-[13px] text-ink">{s.label}</span>
                      <span className="text-[12px] text-ink-3">{s.note ?? (s.changed ? "" : "No change")}</span>
                    </div>
                    <div className="mt-1 break-all font-mono text-[12.5px] text-ink-2">{s.output || "—"}</div>
                  </div>
                </li>
              ))}
              <li className="grid grid-cols-[24px_1fr] gap-3 bg-surface-2/50 px-4 py-3">
                <CircleDot className="mt-0.5 size-4 text-ink-3" />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[13px] font-medium text-ink">Core compared</span>
                  <span className="font-mono text-[12.5px] text-ink">
                    {result.core || "—"} <span className="text-ink-3">vs</span> {result.alias}
                  </span>
                </div>
              </li>
            </ol>
          </Card>
        </div>
      )}
    </>
  );
}
