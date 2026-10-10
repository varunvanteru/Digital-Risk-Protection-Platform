"use client";

import clsx from "clsx";
import { Check, Monitor, Moon, Palette as PaletteIcon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { applyTheme, DEFAULT_THEME, PALETTES, readTheme, type Mode, type ThemePref } from "@/lib/theme";

const MODES: { id: Mode; label: string; Icon: typeof Sun }[] = [
  { id: "system", label: "System", Icon: Monitor },
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
];

const THEME_EVENT = "brandshield-theme-change";

/** Round light/dark switch for the header. */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.mode === "dark");
    sync();
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);
  function toggle() {
    applyTheme({ ...readTheme(), mode: dark ? "light" : "dark" });
    window.dispatchEvent(new Event(THEME_EVENT));
  }
  return (
    <button onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className={clsx("float-btn size-9 [&_svg]:size-4", className)}>
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

/** Palette + light/dark picker, opened from the sidebar footer. */
export function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState<ThemePref>(DEFAULT_THEME);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPref(readTheme());
    // Keep in step with the header's light/dark button.
    const onChange = () => setPref(readTheme());
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);

  // Follow the OS when set to System.
  useEffect(() => {
    if (pref.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(pref);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function update(next: Partial<ThemePref>) {
    const p = { ...pref, ...next };
    setPref(p);
    applyTheme(p);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={clsx(
          "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px]",
          open ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink",
        )}
      >
        <PaletteIcon className="size-4 text-ink-3" />
        <span className="flex-1 text-left">Appearance</span>
        <span className="text-[11.5px] text-ink-3">{PALETTES.find((p) => p.id === pref.palette)?.name}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Appearance"
          className="card-surface absolute bottom-full left-0 z-50 mb-2 w-[264px] rounded-lg border bg-surface p-3"
        >
          <div className="mb-2 text-[12px] font-medium text-ink-3">Palette</div>
          <div role="radiogroup" aria-label="Palette" className="space-y-1">
            {PALETTES.map((p) => {
              const on = pref.palette === p.id;
              return (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => update({ palette: p.id })}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-md border px-2.5 py-2 text-left transition-colors",
                    on ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-2",
                  )}
                >
                  <span className="flex shrink-0 overflow-hidden rounded border border-line" aria-hidden>
                    {p.swatch.map((c) => (
                      <span key={c} className="block h-6 w-3" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink">{p.name}</span>
                    <span className="block text-[11.5px] text-ink-3">{p.note}</span>
                  </span>
                  {on && <Check className="size-3.5 text-ink" />}
                </button>
              );
            })}
          </div>

          <div className="mb-2 mt-3 text-[12px] font-medium text-ink-3">Mode</div>
          <div role="radiogroup" aria-label="Mode" className="grid grid-cols-3 gap-1 rounded-md border border-line-strong bg-surface-2 p-0.5">
            {MODES.map(({ id, label, Icon }) => (
              <button
                key={id}
                role="radio"
                aria-checked={pref.mode === id}
                onClick={() => update({ mode: id })}
                className={clsx(
                  "flex h-7 items-center justify-center gap-1.5 rounded-[5px] text-[12px] font-medium",
                  pref.mode === id ? "bg-surface text-ink shadow-[0_0_0_1px_var(--border)]" : "text-ink-2 hover:text-ink",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
