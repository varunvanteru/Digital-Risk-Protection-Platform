"use client";

import clsx from "clsx";
import { BookOpen, Building2, CloudOff, LayoutGrid, LoaderCircle, LogOut, Menu, PlugZap, Radar, RefreshCw, ScanSearch, Settings2, Target, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { account, API_URL, type Account } from "@/lib/api";
import { useLoadState, useStore } from "@/lib/store";
import { BrandSwitcher } from "./brand-switcher";
import { ProductMark } from "./marks";
import { ProjectSummary } from "./project-summary";
import { AppearanceMenu, ThemeToggle } from "./appearance";
import { InstallButton } from "./install";
import { UnlockDialog } from "./unlock";
import { Button, FloatLink } from "./ui";

const NAV = [
  { href: "/setup", label: "Setup Brand Profile", Icon: Settings2 },
  { href: "/", label: "Overview", Icon: LayoutGrid },
  { href: "/detections", label: "Detections", Icon: Radar },
  { href: "/check", label: "Quick check", Icon: ScanSearch },
  { href: "/brand", label: "Brand profile", Icon: Building2 },
  { href: "/sources", label: "Sources", Icon: PlugZap },
  { href: "/accuracy", label: "Accuracy", Icon: Target },
  { href: "/how-to-use", label: "How to use", Icon: BookOpen },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { detections, sources } = useStore();
  const urgent = detections.filter(
    (d) => d.status === "open" && (d.breakdown.severity === "critical" || d.breakdown.severity === "high"),
  ).length;
  const sourceIssues = sources.filter((s) => s.health !== "operational").length;

  return (
    <div className="app-sidebar flex h-full flex-col">
      <div className="flex h-[52px] items-center gap-2.5 px-4">
        <ProductMark />
        <span className="page-title !text-[15px] !leading-none text-ink">
          IMPOSTR
        </span>
      </div>

      <div className="px-3 pb-3">
        <BrandSwitcher onNavigate={onNavigate} />
      </div>

      <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          const badge = href === "/detections" ? urgent : href === "/sources" ? sourceIssues : 0;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "group flex h-8 items-center gap-2.5 rounded-[var(--radius-control)] px-3 text-[12.5px] transition-colors",
                active ? "bg-[var(--nav-active-bg)] font-semibold text-[var(--nav-active-ink)]" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className={clsx("size-4", active ? "text-[var(--nav-active-icon)]" : "text-ink-3 group-hover:text-ink-2")} />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span
                  className={clsx(
                    "tabular rounded-full px-2 text-[11px] font-semibold leading-[18px]",
                    href === "/sources" ? "bg-high-bg text-high" : active ? "bg-[var(--brand)] text-white" : "bg-surface-2 text-ink-2",
                  )}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-line px-3 py-3">
        <AppearanceMenu />
        <AccountFooter />
      </div>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Who is signed in (or the demo workspace), with Sign out / Sign in. */
function AccountFooter() {
  const [me, setMe] = useState<{ user: Account | null; demo: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    account.me().then(setMe).catch(() => setMe({ user: null, demo: true }));
  }, []);

  async function signOut() {
    setBusy(true);
    try {
      await account.signOut();
    } finally {
      window.location.assign("/login"); // full load: drop this workspace's data from memory
    }
  }

  const user = me?.user;
  return (
    <div className="flex items-center gap-2.5 px-2.5 pt-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10.5px] font-semibold text-ink-2">
        {user ? initials(user.name) : <UserRound className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium" title={user?.email}>
          {user ? user.name : "Demo workspace"}
        </span>
        <span
          className="block truncate text-[11.5px] text-ink-3"
          title={user ? "Your brands, scans and verdicts are saved to your account" : "Brands, scans and results you add are visible only in this browser"}
        >
          {user ? user.email : "Private · this browser"}
        </span>
      </span>
      {me &&
        (user ? (
          <button onClick={signOut} disabled={busy} aria-label="Sign out" title="Sign out" className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <LogOut className="size-4" />
          </button>
        ) : (
          <a href="/login" className="rounded-md px-2 py-1 text-[12px] font-medium text-[var(--brand)] hover:bg-surface-2">
            Sign in
          </a>
        ))}
    </div>
  );
}

function ScanStatus() {
  const { scanning, runScan, lastScan, sources } = useStore();
  const [error, setError] = useState<string | null>(null);
  const down = sources.filter((s) => s.health !== "operational");

  async function start() {
    setError(null);
    try {
      await runScan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the scan");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-[12px] text-ink-3 md:inline" role="status">
        {error ? (
          <span className="text-crit">{error}</span>
        ) : scanning ? (
          `Scanning ${sources.length} sources…`
        ) : (
          <>
            {lastScan?.finishedAt ? (
              <>
                Last scan <span className="text-ink-2">{formatDateTime(lastScan.finishedAt)}</span>
              </>
            ) : (
              "No scans yet"
            )}
            {down.length > 0 && (
              <>
                {" · "}
                <Link href="/sources" className="text-high underline-offset-2 hover:underline">
                  {down.length === 1 ? "1 source needs" : `${down.length} sources need`} attention
                </Link>
              </>
            )}
          </>
        )}
      </span>
      <Button variant="primary" onClick={start} disabled={scanning} aria-label={scanning ? "Scanning" : "Run scan"} className="max-[400px]:w-8 max-[400px]:px-0">
        {scanning ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
        {/* Icon only on the narrowest phones */}
        <span className="max-[400px]:sr-only">{scanning ? "Scanning" : "Run scan"}</span>
      </Button>
    </div>
  );
}

function LoadingFrame({ error, waking, onRetry }: { error?: string; waking?: boolean; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[52px] items-center gap-2.5 border-b border-line px-4 sm:px-6">
        <ProductMark />
        <span className="page-title !text-[15px] !leading-none text-ink">
              IMPOSTR
            </span>
      </header>
      <main className="flex flex-1 items-center justify-center px-6">
        {error ? (
          <div className="max-w-md text-center">
            <div className="mx-auto mb-3 flex size-9 items-center justify-center rounded-md border border-line bg-surface text-ink-3">
              <CloudOff className="size-4" />
            </div>
            <p className="text-[14px] font-medium">Can&apos;t load data</p>
            <p className="mt-1 text-[13px] text-ink-2">{error}</p>
            {API_URL && <p className="mt-1 font-mono text-[12px] text-ink-3">{API_URL}</p>}
            <Button className="mt-4" onClick={onRetry}>
              <RefreshCw />
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-ink-3" role="status">
            <LoaderCircle className="size-4 animate-spin" />
            {waking ? "Starting the server. This can take up to a minute after a quiet period." : "Loading"}
          </div>
        )}
      </main>
      <ProjectSummary />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { load, retry } = useLoadState();
  const pathname = usePathname();
  // The sign-in page is a full-screen page of its own.
  if (pathname === "/login") return <>{children}</>;
  if (load.kind !== "ready")
    return (
      <LoadingFrame
        error={load.kind === "error" ? load.message : undefined}
        waking={load.kind === "loading" && load.waking}
        onRetry={retry}
      />
    );
  return <ReadyShell>{children}</ReadyShell>;
}

function ReadyShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="glass-panel sticky top-0 hidden h-dvh border-r border-line lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(260px,85vw)] overflow-y-auto border-r border-line bg-surface">
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="app-topbar glass-panel sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line pl-2 pr-3 sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-md p-2 text-ink-2 hover:bg-surface-2">
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
            <ProductMark size={22} />
            <span className="page-title !text-[15px] !leading-none text-ink">
              IMPOSTR
            </span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ScanStatus />
            <InstallButton />
            {/* Round icon buttons, as in rfentity's header */}
            <FloatLink href="/check" label="Quick check" className="hidden size-8 sm:inline-flex [&_svg]:size-[15px]">
              <ScanSearch />
            </FloatLink>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">{children}</main>
      </div>
      <UnlockDialog />
    </div>
  );
}
