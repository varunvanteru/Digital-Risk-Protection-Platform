import clsx from "clsx";
import {
  ArrowDown,
  ArrowRight,
  Building2,
  Database,
  Filter,
  Globe,
  MonitorSmartphone,
  Network,
  Radar,
  ScanSearch,
  Server,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardHeader, Orb, StepOrb } from "./ui";

/*
 * Architecture diagram for How to use: data sources, detection logic, storage and how official
 * assets are excluded. Every box describes the running code (src/server); nothing is aspirational.
 */

type Tone = "source" | "profile" | "official" | "detect" | "store" | "ui";

const TONE: Record<Tone, string> = {
  source: "border-line-strong bg-surface",
  profile: "border-line-strong bg-surface",
  official: "border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-ok-bg",
  detect: "border-[color-mix(in_srgb,var(--brand)_40%,transparent)] bg-[color-mix(in_srgb,var(--brand)_6%,var(--surface))]",
  store: "border-line-strong bg-surface-2",
  ui: "border-line-strong bg-surface",
};

function Box({ tone, icon: Icon, title, kicker, children, className }: { tone: Tone; icon: LucideIcon; title: string; kicker?: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-lg border p-3", TONE[tone], className)}>
      <div className="flex items-center gap-2">
        <Orb size="sm" tone={tone === "official" ? "ok" : undefined}>
          <Icon />
        </Orb>
        <div className="min-w-0">
          {kicker && <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">{kicker}</div>}
          <div className="text-[13px] font-semibold leading-tight text-ink">{title}</div>
        </div>
      </div>
      <div className="mt-2.5 space-y-1.5 text-[12px] leading-snug text-ink-2">{children}</div>
    </div>
  );
}

const Li = ({ children }: { children: ReactNode }) => (
  <div className="flex gap-1.5">
    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" />
    <span>{children}</span>
  </div>
);

/** Arrow between boxes: right on wide screens, down when the diagram stacks. */
function Flow({ label, vertical }: { label?: string; vertical?: boolean }) {
  return (
    <div className={clsx("flex items-center justify-center gap-1.5 text-ink-3", vertical ? "flex-row py-1" : "py-1 lg:flex-col lg:px-0.5 lg:py-0")} aria-hidden>
      {vertical ? <ArrowDown className="size-4" /> : (
        <>
          <ArrowRight className="hidden size-4 lg:block" />
          <ArrowDown className="size-4 lg:hidden" />
        </>
      )}
      {label && <span className="text-[10.5px] font-medium uppercase tracking-wide">{label}</span>}
    </div>
  );
}

function Diagram() {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-3 sm:p-4" role="img" aria-label="IMPOSTR architecture: data sources and the brand profile feed collection; official assets are excluded first; the rest are scored; a second allowlist check runs before results are stored and shown.">
      {/* Inputs */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Box tone="source" icon={Globe} kicker="Data sources · 18, all live" title="Where candidates come from">
          <Li>
            <b className="text-ink">Stores:</b> Google Play (google-play-scraper) and the Apple App Store (iTunes Search API)
          </Li>
          <Li>
            <b className="text-ink">Social, official APIs:</b> Telegram (public t.me pages), YouTube Data API, Reddit API
          </Li>
          <Li>
            <b className="text-ink">Social, web search:</b> Instagram, Facebook, X, LinkedIn, Threads, Pinterest, Quora, Snapchat, ShareChat, WhatsApp, Moj and Josh public pages, through the Brave Search API; Discord invites checked with Discord&apos;s invite lookup
          </Li>
          <Li>
            <b className="text-ink">Not connected:</b> a source without its API key, or awaiting the platform&apos;s approval (Reddit). No sample data anywhere.
          </Li>
          <Li>Each source runs on its own: 10-second timeout, 2 retries. A failed live source falls back to its last good results (Cached); otherwise it is marked Down and the scan continues.</Li>
        </Box>
        <Box tone="profile" icon={Building2} kicker="Brand profile" title="What genuinely belongs to the brand">
          <Li>Name, aliases, keywords, official logo, description and domains</Li>
          <Li>Official accounts, apps and publishers: the allowlist</Li>
          <Li>Store validation, refreshed every 24 hours: each official app&apos;s developer ID, store title and icon become a verified identity</Li>
        </Box>
      </div>

      <div className="grid lg:grid-cols-2">
        <Flow vertical label="Keywords · candidates" />
        <Flow vertical label="Allowlist · verified identities → Gates 1 and 2" />
      </div>

      {/* Pipeline */}
      <div className="grid items-stretch gap-0 lg:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1.05fr)_auto_minmax(0,1.35fr)_auto_minmax(0,0.85fr)]">
        <Box tone="ui" icon={ScanSearch} kicker="Step 1" title="Collect">
          <Li>
            <b className="text-ink">Scan:</b> every source, results saved
          </Li>
          <Li>
            <b className="text-ink">Quick check:</b> chosen platforms, results shown and not saved
          </Li>
          <Li>Results normalised to one candidate format; Play details fetched for plausible matches; icons downloaded in parallel</Li>
        </Box>
        <Flow />
        <div className="flex flex-col gap-2">
          <Box tone="official" icon={ShieldCheck} kicker="Step 2 · Gate 1" title="Exclude official assets">
            <Li>L1 app ID or handle on the allowlist</Li>
            <Li>L2 link resolves to an allowlisted ID</Li>
            <Li>L3 verified developer account</Li>
            <Li>L4 publisher name + supporting details, no contradicting ID</Li>
            <Li>L5 same app on the other store</Li>
          </Box>
          <div className="rounded-lg border border-dashed border-[color-mix(in_srgb,var(--ok)_55%,transparent)] px-3 py-2 text-[11.5px] leading-snug text-ink-2">
            <b className="text-ok">Official or likely official:</b> risk 0, never scored, listed as official. A tracked detection that turns out official is retracted.
          </div>
        </div>
        <Flow label="Not official" />
        <Box tone="detect" icon={Radar} kicker="Step 3" title="Detection logic">
          <Li>
            <b className="text-ink">Name:</b> undo look-alike characters, separators and filler words, then edit distance (swaps, missing or doubled letters)
          </Li>
          <Li>
            <b className="text-ink">Logo:</b> perceptual hash, also against the mirrored logo, plus a colour histogram
          </Li>
          <Li>
            <b className="text-ink">Description:</b> word similarity and shared 3-word phrases
          </Li>
          <Li>
            <b className="text-ink">Claims, behaviour, publisher:</b> “official” or “helpline”, OTP or fee requests, lures, new accounts, a non-official developer
          </Li>
          <Li>
            <b className="text-ink">Score 0–100:</b> weighted signals plus fixed boosts; held at 39 with one strong signal or a fan, news or third-party label
          </Li>
        </Box>
        <Flow />
        <Box tone="official" icon={Filter} kicker="Step 4 · Gate 2" title="Re-check, then save">
          <Li>The allowlist is read again from the database, in case the profile changed during the scan</Li>
          <Li>Only then is the detection saved, with its signals, reasons and checks</Li>
        </Box>
      </div>

      <div className="grid lg:grid-cols-2">
        <Flow vertical label="Quick check results shown directly" />
        <Flow vertical label="Saved: detections · scans · source health" />
      </div>

      {/* Outputs: the save arrow above runs from Gate 2 straight down to storage */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Box tone="ui" icon={MonitorSmartphone} kicker="Interface" title="What the analyst sees">
          <Li>Overview, Detections, Quick check, Brand profile, Sources and Accuracy, all read from storage</Li>
          <Li>Actions (confirm, takedown, false positive, it&apos;s official) are written back to the database</Li>
          <Li>Private workspace per browser: brands and results are visible only to the browser that created them</Li>
        </Box>
        <Box tone="store" icon={Database} kicker="Storage · MySQL / MariaDB" title="Nine tables">
          <Li>brands, official_assets, publishers: the profile and allowlist</Li>
          <Li>detections, detection_events: scored threats and every status change</Li>
          <Li>scans, sources, source_cache: scan history, source health, last good live results</Li>
          <Li>media_files: logos and icons</Li>
        </Box>
      </div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[520px] text-[12.5px]">
        <thead className="bg-surface-2/60 text-[11.5px] text-ink-3">
          <tr>
            {head.map((h) => (
              <th key={h} className="h-8 px-3 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "whitespace-nowrap px-3 py-2 font-mono text-[12px] text-ink" : "px-3 py-2 text-ink-2"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const H = ({ children }: { children: ReactNode }) => <h3 className="text-[13px] font-semibold text-ink">{children}</h3>;

export function Architecture() {
  return (
    <Card id="architecture" className="mt-4 max-w-[1040px] scroll-mt-20">
      <CardHeader
        icon={<Network />}
        title="Architecture"
        description="Data sources, detection logic, storage, and how official assets are excluded"
      />
      <div className="space-y-6 px-3.5 py-4 sm:px-5 sm:py-5">
        <Diagram />

        <section className="space-y-3">
          <H>How official assets are excluded</H>
          <ol className="space-y-2.5">
            {[
              ["Define", "The brand profile lists the official accounts, apps and publishers. Store validation turns each official app into a verified developer ID, so the brand's other apps are recognised too."],
              ["Gate 1, before scoring", "Every candidate is checked against the profile first (levels L1 to L5). Anything official or likely official stops there with risk 0 and is reported separately, never as a threat."],
              ["Gate 2, before saving", "Just before a detection is stored, the allowlist is read again from the database, so an asset added during a scan is still skipped."],
              ["Prove it", "Each scan counts official assets that ended up flagged (shown on Overview, always 0), and the Accuracy test checks all 19 official assets in the labelled set."],
            ].map(([t, d], i) => (
              <li key={t} className="flex items-start gap-3">
                <StepOrb n={i + 1} size="sm" />
                <span className="pt-0.5 text-[13px] leading-relaxed text-ink-2">
                  <b className="text-ink">{t}.</b> {d}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-3">
          <H>Storage</H>
          <Table
            head={["Table", "What it holds"]}
            rows={[
              ["brands", "Each brand's profile: name, aliases, keywords, domains, description, logo. A workspace ID keeps every browser's brands private."],
              ["official_assets", "The allowlist: official accounts and apps, with store validation (developer ID, store title, icon, when it was checked)."],
              ["publishers", "Official developer names and IDs used to recognise official apps."],
              ["sources", "The 20 sources with their mode, state, health, latency and items in the last scan."],
              ["source_cache", "The last good results of each live source, used when it is down."],
              ["scans", "Each scan: candidates seen, official assets skipped, official assets flagged, new detections, per-source status."],
              ["detections", "Scored look-alikes: signals, reasons, evidence checks, score, severity and status."],
              ["detection_events", "Every status change: confirmed, takedown requested, false positive, official, reopened."],
              ["media_files", "Brand logos and official app icons saved during store validation."],
            ]}
          />
        </section>

        <section className="space-y-3">
          <H>Runtime and deployment</H>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [Server, "One Node.js app", "Next.js 15 and React 19 for the screens; the detection engine runs in the same app behind /api, images behind /media."],
              [Database, "MariaDB on Hostinger", "Credentials come from environment variables, never from the code. Tables are created on first start."],
              [Network, "GitHub to impostr.live", "Every push to the main branch is built and deployed by Hostinger. The app installs as a PWA."],
            ].map(([Icon, t, d]) => {
              const I = Icon as LucideIcon;
              return (
                <div key={t as string} className="rounded-lg border border-line bg-surface-2/40 p-3">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    <I className="size-4 text-ink-3" />
                    {t as string}
                  </div>
                  <p className="mt-1.5 text-[12px] leading-snug text-ink-2">{d as string}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Card>
  );
}
