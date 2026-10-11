import {
  BookOpen,
  Building2,
  Calculator,
  CircleHelp,
  Gauge,
  LayoutGrid,
  ListChecks,
  MonitorSmartphone,
  PlugZap,
  Radar,
  ScanSearch,
  Settings2,
  ShieldCheck,
  Target,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardHeader, Orb, PageHeader, StepOrb } from "@/components/ui";

export const metadata: Metadata = { title: "How to use · BrandShield" };

/* ---------- small building blocks ---------- */

function Shot({ src, alt, caption, tall }: { src: string; alt: string; caption: ReactNode; tall?: boolean }) {
  const path = `/help/${src}.webp`;
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-surface-2/40">
      <a href={path} target="_blank" rel="noreferrer" title="Open full size" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={path}
          alt={alt}
          loading="lazy"
          className={tall ? "max-h-[640px] w-full object-cover object-top" : "w-full"}
        />
      </a>
      <figcaption className="border-t border-line px-3 py-2 text-[12px] leading-snug text-ink-3">{caption} · Click to enlarge.</figcaption>
    </figure>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3">
          <StepOrb n={i + 1} size="sm" />
          <span className="pt-1 text-[13px] leading-relaxed text-ink-2">{it}</span>
        </li>
      ))}
    </ol>
  );
}

