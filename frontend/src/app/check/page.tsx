"use client";

import clsx from "clsx";
import { ArrowUpRight, Check, ChevronRight, ExternalLink, LayoutGrid, LoaderCircle, Plus, Search, SearchX, ShieldCheck, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ScoreCell } from "@/components/badges";
import { initialsOf, SampleTag } from "@/components/detection-table";
import { EvidenceStrip, VerdictChip } from "@/components/evidence";
import { BrandMark } from "@/components/marks";
import { PlatformLogo } from "@/components/platform-logo";
import { Button, Card, CardHeader, EmptyState, PageHeader, Tag, Orb } from "@/components/ui";
import { api, mediaUrl } from "@/lib/api";
import { ALL_PLATFORMS, CLASS_LABEL, PLATFORM_GROUPS, PLATFORM_LABEL, handleDisplay } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Platform, SearchResponse, SourceState } from "@/lib/types";

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

      {/*
        One shared column grid for every group, so chips line up across rows:
        2 columns on phones, 4 on tablets and laptops, 8 on wide screens. Groups of
        up to 4 platforms span 4 columns (subgrid), so two of them sit side by side
        at 8 columns; the 8 social platforms fill whole rows at every size.
      */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-4 2xl:grid-cols-8">
        {PLATFORM_GROUPS.map((g) => (
          <div
            key={g.label}
            role="group"
            aria-label={g.label}
            className={clsx("grid grid-cols-subgrid content-start gap-y-2", g.platforms.length <= 4 ? "col-span-full 2xl:col-span-4" : "col-span-full")}
          >
            <button
              onClick={() => toggleGroup(g.platforms)}
              className="col-span-full justify-self-start text-[11.5px] font-medium uppercase tracking-wide text-ink-3 hover:text-ink"
            >
              {g.label}
            </button>
            <div className="contents">
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
const STATE_STYLE: Record<SourceState, string> = {
  live: "text-ok",
  cached: "text-high",
  simulated: "text-ink-3",
  down: "text-crit",
};

function PlatformStatus({ data }: { data: SearchResponse }) {
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {data.platforms.map((p) => {
          const states = Array.from(new Set(p.sources.map((s) => s.state)));
          const tip = p.sources.map((s) => `${s.name}: ${s.state.toUpperCase()}${s.error ? ` (${s.error})` : ""}`).join("\n");
          return (
            <span key={p.platform} className="inline-flex items-center gap-1.5 text-[12.5px]" title={tip}>
              <PlatformLogo platform={p.platform} size={14} className={p.ok ? undefined : "opacity-40 grayscale"} />
              <span className="text-ink-2">{PLATFORM_LABEL[p.platform]}</span>
              <span className="tabular font-medium text-ink">{p.found}</span>
              {p.official > 0 && (
                <span className="inline-flex items-center gap-0.5 text-ok">
                  <ShieldCheck className="size-3" />
                  {p.official}
                </span>
              )}
              <span className="text-[10.5px] font-semibold uppercase tracking-wide">
                {states.map((st, i) => (
                  <span key={st} className={STATE_STYLE[st]}>
                    {i > 0 && <span className="text-ink-3"> + </span>}
                    {st}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3">
        <span className="font-semibold text-ok">LIVE</span> searched just now ·{" "}
        <span className="font-semibold text-high">CACHED</span> live source down, last good results ·{" "}
        <span className="font-semibold">SIMULATED</span> curated sample data, no open API ·{" "}
        <span className="font-semibold text-crit">DOWN</span> unavailable. <ShieldCheck className="inline size-3 text-ok" /> = official assets
        excluded.
      </p>
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

const LEVEL_LABEL: Record<number, string> = {
  1: "Matched by official ID",
  2: "Matched by official URL",
  3: "Verified developer account",
  4: "Publisher + supporting metadata",
  5: "Same app on another store",
};

function OfficialAssets({ data }: { data: SearchResponse }) {
  const { refresh } = useStore();
  const [added, setAdded] = useState<Record<string, "busy" | "done" | string>>({});
  if (data.official.length === 0) return null;

  async function addToProfile(o: SearchResponse["official"][number]) {
    const key = `${o.platform}:${o.handle}`;
    setAdded((s) => ({ ...s, [key]: "busy" }));
    try {
      await api.addApp({ platform: o.platform, packageId: o.handle, name: o.displayName, publisher: o.publisher ?? undefined, publisherId: o.publisherId ?? undefined });
      await refresh();
      setAdded((s) => ({ ...s, [key]: "done" }));
    } catch (e) {
      setAdded((s) => ({ ...s, [key]: e instanceof Error ? e.message : "Could not add" }));
    }
  }

  return (
    <Card className="mt-4 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <Orb size="sm" tone="ok">
            <ShieldCheck />
          </Orb>
          <div>
          <h2 className="card-title flex items-center gap-2 text-[13.5px] font-semibold text-ink">
            {data.official.length} official {data.official.length === 1 ? "asset" : "assets"} · excluded before risk scoring
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Recognised as {data.reference.name}&apos;s own before risk scoring. <b>Verified official</b>: official ID, link or verified developer account. <b>Likely official (unverified)</b>: publisher name or the same app on the other store; not scored but listed for review. Add it to the profile to confirm it.
          </p>
          </div>
        </div>
      </header>
      <ul>
        {data.official.map((o) => {
          const key = `${o.platform}:${o.handle}`;
          const state = added[key];
          return (
            <li key={key} className="grid gap-3 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_auto] sm:items-start">
              <div className="flex min-w-0 items-center gap-3">
                <BrandMark variant="official" size={30} initials={initialsOf(o.displayName)} src={mediaUrl(o.iconUrl)} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-ink">{o.displayName}</div>
                  <div className="flex items-center gap-1.5 truncate text-[11.5px] text-ink-3">
                    <PlatformLogo platform={o.platform} size={12} />
                    <span className="font-mono">{handleDisplay(o.platform, o.handle)}</span>
                  </div>
                </div>
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <VerdictChip verdict={o.status} />
                  <span className="text-[12px] text-ink-2">{LEVEL_LABEL[o.level]}</span>
                  <span className="tabular text-[12px] text-ink-3">· Risk 0</span>
                </div>
                <ul className="space-y-0.5 text-[12.5px] leading-snug text-ink-2">
                  {o.evidence.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                {o.inProfile ? (
                  <span className="text-[12px] text-ink-3">In brand profile</span>
                ) : o.channel === "app" && (o.platform === "google_play" || o.platform === "app_store") && data.reference.type === "brand" ? (
                  state === "done" ? (
                    <span className="inline-flex items-center gap-1 text-[12px] text-ok">
                      <Check className="size-3.5" /> Added
                    </span>
                  ) : (
                    <Button size="sm" onClick={() => addToProfile(o)} disabled={state === "busy"} title={state && state !== "busy" ? state : undefined}>
                      {state === "busy" ? <LoaderCircle className="animate-spin" /> : <Plus />}
                      Add to profile
                    </Button>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SuggestedOfficialCard({ data, onRegistered }: { data: SearchResponse; onRegistered: () => void }) {
  const s = data.suggestedOfficial!;
  const { refresh } = useStore();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(s.apps.map((a) => `${a.platform}:${a.packageId}`)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function register() {
    setBusy(true);
    setError(null);
    try {
      const apps = s.apps.filter((a) => picked.has(`${a.platform}:${a.packageId}`));
      await api.registerFromSearch({
        name: s.brandName,
        publishers: Array.from(new Set(s.publishers.map((p) => p.name))),
        apps: apps.map((a) => ({ platform: a.platform, packageId: a.packageId, name: a.name })),
        description: s.description,
      });
      await refresh();
      onRegistered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register the brand");
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface-2/60 px-4 py-3">
        <div className="max-w-3xl">
          <h2 className="text-[13.5px] font-semibold text-ink">
            Probably {s.brandName}&apos;s own apps · not verified yet
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            {s.brandName} is not a registered brand, so nothing can be verified as official yet. These live store apps come from the developer named like
            the brand with the most installs ({s.publishers.map((p) => p.name).join(", ")}). Confirm them to register {s.brandName}: each app is then
            checked on its store, and its developer account is used to recognise every other official app.
          </p>
        </div>
        <Button variant="primary" onClick={register} disabled={busy || picked.size === 0}>
          {busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
          Register {s.brandName} and verify
        </Button>
      </header>
      {error && <p className="border-b border-line bg-crit-bg px-4 py-2 text-[12.5px] text-crit">{error}</p>}
      <ul className="grid sm:grid-cols-2 xl:grid-cols-3 [&>li]:border-b [&>li]:border-r [&>li]:border-line">
        {s.apps.map((a) => {
          const key = `${a.platform}:${a.packageId}`;
          const on = picked.has(key);
          return (
            <li key={key}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setPicked((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                  className="size-4 accent-[var(--accent)]"
                />
                <BrandMark variant="official" size={28} initials={initialsOf(a.name)} src={mediaUrl(a.iconUrl)} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{a.name}</span>
                  <span className="flex items-center gap-1.5 truncate text-[11.5px] text-ink-3">
                    <PlatformLogo platform={a.platform} size={11} />
                    <span className="truncate font-mono">{a.packageId}</span>
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Results({ data, onRerun }: { data: SearchResponse; onRerun: () => void }) {
  const suggested = new Set((data.suggestedOfficial?.apps ?? []).map((a) => `${a.platform}:${a.packageId}`));
  const shown = data.results.filter((r) => !suggested.has(`${r.platform}:${r.handle}`));
  const n = shown.length;
  const flagged = shown.filter((r) => r.status === "SUSPICIOUS" || r.status === "LOOKALIKE").length;
  const socialSimulatedEmpty = data.platforms.filter((p) => p.sources.every((s) => s.state === "simulated") && p.found === 0 && p.official === 0).length;
  return (
    <>
      <OfficialAssets data={data} />
      {data.suggestedOfficial && <SuggestedOfficialCard data={data} onRegistered={onRerun} />}
      <Card className="mt-4">
        <CardHeader
          icon={<ScanSearch />}
          title={
            n ? (
              <>
                {data.reference.type !== "brand" && <span className="text-high">Verification incomplete · </span>}
                {flagged} suspicious {flagged === 1 ? "match" : "matches"} for &ldquo;{data.searchedFor}&rdquo;
                {n > flagged && <span className="font-normal text-ink-3"> · {n - flagged} mention{n - flagged === 1 ? "" : "s"}, not flagged</span>}
              </>
            ) : data.reference.type !== "brand" ? (
              <>Verification incomplete for &ldquo;{data.searchedFor}&rdquo;</>
            ) : (
              <>No look-alikes for &ldquo;{data.searchedFor}&rdquo;</>
            )
          }
          description={
            data.reference.type === "brand"
              ? `Compared with the registered brand ${data.reference.name}: official IDs, developer accounts, logo, description and allowlist`
              : `${data.searchedFor} is not a registered brand: results are compared with the name only, and publisher, logo and domain checks are skipped. Register the brand to assess these results.`
          }
        />
        <PlatformStatus data={data} />
        {socialSimulatedEmpty > 0 && (
          <p className="border-b border-line bg-surface-2/40 px-4 py-2 text-[12px] text-ink-2">
            {socialSimulatedEmpty} platform{socialSimulatedEmpty === 1 ? "" : "s"} returned nothing: they run on simulated sample data, which only contains
            the demo brands (ZentraPay, PhonePe). Live results come from Google Play and the App Store.
          </p>
        )}
        {n === 0 ? (
          data.reference.type !== "brand" ? (
            <EmptyState icon={<SearchX />} title="Verification incomplete">
              Nothing on the selected platforms closely resembles &ldquo;{data.searchedFor}&rdquo;, but it is not a registered brand, so this is not a full check. Register the brand to assess these results.
            </EmptyState>
          ) : (
            <EmptyState icon={<SearchX />} title="Nothing suspicious found">
              No account or app on the selected platforms resembles &ldquo;{data.searchedFor}&rdquo;.
            </EmptyState>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse">
              <thead className="border-b border-line bg-surface-2/50">
                <tr className="text-left text-[12px] text-ink-3">
                  <th className="h-9 w-[150px] px-4 font-medium">Risk</th>
                  <th className="h-9 px-4 font-medium">Account or app</th>
                  <th className="h-9 w-[140px] px-4 font-medium">Platform</th>
                  <th className="h-9 px-4 font-medium">Evidence</th>
                  <th className="h-9 w-[110px] px-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.platform}:${r.handle}`} className={clsx("border-b border-line align-top last:border-0", r.status === "MENTION" && "opacity-75")}>
                    <td className="px-4 py-3">
                      <ScoreCell score={r.breakdown.score} severity={r.breakdown.severity} />
                      <div className="mt-1.5">
                        <VerdictChip verdict={r.status} />
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <BrandMark variant={r.mark} size={30} initials={initialsOf(r.displayName)} src={mediaUrl(r.iconUrl)} />
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-ink">{r.displayName}</span>
                            {r.sample && <SampleTag />}
                          </div>
                          <div className="truncate font-mono text-[11.5px] text-ink-3">{handleDisplay(r.platform, r.handle)}</div>
                          {r.publisher && <div className="truncate text-[11.5px] text-ink-3">by {r.publisher}</div>}
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
                      <div className="mt-2 border-t border-line pt-1.5">
                        <EvidenceStrip checks={r.checks} app={r.channel === "app"} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.detectionId ? (
                        <Link href={`/detections/${r.detectionId}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink hover:underline">
                          Details
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      ) : r.sample ? (
                        // Sample accounts are curated examples; their URLs do not exist on the platform.
                        <span
                          title="Sample data: a curated example for this demo. It has no real page on the platform."
                          className="text-[11.5px] text-ink-3"
                        >
                          No live page
                        </span>
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
        eyebrow="Search any brand"
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
        <Results data={data} onRerun={() => run(data.query)} />
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
