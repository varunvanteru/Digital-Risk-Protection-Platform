"use client";

import { Check, Copy, ExternalLink, FileText, Pencil, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Orb } from "@/components/ui";
import { PLATFORM_LABEL } from "@/lib/format";
import { REPORT_PAGES, letterText } from "@/lib/takedown";
import type { BrandProfile, Detection } from "@/lib/types";

/** The takedown letter for one detection, with Edit letter, Copy letter, and a link to the platform's report form. */
export function TakedownLetter({ d, brand, onClose, onCopied }: { d: Detection; brand: BrandProfile; onClose: () => void; onCopied: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const initialText = letterText(d, brand);
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  function toggleEdit() {
    if (!isEditing) {
      setIsEditing(true);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const idx = text.indexOf("[Your name]");
          if (idx !== -1) {
            textareaRef.current.setSelectionRange(idx, idx + "[Your name]".length);
          }
        }
      }, 50);
    } else {
      setIsEditing(false);
    }
  }

  function resetText() {
    setText(initialText);
    setIsEditing(false);
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
            <div className="flex items-center gap-2">
              <h2 id="letter-title" className="card-title text-[13px] font-semibold text-ink">
                Takedown letter
              </h2>
              {isEditing && (
                <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                  Editing
                </span>
              )}
            </div>
            <p className="text-[12.5px] text-ink-3">
              {isEditing
                ? "Edit your name, title, contact details or body text directly in the box below."
                : `Ready to send to ${PLATFORM_LABEL[d.platform]}. Fill in the bracketed details before you submit it.`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          readOnly={!isEditing}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Letter text"
          className={`min-h-[300px] flex-1 resize-none rounded-md border p-3 font-mono text-[12.5px] leading-relaxed transition-colors ${
            isEditing
              ? "border-accent bg-surface text-ink ring-1 ring-accent/30 outline-none"
              : "border-line bg-surface-2 text-ink"
          }`}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant={isEditing ? "primary" : "secondary"} onClick={toggleEdit}>
            {isEditing ? <Check /> : <Pencil />}
            {isEditing ? "Done editing" : "Edit letter"}
          </Button>
          <Button type="button" variant="primary" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy letter"}
          </Button>
          {isEditing && text !== initialText && (
            <button
              type="button"
              onClick={resetText}
              className="ml-1 inline-flex items-center gap-1 text-[12px] text-ink-3 underline hover:text-ink"
              title="Reset to default template"
            >
              <RotateCcw className="size-3" />
              Reset template
            </button>
          )}
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
