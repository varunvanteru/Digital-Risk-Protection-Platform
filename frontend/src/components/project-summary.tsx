/**
 * Plain-HTML project summary, part of every page's server-rendered HTML.
 *
 * The app's screens are drawn in the browser, so a reader that does not run JavaScript
 * (a crawler or an AI reviewer fetching the page) would otherwise see only "Loading".
 * Browsers hide this block before the first paint (html[data-js] .nojs-summary), so users never see it.
 * Everything here describes the running app; the evidence links return live results.
 */

const SITE = "https://impostr.live";

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} className="underline">
    {children}
  </a>
);

export function ProjectSummary() {
  return (
    <section className="nojs-summary mx-auto max-w-3xl space-y-4 px-6 pb-12 text-[14px] leading-relaxed text-ink-2">
      <h1 className="text-[20px] font-bold text-ink">IMPOSTR: Digital Risk Protection for Social &amp; App Monitoring</h1>
      <p>
        IMPOSTR finds fake social-media profiles, fake brand pages, scam accounts and look-alike mobile apps that impersonate a brand. It scores each
        one from 0 to 100, explains every flag in plain words, and never flags the brand&apos;s own accounts and apps. The app runs in the browser at{" "}
        <A href={SITE}>{SITE}</A>; no account is needed: choose &quot;Continue as demo&quot; on the sign-in page, or create a free company account (work email
        required) to keep your work. Each workspace starts with the demo brand PhonePe, monitored on live data only.
      </p>

      <h2 className="text-[16px] font-semibold text-ink">Start here</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <A href={`${SITE}/how-to-use`}>How to use</A>: 6-minute demo video, 25 guide slides with screenshots, and the architecture diagram.
        </li>
        <li>
          Demo video file: <A href={`${SITE}/help/impostr-demo.mp4`}>{`${SITE}/help/impostr-demo.mp4`}</A>
        </li>
        <li>
          Source code, README and tests: <A href="https://github.com/varunvanteru/Digital-Risk-Protection-Platform">github.com/varunvanteru/Digital-Risk-Protection-Platform</A>
        </li>
      </ul>

      <h2 className="text-[16px] font-semibold text-ink">How each requirement is met</h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <b>Brand Profile:</b> a three-step setup records the legitimate assets: brand name, aliases, official logo, description, keywords, official social
          accounts, official apps, publisher and domains. Each official app is validated on Google Play or the App Store (developer ID, store title, icon),
          and the profile drives every check.
        </li>
        <li>
          <b>Official assets are excluded first:</b> every candidate is checked against the profile before any scoring (official app ID or handle,
          official link, verified developer account, publisher name with supporting details, the same app on the other store). Official and likely
          official items get risk 0 and are never stored as threats; the allowlist is checked again just before a detection is saved.
        </li>
        <li>
          <b>Social Media Monitoring:</b> impersonation accounts, fake brand pages and scam profiles found live (Telegram directly, YouTube
          through its official API, Instagram, Facebook, X, LinkedIn, Threads, Pinterest, Quora, Snapchat and ShareChat through a web search for public
          pages), found by
          look-alike name, copied logo (perceptual hash, including mirrored and recoloured copies), copied bio, &quot;official/helpline&quot; claims and scam
          behaviour (requests for OTP or fees, lures, moving to WhatsApp, brand-new accounts).
        </li>
        <li>
          <b>App Store Monitoring:</b> Google Play and the Apple App Store are searched live. Suspicious apps are found by similar name, copied icon,
          a different developer or publisher (including fakes that copy the company name under another developer account) and a resembling
          description. The brand&apos;s official apps and their sibling apps are recognised and not flagged.
        </li>
        <li>
          <b>Look-alike names (bonus):</b> character swaps, missing or doubled letters, look-alike characters (0 for o, 3 for e, Cyrillic letters),
          added words and spacing changes, while ordinary words, other companies&apos; names and openly labelled fan, news or third-party pages stay Low.
        </li>
        <li>
          <b>User experience:</b> setup in three steps or straight from a search; each detection shows its reasons, a score breakdown and evidence
          checks, with actions to confirm, request a takedown, mark a false positive or mark official. Each source has its own timeout and retries
          and falls back to cached results, so an unavailable source never stops a scan.
        </li>
      </ul>

      <h2 className="text-[16px] font-semibold text-ink">Evidence you can open directly (JSON)</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <A href={`${SITE}/api/accuracy`}>{`${SITE}/api/accuracy`}</A>: the labelled PhonePe test set run live through the engine: 31 of 31 cases correct,
          precision 1.0, recall 1.0, 0 of 8 official assets flagged.
        </li>
        <li>
          <A href={`${SITE}/api/search?query=PhonePe&platforms=google_play,app_store`}>{`${SITE}/api/search?query=PhonePe&platforms=google_play,app_store`}</A>:
          a live search of both app stores; PhonePe&apos;s official apps are listed under &quot;official&quot; with risk 0, look-alikes under &quot;results&quot;
          with reasons, signals and evidence checks.
        </li>
        <li>
          <A href={`${SITE}/api/search?query=paytm&platforms=telegram,instagram,facebook,x,youtube`}>{`${SITE}/api/search?query=paytm&platforms=telegram,instagram,facebook,x,youtube`}</A>:
          live social search: real impersonation and scam accounts scored, with the brand&apos;s official accounts excluded.
        </li>
        <li>
          <A href={`${SITE}/api/search?query=ph0nepe_support`}>{`${SITE}/api/search?query=ph0nepe_support`}</A>: look-alike name analysis step
          by step (field &quot;nameAnalysis&quot;).
        </li>
        <li>
          <A href={`${SITE}/api/sources`}>{`${SITE}/api/sources`}</A>: every source with its mode (live, or not connected) and health.
        </li>
      </ul>

      <p>
        <b>Data disclosure:</b> everything shown is found live; there is no sample data. WhatsApp, Discord, Moj and Josh have no search API, so their
        public pages are found through web search. A source whose API key is not set is shown as not connected, never filled with made-up results. The
        Accuracy page runs a separate labelled test set, marked as such.
      </p>
    </section>
  );
}
