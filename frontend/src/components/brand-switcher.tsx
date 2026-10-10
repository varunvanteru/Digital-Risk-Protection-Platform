"use client";

import clsx from "clsx";
import { Check, ChevronsUpDown, LoaderCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/api";
import { useStore } from "@/lib/store";
import { BrandMark } from "./marks";

/** Switch the active brand. Scans, detections, Quick check and the profile follow the active brand. */
export function BrandSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { brand, brands, switchBrand } = useStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

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

  async function choose(id: string) {
    if (id === brand.id) return setOpen(false);
    setBusy(id);
    try {
      await switchBrand(id);
      setOpen(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 py-2 text-left hover:bg-surface-2"
      >
        <BrandMark size={22} src={mediaUrl(brand.logoUrl)} initials={brand.name.slice(0, 2)} variant={brand.logoUrl ? "official" : "monogram"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{brand.name}</span>
          <span className="block text-[11.5px] text-ink-3">
            {brands.length > 1 ? `Active · ${brands.length} brands` : "Protected brand"}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 text-ink-3" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.18)]">
          <ul role="listbox" aria-label="Brands">
            {brands.map((b) => (
              <li key={b.id}>
                <button
                  role="option"
                  aria-selected={b.id === brand.id}
                  onClick={() => choose(b.id)}
                  disabled={busy !== null}
                  className={clsx(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2",
                    b.id === brand.id && "bg-accent-soft",
                  )}
                >
                  <BrandMark size={20} src={mediaUrl(b.logoUrl)} initials={b.name.slice(0, 2)} variant={b.logoUrl ? "official" : "monogram"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{b.name}</span>
                    <span className="block text-[11px] text-ink-3">
                      {b.accounts} account{b.accounts === 1 ? "" : "s"} · {b.apps} app{b.apps === 1 ? "" : "s"}
                    </span>
                  </span>
                  {busy === b.id ? (
                    <LoaderCircle className="size-3.5 animate-spin text-ink-3" />
                  ) : (
                    b.id === brand.id && <Check className="size-3.5 text-ink" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <Link
              href="/setup?new=1"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <Plus className="size-3.5" />
              Add a brand
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
