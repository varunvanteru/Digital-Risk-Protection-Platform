"use client";

import { Check, Copy, ExternalLink, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Orb } from "@/components/ui";
import { PLATFORM_LABEL } from "@/lib/format";
import { REPORT_PAGES, letterText } from "@/lib/takedown";
import type { BrandProfile, Detection } from "@/lib/types";

/** The takedown letter for one detection, with Copy letter and a link to the platform's report form. */
export function TakedownLetter({ d, brand, onClose, onCopied }: { d: Detection; brand: BrandProfile; onClose: () => void; onCopied: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const text = letterText(d, brand);
  const page = REPORT_PAGES[d.platform];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied();
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="letter-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="card-surface flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border bg-surface p-5"
      >
        <div className="mb-4 flex items-center gap-3">
          <Orb>
            <FileText />
          </Orb>
          <div className="min-w-0 flex-1">
            <h2 id="letter-title" className="card-title text-[13px] font-semibold text-ink">
              Takedown letter
            </h2>
            <p className="text-[12.5px] text-ink-3">Ready to send to {PLATFORM_LABEL[d.platform]}. Fill in the bracketed details before you submit it.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <textarea
          readOnly
          value={text}
          aria-label="Letter text"
          className="min-h-[300px] flex-1 resize-none rounded-md border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-ink"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy letter"}
          </Button>
          {page && (
            <a href={page.url} target="_blank" rel="noreferrer" className="ext-link inline-flex items-center gap-1 px-2 text-[13px]">
              {page.kind === "form" ? "Open report form" : "Open help page"}: {page.label}
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        {copied === false && <p className="mt-2 text-[12.5px] text-crit">Copying was blocked by the browser. Select the text above and copy it.</p>}
        <p className="mt-3 text-[12px] text-ink-3">
          IMPOSTR does not send anything. Paste the letter into the {page?.kind === "help" ? "platform's help request" : "report form"} yourself, and attach the
          Evidence file if the form allows.
        </p>
      </div>
    </div>
  );
}
