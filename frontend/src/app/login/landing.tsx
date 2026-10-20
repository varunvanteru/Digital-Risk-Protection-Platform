"use client";

import { useEffect, useState } from "react";
import { account, ApiError } from "@/lib/api";

/** Where to go after signing in: the page that sent the visitor here, if it is one of ours. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}

// Common impersonation tricks, and what IMPOSTR actually checks for each.
const TRICKS = [
  {
    badge: "Social media",
    tone: "critical",
    title: "Fake customer-care accounts",
    summary: "A profile named like “PhonePe Customer Care” or “ZentraPay Help” that asks people to call a number or message on WhatsApp.",
    checks: "Name, “official / helpline” claims, phone numbers",
    example: "@zentrapay.support.help: “Official ZentraPay helpline. Payment stuck? WhatsApp +91 98xxxxxx12 for instant refund.”",
    signs: ["Calls itself official or a helpline, but is not on the brand’s list", "Moves the chat to WhatsApp, Telegram or a phone number", "Asks for an OTP, UPI PIN or screen sharing"],
    impostr: "Compares the name with the brand and its aliases, looks for official or helpline claims, and flags requests for OTPs, PINs, fees or moving off the platform. A brand-new account adds to the score.",
  },
  {
    badge: "App stores",
    tone: "critical",
    title: "Look-alike apps",
    summary: "An app with the brand’s name and a copied icon, published by a different developer on Google Play or the App Store.",
    checks: "Developer, icon match, name, description",
    example: "“ZentraPay – UPI & Wallet” by a developer called “Zentra Apps Studio”, a few weeks old, with under 1,000 installs.",
    signs: ["Developer is not the brand’s own developer account", "Icon is a copy, sometimes mirrored or recoloured", "New app with very few installs"],
    impostr: "Searches both stores live, checks the developer against the brand’s registered publisher, and compares icons by image matching (it also catches mirrored and recoloured copies).",
  },
  {
    badge: "Name tricks",
    tone: "warning",
    title: "Disguised names",
    summary: "Names that look right at a glance: a zero for an O, a 3 for an E, a Cyrillic letter, an extra dot or a doubled letter.",
    checks: "Look-alike characters, typos, spacing",
    example: "z3ntra.pay_official, Ph0nePe, phonnepe, zentra_pay.india",
    signs: ["Numbers or foreign letters in place of normal letters", "Extra dots, dashes or underscores", "One letter missing, swapped or doubled"],
    impostr: "Undoes look-alike characters and spacing first, then measures how close the name is to the brand. Ordinary words and other companies’ names are not treated as look-alikes.",
  },
  {
    badge: "Pages",
    tone: "warning",
    title: "Copied brand pages",
    summary: "A page that copies the brand’s logo and description word for word to look like the real one.",
    checks: "Logo match, copied text",
    example: "A Facebook page with the official logo and the brand’s own “About” text, but a different handle and no history.",
    signs: ["Same logo and description as the official page", "Different handle, recently created", "Few followers for a “brand” page"],
    impostr: "Compares the profile picture with the official logo and the bio with the brand’s description. Fan, news and review pages that say so openly stay Low.",
  },
  {
    badge: "Links",
    tone: "info",
    title: "Fake offers and refund links",
    summary: "Cashback, giveaway or “refund” posts that link to a website made to look like the brand’s own domain.",
    checks: "Look-alike domains, lure wording",
    example: "“Claim ₹500 ZentraPay cashback today only” linking to zentrapay-rewards.in instead of zentrapay.com.",
    signs: ["Urgency: “today only”, “account blocked”", "A web address that is close to, but not, the official one", "Asks for a fee to receive money"],
    impostr: "Checks every link against the brand’s official domains to catch look-alike ones, and scores lure, urgency and upfront-fee wording.",
  },
] as const;

const FEATURES = [
  {
    title: "Never flags your own accounts",
    icon: "🛡️",
    desc: "The official accounts, apps and developer IDs in your Brand Profile are excluded before anything is scored, so your real presence gets risk 0.",
  },
  {
    title: "A score from 0 to 100, with reasons",
    icon: "📊",
    desc: "Name, logo, copied text, official claims and scam behaviour each add to the score, and every flag says why in plain words. One strong signal on its own stays Low.",
  },
  {
    title: "Catches disguised names and copied logos",
    icon: "🔍",
    desc: "Look-alike letters, typos and spacing tricks are undone before comparing names, and logos and app icons are compared as images.",
  },
  {
    title: "Live app-store search",
    icon: "📱",
    desc: "Google Play, the App Store, Telegram, YouTube and Reddit are searched live, and public profiles on Instagram, Facebook, X and more are found through web search. No sample data.",
  },
];

const FAQ = [
  {
    q: "What does IMPOSTR do?",
    a: "It finds fake social-media profiles, fake brand pages, scam accounts and look-alike apps that pretend to be a brand. You describe the brand and its official accounts and apps once; IMPOSTR then searches for impostors, scores each one from 0 to 100 and explains why it was flagged.",
  },
  {
    q: "Do I need an account?",
    a: "No. “Continue as demo” opens a private workspace in this browser with two real brands to explore, PhonePe and Paytm. Create a free account to keep your work and open it from any browser; anything you did in the demo is kept.",
  },
  {
    q: "Where do the results come from?",
    a: "Every result is real and found live. Google Play, the Apple App Store and Telegram are searched directly, YouTube and Reddit through their official APIs, and Instagram, Facebook, X, LinkedIn, Threads, Pinterest, Quora, Snapchat, ShareChat, WhatsApp, Discord, Moj and Josh through a web search for their public pages.",
  },
  {
    q: "Will it flag the brand’s real accounts?",
    a: "Not if they are in the Brand Profile. Official handles, app IDs, links and developer accounts are checked first and excluded. Apps confirmed on the store are shown as “Verified official”; ones that only match the developer name are shown as “Likely official” so you can confirm them.",
  },
  {
    q: "What do you store about me?",
    a: "Your name, your email and a salted hash of your password (never the password itself), plus the brands, scans and decisions in your workspace. Sign-in uses a secure, HTTP-only cookie that lasts 30 days on this browser.",
  },
  {
    q: "Someone was already cheated by a fake account. What should they do?",
    a: "In India, call the National Cybercrime Helpline 1930 or report at cybercrime.gov.in, and report the fake account to the platform. IMPOSTR finds and documents fakes; it does not file reports for you.",
  },
];

type Modal = { kind: "signin" } | { kind: "signup"; email: string } | { kind: "welcome"; name: string } | { kind: "trick"; index: number } | null;

function Chevron() {
  return (
    <svg className="lp-chevron" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden>
      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
    </svg>
  );
}

function Field(props: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string; autoFocus?: boolean; minLength?: number }) {
  return (
    <div className="lp-field lp-modal-field">
      <input
        id={props.id}
        className="lp-input"
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        autoFocus={props.autoFocus}
        minLength={props.minLength}
        required
        placeholder=" "
      />
      <label htmlFor={props.id} className="lp-float">
        {props.label}
      </label>
    </div>
  );
}

function EmailCta({ id, onSubmit }: { id: string; onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <form
      className="lp-cta"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email.trim());
      }}
    >
      <div className="lp-field">
        <input id={id} className="lp-input" type="email" required autoComplete="email" placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor={id} className="lp-float">
          Email address
        </label>
      </div>
      <button type="submit" className="lp-btn-red lp-btn-big">
        Get Started
        <Chevron />
      </button>
    </form>
  );
}

function SignInForm({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await account.signIn({ email, password });
      window.location.assign(nextPath());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="lp-modal-title" id="lp-modal-title">
        Sign In
      </h2>
      <form onSubmit={submit} noValidate={false}>
        <Field id="si-email" label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
        <Field id="si-pass" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && (
          <p className="lp-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="lp-btn-red lp-btn-block" disabled={busy}>
          {busy ? "Signing in…" : "Sign In"}
        </button>
        <p className="lp-modal-hint">You stay signed in on this browser for 30 days.</p>
      </form>
      <div className="lp-modal-foot">
        <p>
          New to IMPOSTR?{" "}
          <button type="button" className="lp-link" onClick={onSwitch}>
            Create an account &rarr;
          </button>
        </p>
      </div>
    </>
  );
}

function SignUpForm({ email: initialEmail, onSwitch, onDone }: { email: string; onSwitch: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await account.signUp({ name, email, password });
      onDone(res.user.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="lp-modal-title" id="lp-modal-title">
        Create your account
      </h2>
      <form onSubmit={submit}>
        <Field id="su-name" label="Your name" value={name} onChange={setName} autoComplete="name" autoFocus />
        <Field id="su-email" label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field id="su-pass" label="Password (at least 8 characters)" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
        {error && (
          <p className="lp-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="lp-btn-red lp-btn-block" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="lp-modal-hint">Free. Your password is stored only as a salted hash.</p>
      </form>
      <div className="lp-modal-foot">
        <p>
          Already have an account?{" "}
          <button type="button" className="lp-link" onClick={onSwitch}>
            Sign in &rarr;
          </button>
        </p>
      </div>
    </>
  );
}

function Welcome({ name }: { name: string }) {
  return (
    <div className="lp-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/landing/logo-badge.webp" alt="" className="lp-welcome-shield" width={83} height={90} />
      <h2 className="lp-modal-title" id="lp-modal-title">
        Welcome, {name.split(" ")[0]}
      </h2>
      <p className="lp-modal-desc">Your account is ready.</p>
      <ul className="lp-steps">
        <li>
          <span aria-hidden>✓</span> Account created
        </li>
        <li>
          <span aria-hidden>✓</span> Private workspace saved to your account
        </li>
        <li>
          <span aria-hidden>✓</span> Two real brands to explore: PhonePe and Paytm
        </li>
        <li className="lp-step-next">
          <span aria-hidden>→</span> Next: add your own brand in Setup Brand Profile
        </li>
      </ul>
      <button type="button" className="lp-btn-red lp-btn-block" onClick={() => window.location.assign(nextPath())}>
        Open IMPOSTR
      </button>
    </div>
  );
}

function TrickDetail({ index }: { index: number }) {
  const t = TRICKS[index];
  return (
    <>
      <span className={`lp-badge lp-${t.tone}`}>{t.badge}</span>
      <h2 className="lp-modal-title" id="lp-modal-title">
        {t.title}
      </h2>
      <p className="lp-modal-desc">{t.summary}</p>
      <h3 className="lp-detail-h">Example</h3>
      <p className="lp-detail-example">{t.example}</p>
      <h3 className="lp-detail-h">Warning signs</h3>
      <ul className="lp-detail-list">
        {t.signs.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <h3 className="lp-detail-h">What IMPOSTR checks</h3>
      <p className="lp-modal-desc">{t.impostr}</p>
      <p className="lp-modal-hint">The example is illustrative; ZentraPay is a fictional demo brand.</p>
    </>
  );
}

export function Landing({ className }: { className?: string }) {
  const [modal, setModal] = useState<Modal>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && modal.kind !== "welcome" && setModal(null);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [modal]);

  async function continueAsDemo() {
    setDemoBusy(true);
    try {
      await account.demo();
      window.location.assign(nextPath());
    } catch {
      setDemoBusy(false);
    }
  }

  const signUp = (email = "") => setModal({ kind: "signup", email });

  return (
    <div className={`lp ${className ?? ""}`}>
      <header className="lp-hero">
        <div className="lp-hero-bg" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/hero-collage.webp"
            srcSet="/landing/hero-collage-800.webp 800w, /landing/hero-collage.webp 1600w"
            sizes="100vw"
            alt=""
            className="lp-hero-img"
            fetchPriority="high"
          />
          <div className="lp-hero-shade" />
        </div>

        <nav className="lp-nav">
          <a href="#top" className="lp-brand" aria-label="IMPOSTR">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/logo-badge.webp" alt="IMPOSTR" className="lp-brand-img" width={57} height={62} />
          </a>
          <button type="button" className="lp-btn-red lp-btn-small" onClick={() => setModal({ kind: "signin" })}>
            Sign In
          </button>
        </nav>

        <div className="lp-hero-content" id="top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/wordmark.webp" alt="IMPOSTR" className="lp-wordmark" width={420} height={69} />
          <h1 className="lp-title">
            Find the fakes pretending
            <br />
            to be your brand
          </h1>
          <p className="lp-subheading">Fake profiles, fake brand pages, scam accounts and look-alike apps, each scored 0 to 100 with the evidence.</p>
          <p className="lp-subtext">Enter your email to create a free account, or look around first in a demo workspace.</p>
          <EmailCta id="hero-email" onSubmit={signUp} />
          <button type="button" className="lp-demo" onClick={continueAsDemo} disabled={demoBusy}>
            {demoBusy ? "Opening the demo…" : "Continue as demo, no account needed"} &rarr;
          </button>
        </div>

        <div className="lp-curve" aria-hidden>
          <svg viewBox="0 0 1920 45" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lpLine" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(192, 24, 59, 0)" />
                <stop offset="10%" stopColor="rgba(215, 20, 50, 0.85)" />
                <stop offset="35%" stopColor="#e50914" />
                <stop offset="50%" stopColor="#ff1e42" />
                <stop offset="65%" stopColor="#e50914" />
                <stop offset="90%" stopColor="rgba(215, 20, 50, 0.85)" />
                <stop offset="100%" stopColor="rgba(192, 24, 59, 0)" />
              </linearGradient>
              <linearGradient id="lpGround" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#070a14" />
                <stop offset="100%" stopColor="#000000" />
              </linearGradient>
            </defs>
            <path d="M 0,38 Q 960,8 1920,38 L 1920,45 L 0,45 Z" fill="url(#lpGround)" />
            <path d="M 0,38 Q 960,8 1920,38" fill="none" stroke="url(#lpLine)" strokeWidth="2.5" />
          </svg>
        </div>
      </header>

      <section className="lp-section lp-tricks" id="tricks">
        <div className="lp-container">
          <h2 className="lp-h2">How impostors trick people</h2>
          <p className="lp-sub">Five tricks IMPOSTR looks for, and the checks it runs on each.</p>
          <div className="lp-trick-grid">
            {TRICKS.map((t, i) => (
              <article
                key={t.title}
                className="lp-trick"
                tabIndex={0}
                onClick={() => setModal({ kind: "trick", index: i })}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setModal({ kind: "trick", index: i }))}
                aria-label={`${t.title}: see details`}
              >
                <div className="lp-rank" aria-hidden>
                  {i + 1}
                </div>
                <div className="lp-trick-card">
                  <span className={`lp-badge lp-${t.tone}`}>{t.badge}</span>
                  <h3 className="lp-trick-title">{t.title}</h3>
                  <p className="lp-trick-summary">{t.summary}</p>
                  <div className="lp-trick-stat">
                    <span className="lp-stat-label">IMPOSTR checks</span>
                    <span className="lp-stat-value">{t.checks}</span>
                  </div>
                  <span className="lp-trick-btn">How it works &rarr;</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="features">
        <div className="lp-container">
          <h2 className="lp-h2">What IMPOSTR does for you</h2>
          <div className="lp-feature-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-feature">
                <div className="lp-feature-head">
                  <h3 className="lp-feature-title">{f.title}</h3>
                  <div className="lp-feature-icon" aria-hidden>
                    {f.icon}
                  </div>
                </div>
                <p className="lp-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-faq" id="faq">
        <div className="lp-container">
          <h2 className="lp-h2 lp-center">Frequently Asked Questions</h2>
          <div className="lp-faq-list">
            {FAQ.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} className={`lp-faq-item${open ? " lp-open" : ""}`}>
                  <button type="button" className="lp-faq-q" aria-expanded={open} aria-controls={`faq-${i}`} onClick={() => setOpenFaq(open ? null : i)}>
                    <span>{f.q}</span>
                    <span className="lp-faq-icon" aria-hidden>
                      +
                    </span>
                  </button>
                  <div className="lp-faq-a" id={`faq-${i}`} role="region" hidden={!open}>
                    <p>{f.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="lp-faq-cta">
            <p className="lp-subtext lp-center">Ready to protect your brand? Enter your email to create a free account.</p>
            <EmailCta id="faq-email" onSubmit={signUp} />
            <button type="button" className="lp-demo" onClick={continueAsDemo} disabled={demoBusy}>
              Or continue as demo &rarr;
            </button>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container">
          <p className="lp-footer-top">
            Already cheated by a fake account? In India, call the National Cybercrime Helpline{" "}
            <a href="tel:1930" className="lp-helpline">
              1930
            </a>{" "}
            or report at{" "}
            <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer" className="lp-helpline">
              cybercrime.gov.in
            </a>
            .
          </p>
          <div className="lp-footer-grid">
            <div className="lp-footer-col">
              <a href="#tricks">How impostors trick people</a>
              <a href="#features">What IMPOSTR does</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="lp-footer-col">
              <button type="button" onClick={() => setModal({ kind: "signin" })}>
                Sign in
              </button>
              <button type="button" onClick={() => signUp()}>
                Create an account
              </button>
              <button type="button" onClick={continueAsDemo}>
                Continue as demo
              </button>
            </div>
            <div className="lp-footer-col">
              <a href="https://github.com/varunvanteru/Digital-Risk-Protection-Platform" target="_blank" rel="noopener noreferrer">
                Source code on GitHub
              </a>
              <a href="/help/impostr-demo.mp4" target="_blank" rel="noopener">
                Demo video
              </a>
            </div>
          </div>
          <p className="lp-copyright">IMPOSTR · Digital Risk Protection for social media and app stores · Built for ByteXL HackXlerate</p>
        </div>
      </footer>

      {modal && (
        <div className="lp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && modal.kind !== "welcome" && setModal(null)}>
          <div className={`lp-modal${modal.kind === "trick" ? " lp-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="lp-modal-title">
            {modal.kind !== "welcome" && (
              <button type="button" className="lp-close" onClick={() => setModal(null)} aria-label="Close">
                &times;
              </button>
            )}
            {modal.kind === "signin" && <SignInForm onSwitch={() => signUp()} />}
            {modal.kind === "signup" && (
              <SignUpForm email={modal.email} onSwitch={() => setModal({ kind: "signin" })} onDone={(name) => setModal({ kind: "welcome", name })} />
            )}
            {modal.kind === "welcome" && <Welcome name={modal.name} />}
            {modal.kind === "trick" && <TrickDetail index={modal.index} />}
          </div>
        </div>
      )}
    </div>
  );
}
