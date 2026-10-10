"use client";

import clsx from "clsx";
import { ArrowUpRight, ChevronRight, CircleX, ExternalLink, LayoutGrid, LoaderCircle, Search, SearchX, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ScoreCell } from "@/components/badges";
import { initialsOf } from "@/components/detection-table";
import { BrandMark } from "@/components/marks";
import { PlatformLogo } from "@/components/platform-logo";
import { Button, Card, CardHeader, EmptyState, Mono, PageHeader, Tag } from "@/components/ui";
import { api, mediaUrl } from "@/lib/api";
import { ALL_PLATFORMS, CLASS_LABEL, PLATFORM_GROUPS, PLATFORM_LABEL, handleDisplay } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Platform, SearchResponse } from "@/lib/types";

const PLATFORMS = ALL_PLATFORMS;

const EXAMPLES = [
  "zentrapay",
  "instagram.com/zentrapay",
  "youtube.com/@zentrapay",
  "Zentra Pay",
  "play.google.com/store/apps/details?id=com.zentrapay.app",
  "z3ntra.pay_official",
];

function PlatformPicker({ selected, onChange }: { selected: Platform[] | "all"; onChange: (v: Platform[] | "all") => void }) {
  const all = selected === "all";
  const isOn = (p: Platform) => all || selected.includes(p);

  function toggle(p: Platform) {
    if (all) return onChange([p]);
    const next = selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p];
    onChange(next.length === 0 || next.length === PLATFORMS.length ? "all" : next);
  }

  function toggleGroup(ps: Platform[]) {
    const current = all ? [] : selected;
    const everyOn = !all && ps.every((p) => current.includes(p));
    const next = everyOn ? current.filter((p) => !ps.includes(p)) : Array.from(new Set([...current, ...ps]));
    onChange(next.length === 0 || next.length === PLATFORMS.length ? "all" : next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          aria-pressed={all}
          onClick={() => onChange("all")}
          className={clsx(
            "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[13px] font-medium transition-colors",
            all ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface text-ink-2 hover:text-ink",
          )}
        >
          <LayoutGrid className="size-4" />
          All platforms
        </button>
        <span className="text-[12.5px] text-ink-3">
          {all ? `All ${PLATFORMS.length} platforms selected` : `${selected.length} of ${PLATFORMS.length} selected`}
        </span>
      </div>

      {/* One shared column grid for every group, so chips line up across rows. */}
      <div className="space-y-3">
        {PLATFORM_GROUPS.map((g) => (
          <div key={g.label} role="group" aria-label={g.label}>
            <button onClick={() => toggleGroup(g.platforms)} className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-ink-3 hover:text-ink">
              {g.label}
            </button>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
              {g.platforms.map((p) => {
                const on = !all && isOn(p);
                return (
                  <button
                    key={p}
                    aria-pressed={isOn(p)}
                    onClick={() => toggle(p)}
                    title={PLATFORM_LABEL[p]}
                    className={clsx(
                      "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border px-3 text-left text-[12.5px] font-medium transition-colors",
                      on
                        ? "border-accent bg-accent-soft text-ink"
                        : all
                          ? "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
                          : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink",
                    )}
                  >
                    <PlatformLogo platform={p} size={16} className={clsx("shrink-0", !all && !on && "opacity-45 grayscale")} />
                    <span className="truncate">{PLATFORM_LABEL[p]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function PlatformStatus({ data }: { data: SearchResponse }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-line px-4 py-3">
      {data.platforms.map((p) => {
        const failed = p.sources.filter((s) => !s.ok);
        const error = failed.map((s) => `${s.name}: ${s.error}`).join("\n");
        return (
          <span key={p.platform} className="inline-flex items-center gap-1.5 text-[12.5px]" title={error || undefined}>
            <PlatformLogo platform={p.platform} size={14} className={p.ok ? "text-ink-2" : "text-ink-3"} />
            <span className="text-ink-2">{PLATFORM_LABEL[p.platform]}</span>
            {p.ok ? (
              <>
                <span className="tabular font-medium text-ink">{p.found}</span>
                {failed.length > 0 && <span className="text-high">· live search unavailable</span>}
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-crit">
                <CircleX className="size-3.5" />
                Unavailable
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function NameAnalysis({ data }: { data: SearchResponse }) {
  const a = data.nameAnalysis;
  return (
    <details className="group mt-4 rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-ink-3 transition-transform group-open:rotate-90" />
        How the name &ldquo;{data.searchedFor}&rdquo; was read
        <span className="ml-auto text-[12px] font-normal text-ink-3">{a.method}</span>
      </summary>
      <ol className="border-t border-line">
        {a.steps.map((s, i) => (
          <li key={s.label} className="grid grid-cols-[24px_1fr] gap-3 border-b border-line px-4 py-2.5 last:border-0">
            <span
              className={clsx(
                "tabular mt-0.5 flex size-5 items-center justify-center rounded text-[10.5px] font-medium",
                s.changed ? "bg-accent text-accent-ink" : "border border-line text-ink-3",
              )}
            >
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-[13px] text-ink">{s.label}</span>
              <span className="break-all font-mono text-[12.5px] text-ink-2">{s.output || "—"}</span>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Results({ data }: { data: SearchResponse }) {
  const n = data.results.length;
  const flagged = data.results.filter((r) => r.breakdown.severity !== "low").length;
  return (
    <>
      <Card className="mt-4">
        <CardHeader
          title={
            n ? (
              <>
                {flagged} suspicious {flagged === 1 ? "match" : "matches"} for &ldquo;{data.searchedFor}&rdquo;
                {n > flagged && <span className="font-normal text-ink-3"> · {n - flagged} low risk</span>}
              </>
            ) : (
              <>No look-alikes for &ldquo;{data.searchedFor}&rdquo;</>
            )
          }
          description={
            data.reference.type === "brand"
              ? `Compared with your registered brand ${data.reference.name}: its logo, description and allowlist`
              : `Compared with the name you entered. Register it as a brand to also compare logos and descriptions.`
          }
        />
        <PlatformStatus data={data} />
        {n === 0 ? (
          <EmptyState icon={<SearchX />} title="Nothing suspicious found">
            No account or app on the selected platforms resembles &ldquo;{data.searchedFor}&rdquo;.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead className="border-b border-line bg-surface-2/50">
                <tr className="text-left text-[12px] text-ink-3">
                  <th className="h-9 w-[150px] px-4 font-medium">Score</th>
                  <th className="h-9 px-4 font-medium">Account or app</th>
                  <th className="h-9 w-[140px] px-4 font-medium">Platform</th>
                  <th className="h-9 px-4 font-medium">Why it looks fake</th>
                  <th className="h-9 w-[110px] px-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={`${r.platform}:${r.handle}`} className={clsx("border-b border-line align-top last:border-0", r.breakdown.severity === "low" && "opacity-70")}>
                    <td className="px-4 py-3">
                      <ScoreCell score={r.breakdown.score} severity={r.breakdown.severity} />
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <BrandMark variant={r.mark} size={30} initials={initialsOf(r.displayName)} src={mediaUrl(r.iconUrl)} />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-ink">{r.displayName}</div>
                          <div className="truncate font-mono text-[11.5px] text-ink-3">{handleDisplay(r.platform, r.handle)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
                        <PlatformLogo platform={r.platform} size={14} />
                        {PLATFORM_LABEL[r.platform]}
                      </span>
                      <div className="mt-1">
                        <Tag>{CLASS_LABEL[r.cls]}</Tag>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ul className="space-y-0.5 text-[12.5px] leading-snug text-ink-2">
                        {r.reasons.slice(0, 3).map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                        {r.reasons.length > 3 && <li className="text-ink-3">+{r.reasons.length - 3} more</li>}
                      </ul>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.detectionId ? (
                        <Link href={`/detections/${r.detectionId}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink hover:underline">
                          Details
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      ) : (
                        <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink hover:underline">
                          Open
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.officialSkipped.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-surface-2/40 px-4 py-2.5 text-[12.5px] text-ink-2">
            <ShieldCheck className="size-3.5 text-ok" />
            <span>
              {data.officialSkipped.length} official {data.officialSkipped.length === 1 ? "account" : "accounts and apps"} on your allowlist skipped:
            </span>
            {data.officialSkipped.map((o) => (
              <Mono key={`${o.platform}:${o.handle}`} className="text-ink">
                {handleDisplay(o.platform, o.handle)}
              </Mono>
            ))}
          </div>
        )}
      </Card>
      <NameAnalysis data={data} />
    </>
  );
}

export default function QuickCheckPage() {
  const { brand } = useStore();
  const [platforms, setPlatforms] = useState<Platform[] | "all">("all");
  const [value, setValue] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = platforms === "all" ? PLATFORMS.length : platforms.length;

  // Shareable searches: /check?q=zentrapay&platforms=instagram,x
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const ps = (params.get("platforms") ?? "").split(",").filter((x): x is Platform => PLATFORMS.includes(x as Platform));
    const sel = ps.length ? ps : "all";
    if (ps.length) setPlatforms(ps);
    if (q) run(q, sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(query = value, sel: Platform[] | "all" = platforms) {
    const q = query.trim();
    if (q.length < 2) return setError("Enter at least 2 characters");
    setValue(q);
    setPending(true);
    setError(null);
    try {
      setData(await api.search(q, sel === "all" ? ["all"] : sel));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Quick check"
        description="Find fake accounts and apps that imitate a brand. Pick the platforms, then enter a brand name or paste an official profile or app link."
      />

      <Card>
        <div className="space-y-4 p-4">
          <PlatformPicker selected={platforms} onChange={setPlatforms} />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
            className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row"
          >
            <label htmlFor="check-input" className="sr-only">
              Brand name or profile URL
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <input
                id="check-input"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                placeholder={`e.g. ${brand.name} or instagram.com/${brand.name.toLowerCase()}`}
                className="h-11 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 font-mono text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Button type="submit" variant="primary" className="h-11 px-5" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : <Search />}
              {pending ? "Searching" : `Search ${count === PLATFORMS.length ? "all" : count} platform${count === 1 ? "" : "s"}`}
            </Button>
          </form>
          {error && <p className="text-[12.5px] text-crit">{error}</p>}

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] text-ink-3">Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => run(ex)}
                disabled={pending}
                className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {pending ? (
        <Card className="mt-4">
          <EmptyState icon={<LoaderCircle className="animate-spin" />} title={`Searching ${count} platform${count === 1 ? "" : "s"}`}>
            Live stores can take a few seconds. Each source has a 10-second limit.
          </EmptyState>
        </Card>
      ) : data ? (
        <Results data={data} />
      ) : (
        <Card className="mt-4">
          <EmptyState icon={<Search />} title="Search for look-alikes">
            Results show every account and app that resembles the name, ranked by risk, with the reasons.
          </EmptyState>
        </Card>
      )}
    </>
  );
}
