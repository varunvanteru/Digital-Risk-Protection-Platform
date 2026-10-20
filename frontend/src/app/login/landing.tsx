"use client";

import { useEffect, useState } from "react";
import { account, ApiError } from "@/lib/api";

/** Where to go after signing in: the page that sent the visitor here, if it is one of ours. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}

type Modal = { kind: "signin" } | { kind: "signup"; email: string } | { kind: "welcome"; name: string } | null;

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

export function Landing({ className }: { className?: string }) {
  const [modal, setModal] = useState<Modal>(null);
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

      {modal && (
        <div className="lp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && modal.kind !== "welcome" && setModal(null)}>
          <div className="lp-modal" role="dialog" aria-modal="true" aria-labelledby="lp-modal-title">
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
          </div>
        </div>
      )}
    </div>
  );
}
