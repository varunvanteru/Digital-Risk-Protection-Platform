"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { account, ApiError } from "@/lib/api";
import { isPersonalEmail, passwordError, WORK_EMAIL_MESSAGE } from "@/lib/workEmail";

/** An error message; the work-email one ends with a button that opens the demo instead. */
function FormError({ message, onDemo }: { message: string; onDemo?: () => void }) {
  const isWorkEmail = message === WORK_EMAIL_MESSAGE;
  return (
    <p className="lp-error" role="alert">
      {isWorkEmail ? message.replace(/ Just looking around\? Continue as demo\.$/, "") : message}
      {isWorkEmail && onDemo && (
        <>
          {" "}Just looking around?{" "}
          <button type="button" className="lp-link lp-link-inline" onClick={onDemo}>
            Continue as demo &rarr;
          </button>
        </>
      )}
    </p>
  );
}

/** Where to go after signing in: the page that sent the visitor here, if it is one of ours. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}

type Modal = { kind: "signin" } | { kind: "signup"; email: string } | { kind: "welcome"; name: string } | null;

function Chevron() {
  return (
    <svg className="lp-chevron" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
    </svg>
  );
}

function Field(props: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string; autoFocus?: boolean; minLength?: number }) {
  const isPassword = props.type === "password";
  const [shown, setShown] = useState(false);
  return (
    <div className="lp-field lp-modal-field">
      <input
        id={props.id}
        className={`lp-input${isPassword ? " lp-input-password" : ""}`}
        type={isPassword && shown ? "text" : (props.type ?? "text")}
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
      {isPassword && (
        // Show or hide what was typed; the field keeps its focus and value.
        <button
          type="button"
          className="lp-eye"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          title={shown ? "Hide password" : "Show password"}
        >
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      )}
    </div>
  );
}

function EmailCta({ id, onSubmit, onDemo }: { id: string; onSubmit: (email: string) => void; onDemo: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <form
        className="lp-cta"
        onSubmit={(e) => {
          e.preventDefault();
          // Accounts are for companies: say so here, before the sign-up form opens.
          if (isPersonalEmail(email)) return setError(WORK_EMAIL_MESSAGE);
          onSubmit(email.trim());
        }}
      >
        <div className="lp-field">
          <input
            id={id}
            className="lp-input"
            type="email"
            required
            autoComplete="email"
            placeholder=" "
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
          />
          <label htmlFor={id} className="lp-float">
            Work email
          </label>
        </div>
        <button type="submit" className="lp-btn-white lp-btn-big">
          Get Started
          <Chevron />
        </button>
      </form>
      {error && (
        <div className="lp-cta-error">
          <FormError message={error} onDemo={onDemo} />
        </div>
      )}
    </>
  );
}

function SignInForm({ onSwitch, onDemo }: { onSwitch: () => void; onDemo: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPersonalEmail(email)) return setError(WORK_EMAIL_MESSAGE);
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
        <Field id="si-email" label="Work email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
        <Field id="si-pass" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <FormError message={error} onDemo={onDemo} />}
        <button type="submit" className="lp-btn-blue lp-btn-block" disabled={busy}>
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

/** The password rules, each ticked as soon as it is met. */
function PasswordRules({ password }: { password: string }) {
  const rules: [string, boolean][] = [
    ["At least 8 characters", password.length >= 8],
    ["At least one special character (! @ # $ % &)", /[^A-Za-z0-9\s]/.test(password)],
  ];
  return (
    <ul className="lp-rules" aria-label="Password rules">
      {rules.map(([label, ok]) => (
        <li key={label} className={ok ? "lp-rule-ok" : undefined}>
          <span aria-hidden>{ok ? "✓" : "•"}</span> {label}
        </li>
      ))}
    </ul>
  );
}

function SignUpForm({
  email: initialEmail,
  onSwitch,
  onDone,
  onDemo,
}: {
  email: string;
  onSwitch: () => void;
  onDone: (name: string) => void;
  onDemo: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPersonalEmail(email)) return setError(WORK_EMAIL_MESSAGE);
    const pe = passwordError(password);
    if (pe) return setError(pe);
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
        <Field id="su-email" label="Work email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field id="su-pass" label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
        <PasswordRules password={password} />
        {error && <FormError message={error} onDemo={onDemo} />}
        <button type="submit" className="lp-btn-red lp-btn-block" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="lp-modal-hint">Free for companies: use your work email. Your password is stored only as a salted hash.</p>
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
          <span aria-hidden>✓</span> A demo brand to explore: PhonePe
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
      <div className="lp-hero">
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
          <button type="button" className="lp-btn-blue lp-btn-small" onClick={() => setModal({ kind: "signin" })}>
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
          <EmailCta id="hero-email" onSubmit={signUp} onDemo={continueAsDemo} />
          <button type="button" className="lp-demo" onClick={continueAsDemo} disabled={demoBusy}>
            {demoBusy ? "Opening the demo…" : "Continue as demo, no account needed"} &rarr;
          </button>
        </div>

        <footer className="lp-footer-strip">
          <p>
            <span>Fake profiles, fake brand pages, scam accounts and look-alike apps, each scored 0 to 100 with the evidence.</span>
            <span className="lp-footer-lock-wrap" aria-hidden>
              <Lock className="lp-footer-lock" size={11} strokeWidth={2.4} />
            </span>
            <span>Enter your work email to create a free company account, or look around first in a demo workspace.</span>
          </p>
        </footer>
      </div>

      {modal && (
        <div className="lp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && modal.kind !== "welcome" && setModal(null)}>
          <div className="lp-modal" role="dialog" aria-modal="true" aria-labelledby="lp-modal-title">
            {modal.kind !== "welcome" && (
              <button type="button" className="lp-close" onClick={() => setModal(null)} aria-label="Close">
                &times;
              </button>
            )}
            {modal.kind === "signin" && <SignInForm onSwitch={() => signUp()} onDemo={continueAsDemo} />}
            {modal.kind === "signup" && (
              <SignUpForm
                email={modal.email}
                onSwitch={() => setModal({ kind: "signin" })}
                onDone={(name) => setModal({ kind: "welcome", name })}
                onDemo={continueAsDemo}
              />
            )}
            {modal.kind === "welcome" && <Welcome name={modal.name} />}
          </div>
        </div>
      )}
    </div>
  );
}
