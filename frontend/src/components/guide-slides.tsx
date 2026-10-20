"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  Calculator,
  ChevronLeft,
  ChevronRight,
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
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Card, Orb, Select, StepOrb } from "./ui";

/* ---------- building blocks ---------- */

interface Shot {
  src: string;
  alt: string;
  caption: string;
  tall?: boolean;
}

function Figure({ shot, compact }: { shot: Shot; compact?: boolean }) {
  const path = `/help/${shot.src}.webp`;
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-surface-2/40">
      <a href={path} target="_blank" rel="noreferrer" title="Open full size" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={path}
          alt={shot.alt}
          className={shot.tall ? "max-h-[520px] w-full object-cover object-top" : compact ? "mx-auto max-h-[420px] w-auto" : "w-full"}
        />
      </a>
      <figcaption className="border-t border-line px-3 py-1.5 text-[11.5px] leading-snug text-ink-3">{shot.caption} · Click to enlarge.</figcaption>
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
    <dl className="space-y-2.5 text-[13px]">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="font-medium text-ink">{k}</dt>
          <dd className="leading-relaxed text-ink-2">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="text-[13px] leading-relaxed text-ink-2">{children}</p>;
const Sub = ({ children }: { children: ReactNode }) => <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{children}</h4>;
const Code = ({ children }: { children: ReactNode }) => <code className="font-mono text-[12px]">{children}</code>;

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[480px] text-[12.5px]">
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
  <Link href={href} className="ext-link font-medium">
    {children}
  </Link>
);

/* ---------- the slides ---------- */

interface Slide {
  section: string;
  icon: LucideIcon;
  title: string;
  /** The tab this slide describes, for the "Open" link. */
  href?: string;
  shots?: Shot[];
  /** Phone screenshots: shown side by side at their own width. */
  phone?: boolean;
  body: ReactNode;
}

