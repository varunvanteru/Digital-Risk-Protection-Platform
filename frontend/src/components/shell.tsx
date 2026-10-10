"use client";

import clsx from "clsx";
import { Building2, ChevronsUpDown, LayoutGrid, LoaderCircle, Menu, PlugZap, Radar, RefreshCw, ScanSearch, Settings2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { BrandMark, ProductMark } from "./marks";
import { Button } from "./ui";

const NAV = [
  { href: "/", label: "Overview", Icon: LayoutGrid },
  { href: "/detections", label: "Detections", Icon: Radar },
  { href: "/check", label: "Quick check", Icon: ScanSearch },
  { href: "/brand", label: "Brand profile", Icon: Building2 },
  { href: "/sources", label: "Sources", Icon: PlugZap },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { brand, detections, sources } = useStore();
  const urgent = detections.filter(
    (d) => d.status === "open" && (d.breakdown.severity === "critical" || d.breakdown.severity === "high"),
  ).length;
  const sourceIssues = sources.filter((s) => s.health !== "operational").length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] items-center gap-2.5 px-4">
        <ProductMark />
        <span className="text-[14px] font-semibold tracking-[-0.01em]">BrandShield</span>
      </div>

      <div className="px-3 pb-3">
        <button className="flex w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 py-2 text-left hover:bg-surface-2">
          <BrandMark size={22} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{brand.name}</span>
            <span className="block text-[11.5px] text-ink-3">Protected brand</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-ink-3" />
        </button>
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
                "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink",
              )}
            >
              <Icon className={clsx("size-4", active ? "text-ink" : "text-ink-3 group-hover:text-ink-2")} />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span
                  className={clsx(
                    "tabular rounded px-1.5 text-[11px] font-medium leading-[18px]",
                    href === "/sources" ? "bg-high-bg text-high" : "bg-surface-2 text-ink-2 group-aria-[current=page]:bg-surface",
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
        <Link
          href="/setup"
          onClick={onNavigate}
          className={clsx(
            "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px]",
            pathname.startsWith("/setup") ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink",
          )}
        >
          <Settings2 className="size-4 text-ink-3" />
          Setup wizard
        </Link>
        <div className="flex items-center gap-2.5 px-2.5 pt-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-surface-2 text-[10.5px] font-semibold text-ink-2">
            SA
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium">Security analyst</span>
            <span className="block truncate text-[11.5px] text-ink-3">Trust &amp; Safety</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ScanStatus() {
  const { scanning, runScan, lastScanAt, sources } = useStore();
  const down = sources.filter((s) => s.health !== "operational");
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-[12.5px] text-ink-3 sm:inline">
        {scanning ? (
          "Scanning 7 sources…"
        ) : (
          <>
            Last scan <span className="text-ink-2">{formatDateTime(lastScanAt)}</span>
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
      <Button variant="primary" onClick={runScan} disabled={scanning}>
        {scanning ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
        {scanning ? "Scanning" : "Run scan"}
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-bg lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] border-r border-line bg-bg">
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2">
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
            <span className="text-[14px] font-semibold">BrandShield</span>
          </div>
          <div className="hidden lg:block" />
          <ScanStatus />
        </header>
        <main className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