function Points({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-5 gap-y-2.5 text-[13px] sm:grid-cols-[minmax(130px,max-content)_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium text-ink">{k}</dt>
          <dd className="leading-relaxed text-ink-2">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{children}</h3>;
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
                <td key={j} className={j === 0 ? "px-3 py-2 font-medium text-ink" : "px-3 py-2 text-ink-2"}>
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

const Go = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
    {children}
  </Link>
);

function Section({
  id,
  icon: Icon,
  title,
  lead,
  href,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  lead: ReactNode;
  href?: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader
        icon={<Icon />}
        title={title}
        description={lead}
        actions={
          href && (
            <Link href={href} className="text-[12px] font-medium text-ink-2 hover:text-ink hover:underline">
              Open {title} →
            </Link>
          )
        }
      />
      <div className="space-y-5 px-4 py-4 sm:px-5">{children}</div>
    </Card>
  );
}

/* ---------- table of contents ---------- */

const TOC: { id: string; label: string }[] = [
  { id: "start", label: "Start here" },
  { id: "flow", label: "How BrandShield works" },
  { id: "setup", label: "Setup wizard" },
  { id: "overview", label: "Overview" },
  { id: "detections", label: "Detections" },
  { id: "detail", label: "A detection, step by step" },
  { id: "check", label: "Quick check" },
  { id: "brand", label: "Brand profile" },
  { id: "sources", label: "Sources" },
  { id: "accuracy", label: "Accuracy" },
  { id: "workspace", label: "Brands, workspace and app" },
  { id: "scoring", label: "How the score is built" },
  { id: "official", label: "How official assets are recognised" },
  { id: "terms", label: "Labels and terms" },
  { id: "faq", label: "Questions" },
];

/* ---------- page ---------- */

export default function HowToUsePage() {
  return (
    <>
      <PageHeader
        eyebrow="Guide"
        title="How to use"
        description="Every tab and feature of BrandShield, with screenshots of the real app. Read it top to bottom once, or jump to a tab from the contents."
      />

      {/* Contents: chips on phones, sticky list on wide screens */}
      <nav aria-label="Contents" className="mb-4 flex flex-wrap gap-1.5 xl:hidden">
        {TOC.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11.5px] text-ink-2 hover:text-ink">
            {t.label}
          </a>
        ))}
      </nav>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-4">
          {/* ---------------- start ---------------- */}
          <Section id="start" icon={BookOpen} title="Start here" lead="What BrandShield is for, and a five-minute tour">
            <p className="text-[13px] leading-relaxed text-ink-2">
              Fraudsters copy a brand&apos;s name and logo to make fake apps, fake customer-care pages and scam accounts. BrandShield finds them. You tell
              it what genuinely belongs to the brand, it searches 20 sources, sets aside everything verified as official, and gives every other
              look-alike a risk score from 0 to 100 with the evidence behind it. Two demo brands are ready to explore: <b>ZentraPay</b>, a fictional
              payments app, and <b>PhonePe</b>.
            </p>
            <Sub>Five-minute tour</Sub>
            <Steps
              items={[
                <>
                  Open <Go href="/">Overview</Go>. The first scan of your workspace runs by itself and takes a few seconds.
                </>,
                <>
                  Open <Go href="/detections">Detections</Go> and click the top row to see why an account was flagged and how its score was built.
                </>,
                <>
                  Open <Go href="/check">Quick check</Go>, type <code className="font-mono text-[12px]">PhonePe</code> and press Enter: official apps are
                  recognised first, then look-alikes are scored.
                </>,
                <>
                  Search <code className="font-mono text-[12px]">Paytm</code>, a brand that is not registered: BrandShield suggests its real publisher and
                  apps, and you can register it in one click.
                </>,
                <>
                  Open <Go href="/accuracy">Accuracy</Go> to see the engine tested on 82 labelled cases.
                </>,
              ]}
            />
          </Section>

          {/* ---------------- flow ---------------- */}
          <Section id="flow" icon={Workflow} title="How BrandShield works" lead="The same five stages run for a scan and for a Quick check">
            <div className="grid gap-2.5 sm:grid-cols-5">
              {[
                ["Register", "Name, logo, official accounts, apps, publisher and domains"],
                ["Search", "Google Play and App Store live; social and APK sites from sample data"],
                ["Verify official", "Your own assets are recognised first and never scored"],
                ["Score", "Six signals, weighted, plus fixed boosts and caps: 0 to 100"],
                ["Act", "Confirm, request takedown, mark false positive or official"],
              ].map(([t, d], i) => (
                <div key={t} className="rounded-md border border-line bg-surface-2/40 p-3">
                  <StepOrb n={i + 1} size="sm" />
                  <div className="mt-2 text-[13px] font-semibold text-ink">{t}</div>
                  <div className="mt-0.5 text-[12px] leading-snug text-ink-3">{d}</div>
                </div>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-ink-2">
              Official verification always comes before scoring. Anything recognised as the brand&apos;s own is reported separately with risk 0, so a
              real account or app can never be flagged as a fake.
            </p>
          </Section>

          {/* ---------------- setup ---------------- */}
          <Section id="setup" icon={Settings2} title="Setup wizard" href="/setup" lead="Register a brand: tell BrandShield what is genuinely yours">
            <p className="text-[13px] leading-relaxed text-ink-2">
              The wizard has three steps. It opens on the active brand so you can edit it; choose <b>Add a brand</b> in the brand switcher to start a
              new one. The table on the right of every step explains the score bands.
            </p>
            <Sub>Step 1 · Brand identity</Sub>
            <Points
              items={[
                ["Brand name", "The name to protect, for example ZentraPay."],
                ["Other names", "Spellings people use (Zentra, Zentra Pay). Each is matched for look-alikes. Press Enter after each."],
                ["Legal company name", "Optional. Recognised in any spelling: “Pvt. Ltd.”, “Private Limited” and capitals are normalised."],
                ["Official logo", "Compared with every profile picture and app icon, including mirrored and recoloured copies."],
                ["Search keywords", "The words sent to each source when searching."],
                ["Official description", "Paste the text from your app listing. Copied bios and descriptions are caught with it."],
              ]}
            />
            <Shot src="setup-identity" alt="Setup wizard, step 1, Brand identity" caption="Step 1: identity fields, with the score table on the right" />
            <Sub>Step 2 · Official assets</Sub>
            <Points
              items={[
                ["Social accounts", "Pick a platform, type the handle, click Add. A Partner account is allowed but marked as a partner."],
                ["Mobile apps", "Pick Google Play or the App Store and add the package name (com.brand.app) or App Store ID (id123…)."],
                ["Official publisher", "The developer name on the stores. Each app is checked on its store, and its developer account then identifies your other official apps automatically."],
                ["Official domains", "Your websites. Links to look-alikes of them (zentrapay-refund.xyz) raise the score."],
              ]}
            />
            <Shot src="setup-assets" alt="Setup wizard, step 2, Official assets" caption="Step 2: official accounts, apps, publisher and domains" />
            <Sub>Step 3 · Review</Sub>
            <p className="text-[13px] leading-relaxed text-ink-2">
              Check the counts, then click <b>Save and run scan</b>. Everything you added goes on the allowlist, the scan starts, and you land on
              Overview.
            </p>
            <Shot src="setup-review" alt="Setup wizard, step 3, Review" caption="Step 3: summary before saving" />
          </Section>

          {/* ---------------- overview ---------------- */}
          <Section id="overview" icon={LayoutGrid} title="Overview" href="/" lead="The brand's risk at a glance after each scan">
            <Points
              items={[
                ["Open detections", "Medium, High and Critical items still open, and how many candidates the last scan looked at."],
                ["Critical · High", "Items scoring 80 or more (takedown recommended) and 60 to 79 (review today). The arrow on a card opens the detection list."],
                ["Official assets flagged", "Should always be 0. It counts official assets that were wrongly scored; the allowlist size is shown below it."],
                ["New detections", "Medium and above by the day they were first seen, over 14 days. Red is Critical, orange High, amber Medium. Hover a bar for its counts."],
                ["By source", "The 8 sources with the most Critical and flagged items, with a health tick. A failing source always appears here."],
                ["Needs attention", "Open Critical and High detections, highest score first. Click one to review it."],
                ["Official app notice", "If a scan finds an app verified as yours that is not in the profile yet, a notice offers Review and add."],
              ]}
            />
            <Shot src="overview" alt="Overview page with stat cards, chart and sources" caption="Overview for ZentraPay after a scan" />
            <p className="text-[13px] leading-relaxed text-ink-2">
              Click <b>Run scan</b> in the top bar at any time to search all sources again. While it runs the button reads Scanning and the page updates
              by itself when it finishes.
            </p>
          </Section>

          {/* ---------------- detections ---------------- */}
          <Section id="detections" icon={Radar} title="Detections" href="/detections" lead="Every look-alike found, scored and sortable">
            <Points
              items={[
                ["Search", "Filter by name, handle or publisher."],
                ["All · Social · Apps", "Accounts and pages, apps, or both. The counts follow the severity filter."],
                ["Platform", "One platform at a time, for example Instagram or Google Play."],
                ["Status", "Active hides items marked false positive or official. You can show one status, such as Confirmed."],
                ["Severity chips", "Critical, High and Medium are on by default. Low-risk mentions (39 and below) are hidden; click Low to show them."],
                ["Sort", "Click the Risk or First seen column heading to sort. Click a row to open it."],
              ]}
            />
            <Shot src="detections" alt="Detections list with filters" caption="The detection list, highest risk first" />
            <p className="text-[13px] leading-relaxed text-ink-2">
              The red number next to Detections in the menu counts open Critical and High items. A <b>SAMPLE</b> tag marks items from the curated sample
              data rather than a live search.
            </p>
          </Section>

          {/* ---------------- detail ---------------- */}
          <Section id="detail" icon={ListChecks} title="A detection, step by step" lead="Why an item was flagged, and what to do about it">
            <Shot src="detection-detail" alt="Detection page for ZentraPay Care" caption="A Critical scam account: score, reasons and details" />
            <Points
              items={[
                ["Header", "Name, handle, platform, the kind of threat (Scam account, Look-alike app, Fake brand page, Impersonation) and SAMPLE when it is sample data."],
                ["Score", "0 to 100 with its severity and what to do: takedown recommended, review today, or look-alike."],
                ["Why this was flagged", "Every finding in plain words, such as a copied logo, a request for an OTP or a link to a look-alike domain."],
                ["Score breakdown", "Each signal's match, weight and points, then any boosts or caps, adding up to the score."],
                ["Evidence checks", "The identity checks that ran first (official handle, ID, publisher), then name, picture and description similarity and suspicious keywords."],
                ["Compared with the official asset", "When there is an official counterpart, both are shown side by side."],
                ["Details, links, activity", "Followers or installs, first and last seen, the links in the profile, and every status change."],
              ]}
            />
            <div className="grid gap-3 lg:grid-cols-2">
              <Shot src="detection-breakdown" alt="Score breakdown table" caption="Score breakdown: signals × weights + boosts" />
              <Shot src="detection-checks" alt="Evidence checks" caption="Evidence checks ran before scoring" />
            </div>
            <Sub>Actions</Sub>
            <Table
              head={["Button", "What it does"]}
              rows={[
                ["Confirm threat", "Marks it Confirmed. Request takedown then appears."],
                ["Request takedown", "Marks it Takedown requested, to track that the platform was asked to remove it."],
                ["Report on <platform>", "For confirmed live items: copies a ready-made report with the evidence and opens the item so you can paste it into the platform's Report form. Not shown for sample data, which has no real page."],
                ["False positive", "Marks it as not a threat and lowers its score by 15 points. It leaves the Active view."],
                ["It's official", "Adds it to the brand's allowlist. It is never flagged again; Undo removes it."],
                ["Reopen", "Returns any marked item to Open."],
                ["Evidence", "Downloads the full record (signals, reasons, checks, score) as a JSON file."],
              ]}
            />
          </Section>

          {/* ---------------- check ---------------- */}
          <Section id="check" icon={ScanSearch} title="Quick check" href="/check" lead="Search any brand on demand, without a full scan">
            <Steps
              items={[
                <>Pick platforms, or leave All platforms selected (19 platforms).</>,
                <>
                  Type a brand name (<code className="font-mono text-[12px]">PhonePe</code>), a handle (
                  <code className="font-mono text-[12px]">z3ntra.pay_official</code>) or paste an official link (
                  <code className="font-mono text-[12px]">instagram.com/zentrapay</code>, a Play Store or App Store URL), then press Enter. The Try chips fill in
                  examples.
                </>,
                <>Results compare against the registered brand the query matches. Nothing is saved to Detections.</>,
              ]}
            />
            <Shot src="check-form" alt="Quick check search form" caption="Choose platforms and enter a name, handle or link" />
            <Sub>Reading the results</Sub>
            <Points
              items={[
                ["Platform line", "How many results each platform returned and its state: LIVE (searched just now), CACHED (live source down, last good results), SIMULATED (sample data) or DOWN."],
                ["Official assets", "Recognised as the brand's own and excluded with risk 0, with how they were recognised. Add to profile puts one on the allowlist."],
                ["Suspicious matches", "Everything else that resembles the brand, highest risk first, with reasons and evidence chips."],
                ["Mentions", "Results scoring 39 or less are listed but not flagged."],
                ["Details or No live page", "Details opens a tracked detection. Live store results open their store page. Sample results say No live page because they do not exist on the platform."],
              ]}
            />
            <Shot src="check-official" alt="Official assets found in Quick check" caption="PhonePe's own apps, verified and excluded before scoring" />
            <Shot src="check-results" alt="Suspicious matches for PhonePe" caption="Suspicious matches, each with its reasons and evidence" tall />
            <Sub>Registering a new brand from a search</Sub>
            <p className="text-[13px] leading-relaxed text-ink-2">
              For a brand that is not registered, nothing can be verified as official yet, so every result stays Low. BrandShield proposes the live store
              apps from the developer named like the brand with the most installs. Untick any that are wrong and click <b>Register … and verify</b>: the
              apps are checked on their stores and the brand is ready to scan.
            </p>
            <Shot src="check-register" alt="Suggested official apps for Paytm" caption="Searching Paytm suggests its real publisher and apps" />
          </Section>

          {/* ---------------- brand ---------------- */}
          <Section id="brand" icon={Building2} title="Brand profile" href="/brand" lead="The allowlist every check compares against">
            <Points
              items={[
                ["Identity", "Name, aliases, keywords, logo, legal name, description and domains. Edit in wizard changes them."],
                ["Official social accounts", "Every allowlisted account. Add one below the table as Official or Partner; it is skipped from the next scan."],
                ["Official apps", "Each app is validated on its store: title, publisher, developer ID and icon. Validate now re-checks them."],
                ["Found in scans", "Apps verified as official through the developer account but not yet in the profile. Add puts them on the allowlist."],
                ["Official publishers", "Developer names and IDs used to recognise official apps."],
                ["How this profile is used", "Which field feeds which check."],
              ]}
            />
            <Shot src="brand" alt="Brand profile page" caption="ZentraPay's brand profile" />
          </Section>

          {/* ---------------- sources ---------------- */}
          <Section id="sources" icon={PlugZap} title="Sources" href="/sources" lead="Where candidates come from, and their health">
            <p className="text-[13px] leading-relaxed text-ink-2">
              20 sources in two groups, app stores and social platforms. Each runs on its own with a 10-second timeout and 2 retries, so one failing source
              never stops a scan.
            </p>
            <Points
              items={[
                ["State", "Live, Cached, Simulated or Down (see Labels and terms)."],
                ["Health", "Operational, degraded or unavailable."],
                ["Last success · Latency · Items", "When it last answered, how fast, and how many items it returned in the last scan."],
                ["Simulate outage", "Makes a source fail on purpose to show resilience: the scan still finishes, and a live source falls back to its last good results. End outage restores it."],
              ]}
            />
            <Shot src="sources" alt="Sources page" caption="Live store connectors and sample-data sources" />
          </Section>

          {/* ---------------- accuracy ---------------- */}
          <Section id="accuracy" icon={Target} title="Accuracy" href="/accuracy" lead="Proof that the engine is right, on labelled cases">
            <p className="text-[13px] leading-relaxed text-ink-2">
              82 hand-labelled cases (official assets, fakes, honest mentions such as fan and news pages, and unrelated names) run through the same engine
              as scans and Quick check. Nothing on the page is typed in by hand; <b>Re-run</b> evaluates them again.
            </p>
            <Points
              items={[
                ["Official assets flagged", "Official assets wrongly scored as threats. The target is 0."],
                ["Precision", "Of everything flagged, the share that really was fake."],
                ["Recall", "Of all fakes, the share that was flagged."],
                ["F1", "One number combining precision and recall; 1.000 is perfect."],
                ["Confusion matrix", "Fakes flagged and missed, and genuine items flagged and correctly left alone. Flagged means not official and score 40 or more."],
                ["Labelled cases", "Every case with its label, outcome and first reason. Filter by label, or show Errors only."],
              ]}
            />
            <Shot src="accuracy" alt="Accuracy page" caption="82 of 82 correct: no fakes missed, no official asset flagged" />
          </Section>

          {/* ---------------- workspace ---------------- */}
          <Section id="workspace" icon={MonitorSmartphone} title="Brands, workspace and app" lead="Switching brands, privacy, themes and installing">
            <Points
              items={[
                ["Brand switcher", "The box at the top of the menu. Pick a brand to make it active: Overview, Detections and scans follow it. Add a brand opens the wizard."],
                ["Private workspace", "Each browser gets its own workspace, starting with the two demo brands. Brands, scans and results added there are not visible to anyone else."],
                ["Top bar", "Last scan time and Run scan, Install app, a shortcut to Quick check, and the light / dark switch."],
                ["Appearance", "At the bottom of the menu: five colour palettes (Crimson, Graphite, Slate, Forest, Sandstone) and System, Light or Dark mode."],
                ["Install app", "Installs BrandShield like a phone or desktop app. On iPhone it shows how: Share, then Add to Home Screen."],
                ["Phones", "Every page fits a phone. Open the menu with the button at the top left."],
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Shot src="brand-switcher" alt="Brand switcher open" caption="Switch brands or add one" />
              <Shot src="appearance" alt="Appearance menu" caption="Palettes and light or dark mode" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <Shot src="mobile-overview" alt="Overview on a phone" caption="Overview on a phone" />
              <Shot src="mobile-menu" alt="Menu on a phone" caption="The menu on a phone" />
            </div>
          </Section>

          {/* ---------------- scoring ---------------- */}
          <Section id="scoring" icon={Calculator} title="How the score is built" lead="Six signals, fixed weights, then boosts and caps">
            <Sub>Severity</Sub>
            <Table
              head={["Score", "Severity", "Meaning"]}
              rows={[
                ["80–100", "Critical", "Flagged; takedown recommended"],
                ["60–79", "High", "Flagged; review today"],
                ["40–59", "Medium", "Flagged as a look-alike"],
                ["0–39", "Low", "Not flagged; shown only as a mention"],
              ]}
            />
            <Sub>Signals (each 0 to 1) and their weights</Sub>
            <Table
              head={["Signal", "What it measures", "Accounts", "Apps"]}
              rows={[
                ["Name", "Look-alike of the brand name: swapped or doubled letters, 0 for o, Cyrillic letters, added words like support or india", "0.30", "0.25"],
                ["Logo / icon", "Pixel similarity to the official logo, including mirrored and recoloured copies", "0.25", "0.25"],
                ["Bio / description", "Text copied from the official description", "0.10", "0.15"],
                ["Claims", "Says it is official, support or a helpline while not on the allowlist", "0.15", "0.10"],
                ["Behaviour", "Scam signs: asks for OTP or PIN, upfront fees, lures like cashback, moves you to WhatsApp, a new account. For apps: new, few installs, risky category", "0.20", "0.05"],
                ["Publisher", "App published by a developer that is not official", "—", "0.20"],
              ]}
            />
            <Sub>Boosts</Sub>
            <Table
              head={["Rule", "Points"]}
              rows={[
                ["Strong name or logo match while claiming to be official (accounts), or from a different publisher (apps)", "+15"],
                ["Accounts: uses the brand name to run a scam (strong name and strong scam behaviour)", "+10"],
                ["Accounts: brand look-alike name with moderate scam behaviour", "+10"],
                ["Links to a look-alike of an official domain", "+10"],
                ["Marked as a false positive by an analyst", "−15"],
              ]}
            />
            <Sub>Caps</Sub>
            <Points
              items={[
                ["One strong signal", "If only one signal is above 0.5, the score is held at 39 (Low). A name match alone is not proof of impersonation. A look-alike domain counts as a strong signal; a publisher mismatch alone does not."],
                ["Openly labelled", "Accounts that say they are a fan page, news or review account, and apps titled “… for <brand>” (third-party tools), are held at 39."],
              ]}
            />
          </Section>

          {/* ---------------- official ---------------- */}
          <Section id="official" icon={ShieldCheck} title="How official assets are recognised" lead="Checked before any score, strongest evidence first">
            <Table
              head={["Level", "Evidence", "Result"]}
              rows={[
                ["L1", "The exact app ID or handle is on the allowlist", "Official"],
                ["L2", "The store or profile link resolves to an allowlisted ID", "Official"],
                ["L3", "Published by a verified official developer account (store developer ID)", "Official"],
                ["L4", "Official publisher name plus supporting details, with no known developer ID contradicting it. On the App Store, where Apple verifies the seller, the same company name counts", "Likely official"],
                ["L5", "The same app on the other store under the company's legal name: same title as a verified official app, same icon, established audience", "Likely official"],
              ]}
            />
            <p className="text-[13px] leading-relaxed text-ink-2">
              Names alone never prove an app is official, and no brand is hard-coded: the same rules apply to every brand you register.
            </p>
          </Section>

          {/* ---------------- terms ---------------- */}
          <Section id="terms" icon={Gauge} title="Labels and terms" lead="What each tag and status means">
            <Sub>Source states</Sub>
            <Table
              head={["State", "Meaning"]}
              rows={[
                ["Live", "Searched just now: Google Play and the App Store"],
                ["Cached", "The live source was down, so its last good results are used"],
                ["Simulated", "Curated sample data, for platforms with no open search API: social, messaging, video and APK sites"],
                ["Down", "Unavailable for this scan"],
              ]}
            />
            <Sub>Detection status</Sub>
            <Table
              head={["Status", "Meaning"]}
              rows={[
                ["Open", "New, waiting for review"],
                ["Confirmed", "An analyst agreed it is a threat"],
                ["Takedown requested", "The platform was asked to remove it"],
                ["False positive", "Not a threat; score lowered by 15 and hidden from the Active view"],
                ["Marked official", "Genuinely the brand's own; moved to the allowlist"],
              ]}
            />
            <Sub>Tags</Sub>
            <Points
              items={[
                ["SAMPLE", "From the curated sample data, not a live search. Its link does not exist, so it shows No live page."],
                ["Scam account", "Shows strong scam behaviour (0.6 or more)."],
                ["Look-alike app", "An app imitating the brand."],
                ["Fake brand page", "A page, channel or group posing as the brand: Facebook, WhatsApp, Telegram, YouTube, LinkedIn, Pinterest, Discord or Quora."],
                ["Impersonation", "Any other account posing as the brand."],
                ["Low-risk mention", "Scored 39 or less: it mentions the brand but is not flagged."],
              ]}
            />
          </Section>

          {/* ---------------- faq ---------------- */}
          <Section id="faq" icon={CircleHelp} title="Questions" lead="Things people often ask">
            <Points
              items={[
                ["Why are social results sample data?", "Instagram, Facebook, WhatsApp and the other social platforms do not offer an open search API. Those results come from a curated sample set and are tagged SAMPLE everywhere. Google Play and the App Store are searched live."],
                ["Why does a result score exactly 39?", "It hit a cap: either only one signal was strong, or it is openly a fan, news, review or third-party item."],
                ["Can a real official account be flagged?", "Official verification runs first and the accuracy test checks it: 0 of 19 official assets are flagged. If something genuine ever slips through, It's official adds it to the allowlist."],
                ["Does anyone else see my searches?", "No. Each browser has its own private workspace."],
                ["How do I protect a new brand?", "Use the Setup wizard, or search it in Quick check and register it from the suggested official apps."],
              ]}
            />
          </Section>
        </div>

        {/* sticky contents for wide screens */}
        <aside className="sticky top-16 hidden xl:block">
          <Card>
            <CardHeader icon={<BookOpen />} title="Contents" />
            <ol className="space-y-0.5 px-2 py-2">
              {TOC.map((t, i) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="flex items-center gap-2 rounded px-2 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                    <span className="tabular w-5 text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                    {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="mt-3 flex items-center gap-3 px-4 py-3 text-[12px] text-ink-2">
            <Orb size="sm" tone="ok">
              <ShieldCheck />
            </Orb>
            Screenshots are from the real app with the demo brands.
          </Card>
        </aside>
      </div>
    </>
  );
}