const SLIDES: Slide[] = [
  {
    section: "Start here",
    icon: BookOpen,
    title: "What IMPOSTR is for, and a five-minute tour",
    body: (
      <>
        <P>
          Fraudsters copy a brand&apos;s name and logo to make fake apps, fake customer-care pages and scam accounts. IMPOSTR finds them. You tell it
          what genuinely belongs to the brand, it searches the app stores and social platforms live, sets aside everything verified as official, and gives every other look-alike a
          risk score from 0 to 100 with the evidence behind it. Two real brands are ready to explore: <b>PhonePe</b> and <b>Paytm</b>.
        </P>
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
              Open <Go href="/check">Quick check</Go>, type <Code>PhonePe</Code> and press Enter: official apps are recognised first, then look-alikes are
              scored.
            </>,
            <>
              Search <Code>Paytm</Code>, a brand that is not registered: IMPOSTR suggests its real publisher and apps, and you can register it in one
              click.
            </>,
            <>
              Open <Go href="/accuracy">Accuracy</Go> to see the engine tested on 82 labelled cases.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    section: "How IMPOSTR works",
    icon: Workflow,
    title: "The same five stages run for a scan and for a Quick check",
    body: (
      <>
        <div className="grid gap-2.5 sm:grid-cols-5">
          {[
            ["Register", "Name, logo, official accounts, apps, publisher and domains"],
            ["Search", "Every source live: stores, Telegram, YouTube, Reddit, and web search for public social pages"],
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
        <P>
          Official verification always comes before scoring. Anything recognised as the brand&apos;s own is reported separately with risk 0, so a real
          account or app can never be flagged as a fake.
        </P>
      </>
    ),
  },
  {
    section: "Setup Brand Profile",
    icon: Settings2,
    title: "Step 1 · Brand identity",
    href: "/setup",
    shots: [{ src: "setup-identity", alt: "Setup Brand Profile, step 1, Brand identity", caption: "Step 1: identity fields, with the score table on the right" }],
    body: (
      <>
        <P>
          Setup Brand Profile has three steps. It opens on the active brand so you can edit it; choose <b>Add a brand</b> in the brand switcher to start a
          new one.
        </P>
        <Points
          items={[
            ["Brand name", "The name to protect, for example PhonePe."],
            ["Other names", "Spellings people use (Zentra, Zentra Pay). Each is matched for look-alikes. Press Enter after each."],
            ["Legal company name", "Optional. Recognised in any spelling: “Pvt. Ltd.”, “Private Limited” and capitals are normalised."],
            ["Official logo", "Compared with every profile picture and app icon, including mirrored and recoloured copies."],
            ["Search keywords", "The words sent to each source when searching."],
            ["Official description", "Paste the text from your app listing. Copied bios and descriptions are caught with it."],
          ]}
        />
      </>
    ),
  },
  {
    section: "Setup Brand Profile",
    icon: Settings2,
    title: "Step 2 · Official assets",
    href: "/setup",
    shots: [{ src: "setup-assets", alt: "Setup Brand Profile, step 2, Official assets", caption: "Step 2: official accounts, apps, publisher and domains" }],
    body: (
      <Points
        items={[
          ["Social accounts", "Pick a platform, type the handle, click Add. A Partner account is allowed but marked as a partner."],
          ["Mobile apps", "Pick Google Play or the App Store and add the package name (com.brand.app) or App Store ID (id123…)."],
          ["Official publisher", "The developer name on the stores. Each app is checked on its store, and its developer account then identifies your other official apps automatically."],
          ["Official domains", "Your websites. Links to look-alikes of them (phonepe-refund.xyz) raise the score."],
        ]}
      />
    ),
  },
  {
    section: "Setup Brand Profile",
    icon: Settings2,
    title: "Step 3 · Review",
    href: "/setup",
    shots: [{ src: "setup-review", alt: "Setup Brand Profile, step 3, Review", caption: "Step 3: summary before saving" }],
    body: (
      <>
        <P>
          Check the counts, then click <b>Save and run scan</b>. Everything you added goes on the allowlist, the scan starts, and you land on Overview.
        </P>
        <P>The table on the right of every step explains the score bands.</P>
      </>
    ),
  },
  {
    section: "Overview",
    icon: LayoutGrid,
    title: "The brand's risk at a glance after each scan",
    href: "/",
    shots: [{ src: "overview", alt: "Overview page with stat cards, chart and sources", caption: "Overview after a scan" }],
    body: (
      <>
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
        <P>
          Click <b>Run scan</b> in the top bar at any time to search all sources again. While it runs the button reads Scanning and the page updates by
          itself when it finishes.
        </P>
      </>
    ),
  },
  {
    section: "Detections",
    icon: Radar,
    title: "Every look-alike found, scored and sortable",
    href: "/detections",
    shots: [{ src: "detections", alt: "Detections list with filters", caption: "The detection list, highest risk first" }],
    body: (
      <>
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
        <P>
          The red number next to Detections in the menu counts open Critical and High items. Every item was found by a live search and links to the
          real account or app.
        </P>
      </>
    ),
  },
  {
    section: "A detection, step by step",
    icon: ListChecks,
    title: "Why an item was flagged",
    shots: [{ src: "detection-detail", alt: "Detection page for a scam account", caption: "A scam account: score, reasons and details" }],
    body: (
      <Points
        items={[
          ["Header", "Name, handle, platform, the kind of threat (Scam account, Look-alike app, Fake brand page, Impersonation)."],
          ["Score", "0 to 100 with its severity and what to do: takedown recommended, review today, or look-alike."],
          ["Why this was flagged", "Every finding in plain words, such as a copied logo, a request for an OTP or a link to a look-alike domain."],
          ["Compared with the official asset", "When there is an official counterpart, both are shown side by side."],
          ["Details, links, activity", "Followers or installs, first and last seen, the links in the profile, and every status change."],
        ]}
      />
    ),
  },
  {
    section: "A detection, step by step",
    icon: ListChecks,
    title: "How its score was built",
    shots: [
      { src: "detection-breakdown", alt: "Score breakdown table", caption: "Score breakdown: signals × weights + boosts" },
      { src: "detection-checks", alt: "Evidence checks", caption: "Evidence checks ran before scoring" },
    ],
    body: (
      <Points
        items={[
          ["Score breakdown", "Each signal's match, weight and points, then any boosts or caps, adding up to the score."],
          ["Evidence checks", "The identity checks that ran first (official handle, ID, publisher), then name, picture and description similarity and suspicious keywords."],
        ]}
      />
    ),
  },
  {
    section: "A detection, step by step",
    icon: ListChecks,
    title: "What to do about it",
    body: (
      <Table
        head={["Button", "What it does"]}
        rows={[
          ["Confirm threat", "Marks it Confirmed. Request takedown then appears."],
          ["Request takedown", "Marks it Takedown requested, to track that the platform was asked to remove it."],
          ["Report on <platform>", "For confirmed live items: copies a ready-made report with the evidence and opens the item so you can paste it into the platform's Report form."],
          ["False positive", "Marks it as not a threat and lowers its score by 15 points. It leaves the Active view."],
          ["It's official", "Adds it to the brand's allowlist. It is never flagged again; Undo removes it."],
          ["Reopen", "Returns any marked item to Open."],
          ["Evidence", "Downloads the full record (signals, reasons, checks, score) as a JSON file."],
        ]}
      />
    ),
  },
  {
    section: "Quick check",
    icon: ScanSearch,
    title: "Search any brand on demand, without a full scan",
    href: "/check",
    shots: [{ src: "check-form", alt: "Quick check search form", caption: "Choose platforms and enter a name, handle or link" }],
    body: (
      <Steps
        items={[
          <>Pick platforms, or leave All platforms selected (19 platforms).</>,
          <>
            Type a brand name (<Code>PhonePe</Code>), a handle (<Code>z3ntra.pay_official</Code>) or paste an official link (
            <Code>t.me/phonepe_rewards</Code>, a Play Store or App Store URL), then press Enter. The Try chips fill in examples.
          </>,
          <>Results compare against the registered brand the query matches. Nothing is saved to Detections.</>,
        ]}
      />
    ),
  },
  {
    section: "Quick check",
    icon: ScanSearch,
    title: "Reading the results",
    href: "/check",
    shots: [{ src: "check-official", alt: "Official assets found in Quick check", caption: "PhonePe's own apps, verified and excluded before scoring" }],
    body: (
      <Points
        items={[
          ["Platform line", "How many results each platform returned and its state: LIVE (searched just now), CACHED (live source down, last good results), NOT CONNECTED (no public API, or its API key is not set) or DOWN."],
          ["Official assets", "Recognised as the brand's own and excluded with risk 0, with how they were recognised. Add to profile puts one on the allowlist."],
          ["Suspicious matches", "Everything else that resembles the brand, highest risk first, with reasons and evidence chips."],
          ["Mentions", "Results scoring 39 or less are listed but not flagged."],
          ["Details or Open", "Details opens a tracked detection. Open (blue, underlined) opens the real account or app on its platform."],
        ]}
      />
    ),
  },
  {
    section: "Quick check",
    icon: ScanSearch,
    title: "Suspicious matches",
    href: "/check",
    shots: [{ src: "check-results", alt: "Suspicious matches for PhonePe", caption: "Suspicious matches, each with its reasons and evidence", tall: true }],
    body: (
      <P>
        Everything that resembles the brand but is not official, highest risk first. Each row shows the score and severity, the platform and kind of
        threat, the reasons in plain words, and evidence chips for name, picture, official ID, publisher and suspicious keywords.
      </P>
    ),
  },
  {
    section: "Quick check",
    icon: ScanSearch,
    title: "Registering a new brand from a search",
    href: "/check",
    shots: [{ src: "check-register", alt: "Suggested official apps for Paytm", caption: "Searching Paytm suggests its real publisher and apps" }],
    body: (
      <P>
        For a brand that is not registered, nothing can be verified as official yet, so every result stays Low. IMPOSTR proposes the live store apps
        from the developer named like the brand with the most installs. Untick any that are wrong and click <b>Register … and verify</b>: the apps are
        checked on their stores and the brand is ready to scan.
      </P>
    ),
  },
  {
    section: "Brand profile",
    icon: Building2,
    title: "The allowlist every check compares against",
    href: "/brand",
    shots: [{ src: "brand", alt: "Brand profile page", caption: "A brand profile" }],
    body: (
      <Points
        items={[
          ["Identity", "Name, aliases, keywords, logo, legal name, description and domains. Edit in Setup changes them."],
          ["Official social accounts", "Every allowlisted account. Add one below the table as Official or Partner; it is skipped from the next scan."],
          ["Official apps", "Each app is validated on its store: title, publisher, developer ID and icon. Validate now re-checks them."],
          ["Found in scans", "Apps verified as official through the developer account but not yet in the profile. Add puts them on the allowlist."],
          ["Official publishers", "Developer names and IDs used to recognise official apps."],
          ["How this profile is used", "Which field feeds which check."],
        ]}
      />
    ),
  },
  {
    section: "Sources",
    icon: PlugZap,
    title: "Where candidates come from, and their health",
    href: "/sources",
    shots: [{ src: "sources", alt: "Sources page", caption: "Live connectors and their health" }],
    body: (
      <>
        <P>
          18 sources in two groups, app stores and social platforms, each live or not connected. Each runs on its own with a 10-second timeout and 2 retries, so one failing source
          never stops a scan.
        </P>
        <Points
          items={[
            ["State", "Live, Cached, Not connected or Down (see Labels and terms)."],
            ["Health", "Operational, degraded or unavailable."],
            ["Last success · Latency · Items", "When it last answered, how fast, and how many items it returned in the last scan."],
            ["Simulate outage", "Makes a source fail on purpose to show resilience: the scan still finishes, and a live source falls back to its last good results. End outage restores it."],
          ]}
        />
      </>
    ),
  },
  {
    section: "Accuracy",
    icon: Target,
    title: "Proof that the engine is right, on labelled cases",
    href: "/accuracy",
    shots: [{ src: "accuracy", alt: "Accuracy page", caption: "82 of 82 correct: no fakes missed, no official asset flagged" }],
    body: (
      <>
        <P>
          82 hand-labelled cases (official assets, fakes, honest mentions such as fan and news pages, and unrelated names) run through the same engine as
          scans and Quick check. Nothing on the page is typed in by hand; <b>Re-run</b> evaluates them again.
        </P>
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
      </>
    ),
  },
  {
    section: "Brands, workspace and app",
    icon: MonitorSmartphone,
    title: "Switching brands, privacy, themes and installing",
    shots: [
      { src: "brand-switcher", alt: "Brand switcher open", caption: "Switch brands or add one" },
      { src: "appearance", alt: "Appearance menu", caption: "Palettes and light or dark mode" },
    ],
    body: (
      <Points
        items={[
          ["Brand switcher", "The box at the top of the menu. Pick a brand to make it active: Overview, Detections and scans follow it. Add a brand opens Setup Brand Profile."],
          ["Private workspace", "Each browser gets its own workspace, starting with the two demo brands. Brands, scans and results added there are not visible to anyone else."],
          ["Top bar", "Last scan time and Run scan, Install app, a shortcut to Quick check, and the light / dark switch."],
          ["Appearance", "At the bottom of the menu: two colour palettes (Crimson and Slate) and System, Light or Dark mode."],
          ["Install app", "Installs IMPOSTR like a phone or desktop app. On iPhone it shows how: Share, then Add to Home Screen."],
        ]}
      />
    ),
  },
  {
    section: "Brands, workspace and app",
    icon: MonitorSmartphone,
    title: "On a phone",
    phone: true,
    shots: [
      { src: "mobile-overview", alt: "Overview on a phone", caption: "Overview on a phone" },
      { src: "mobile-menu", alt: "Menu on a phone", caption: "The menu on a phone" },
    ],
    body: <P>Every page fits a phone. Open the menu with the button at the top left. Installed from the top bar, IMPOSTR opens like any other app.</P>,
  },
  {
    section: "How the score is built",
    icon: Calculator,
    title: "Severity and the six signals",
    body: (
      <>
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
      </>
    ),
  },
  {
    section: "How the score is built",
    icon: Calculator,
    title: "Boosts and caps",
    body: (
      <>
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
      </>
    ),
  },
  {
    section: "How official assets are recognised",
    icon: ShieldCheck,
    title: "Checked before any score, strongest evidence first",
    body: (
      <>
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
        <P>Names alone never prove an app is official, and no brand is hard-coded: the same rules apply to every brand you register.</P>
      </>
    ),
  },
  {
    section: "Labels and terms",
    icon: Gauge,
    title: "Source states and detection status",
    body: (
      <>
        <Sub>Source states</Sub>
        <Table
          head={["State", "Meaning"]}
          rows={[
            ["Live", "Searched just now on the real platform"],
            ["Cached", "The live source was down, so its last good results are used"],
            ["Not connected", "Not searched: its API key is not set, or the platform has not approved API access yet (Reddit)"],
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
      </>
    ),
  },
  {
    section: "Labels and terms",
    icon: Gauge,
    title: "Tags",
    body: (
      <Points
        items={[
          ["Scam account", "Shows strong scam behaviour (0.6 or more)."],
          ["Look-alike app", "An app imitating the brand."],
          ["Fake brand page", "A page, channel or group posing as the brand: Facebook, WhatsApp, Telegram, YouTube, LinkedIn, Pinterest, Discord or Quora."],
          ["Impersonation", "Any other account posing as the brand."],
          ["Low-risk mention", "Scored 39 or less: it mentions the brand but is not flagged."],
        ]}
      />
    ),
  },
  {
    section: "Questions",
    icon: CircleHelp,
    title: "Things people often ask",
    body: (
      <Points
        items={[
          ["Where do social results come from?", "All live. Telegram is read from its public pages, YouTube and Reddit through their official APIs, and Instagram, Facebook, X, LinkedIn, Threads, Pinterest, Quora, Snapchat, ShareChat, WhatsApp, Moj and Josh through a web search for their public pages. Discord invites found that way are checked with Discord's own invite lookup. Only what search engines have indexed can be found, so new or private accounts may not appear."],
          ["Why does a result score exactly 39?", "It hit a cap: either only one signal was strong, or it is openly a fan, news, review or third-party item."],
          ["Can a real official account be flagged?", "Official verification runs first and the accuracy test checks it: 0 of 19 official assets are flagged. If something genuine ever slips through, It's official adds it to the allowlist."],
          ["Does anyone else see my searches?", "No. Each browser has its own private workspace."],
          ["How do I protect a new brand?", "Use Setup Brand Profile, or search it in Quick check and register it from the suggested official apps."],
        ]}
      />
    ),
  },
];

/** First slide of each section, for "Jump to section". */
const SECTIONS = SLIDES.map((s, i) => ({ name: s.section, index: i })).filter((s, i, all) => i === 0 || all[i - 1].name !== s.name);

/* ---------- the slideshow ---------- */

export function GuideSlides() {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const root = useRef<HTMLElement>(null);
  const touchX = useRef<number | null>(null);
  const slide = SLIDES[index];
  const total = SLIDES.length;
  const sectionNo = SECTIONS.filter((s) => s.index <= index).length;
  const inSection = SLIDES.filter((s) => s.section === slide.section);
  const partNo = inSection.indexOf(slide) + 1;

  const go = useCallback(
    (to: number) => {
      const next = Math.max(0, Math.min(total - 1, to));
      if (next === index) return;
      setDir(next > index ? 1 : -1);
      setIndex(next);
      // Keep the top of the slideshow in view when a long slide was scrolled past.
      const top = root.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [index, total],
  );

  // Load the neighbouring slides' screenshots ahead of time, so arrows feel instant.
  useEffect(() => {
    for (const s of [SLIDES[index + 1], SLIDES[index - 1]]) for (const sh of s?.shots ?? []) new Image().src = `/help/${sh.src}.webp`;
  }, [index]);

  const Icon = slide.icon;
  const hasShots = !!slide.shots?.length;

  return (
    <Card
      ref={root}
      tabIndex={0}
      aria-roledescription="slideshow"
      aria-label="How to use IMPOSTR, step by step"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
      }}
      // Same width as the demo video above it, so the two line up.
      className="relative max-w-[1040px] scroll-mt-20 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
    >
      {/* Header: section, title, position */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3.5 py-3 sm:px-5">
        <Orb size="sm">
          <Icon />
        </Orb>
        <div className="min-w-0 flex-1 basis-56">
          <div className="eyebrow text-[11px]">
            {String(sectionNo).padStart(2, "0")} · {slide.section}
            {inSection.length > 1 && <span className="text-ink-3"> · part {partNo} of {inSection.length}</span>}
          </div>
          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{slide.title}</h3>
        </div>
        <div className="flex items-center gap-3">
          {slide.href && (
            <Link href={slide.href} className="ext-link text-[12px] font-medium">
              Open this tab →
            </Link>
          )}
          <span className="tabular rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2" aria-live="polite">
            {index + 1} / {total}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="relative">
        <div
          key={index}
          className="guide-slide-in px-3.5 py-4 sm:px-14 sm:py-5 lg:min-h-[480px]"
          style={{ ["--slide-from" as string]: `${dir * 18}px` }}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${total}: ${slide.title}`}
        >
          {hasShots ? (
            <div className={slide.phone ? "grid items-start gap-5 lg:grid-cols-[auto_minmax(0,1fr)]" : "grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"}>
              <div className={slide.phone ? "grid grid-cols-2 gap-3 lg:w-[440px]" : "space-y-3"}>
                {slide.shots!.map((sh) => (
                  <Figure key={sh.src} shot={sh} compact={slide.phone} />
                ))}
              </div>
              <div className="space-y-4">{slide.body}</div>
            </div>
          ) : (
            <div className="space-y-4">{slide.body}</div>
          )}
        </div>

        {/* Side arrows */}
        <button
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Previous slide"
          className="float-btn absolute left-2 top-1/2 hidden size-9 -translate-y-1/2 disabled:pointer-events-none disabled:opacity-0 sm:inline-flex [&_svg]:size-4"
        >
          <ChevronLeft />
        </button>
        <button
          onClick={() => go(index + 1)}
          disabled={index === total - 1}
          aria-label="Next slide"
          className="float-btn absolute right-2 top-1/2 hidden size-9 -translate-y-1/2 disabled:pointer-events-none disabled:opacity-0 sm:inline-flex [&_svg]:size-4"
        >
          <ChevronRight />
        </button>
      </div>

      {/* Footer: previous / progress and sections / next */}
      <footer className="flex flex-wrap items-center gap-3 border-t border-line px-3.5 py-3 sm:px-5">
        <Button onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide">
          <ArrowLeft />
          <span className="max-sm:sr-only">Previous</span>
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-300" style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>
          <Select
            aria-label="Jump to section"
            value={SECTIONS.filter((s) => s.index <= index).at(-1)!.index}
            onChange={(e) => go(Number(e.target.value))}
            className="w-auto max-w-[52vw] sm:max-w-none"
          >
            {SECTIONS.map((s, i) => (
              <option key={s.index} value={s.index}>
                {String(i + 1).padStart(2, "0")} · {s.name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="primary" onClick={() => go(index + 1)} disabled={index === total - 1} aria-label="Next slide">
          <span className="max-sm:sr-only">Next</span>
          <ArrowRight />
        </Button>
      </footer>
      <p className="sr-only">Use the left and right arrow keys, or swipe, to move between slides.</p>
    </Card>
  );
}
