"use client";

import clsx from "clsx";
import { useState } from "react";
import { PLATFORM_LABEL } from "@/lib/format";
import { PlatformLogo } from "./platform-logo";
import type { MarkVariant, Platform } from "@/lib/types";

/**
 * An account's or app's picture: the real avatar / icon when there is one, otherwise its initials.
 * Never a drawn logo, which would show one brand's mark for another brand's account.
 */
export function BrandMark({
  variant = "official",
  size = 32,
  initials = "?",
  src,
  className,
}: {
  variant?: MarkVariant;
  size?: number;
  initials?: string;
  /** Real avatar / icon URL. */
  src?: string;
  className?: string;
}) {
  // Store CDNs sometimes refuse hot-linked icons; fall back to initials instead of a broken image.
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(src)}
        style={{ width: size, height: size }}
        className={clsx("shrink-0 rounded-md border border-line bg-surface object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center border border-line bg-surface-2 font-semibold text-ink-2",
        variant === "monogram" ? "rounded-full" : "rounded-md",
        className,
      )}
    >
      {initials.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function PlatformGlyph({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      title={PLATFORM_LABEL[platform]}
      className={clsx(
        "inline-flex size-5 shrink-0 items-center justify-center rounded border border-line bg-surface text-ink-2",
        className,
      )}
    >
      <PlatformLogo platform={platform} size={11} />
    </span>
  );
}

export function PlatformLabel({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-ink-2">
      <PlatformGlyph platform={platform} />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

/** Product wordmark: a plain shield outline, no gradients. */
/** The IMPOSTR shield logo on its black tile (built by scripts/build-icons.mjs). */
export function ProductMark({ size = 24 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/impostr-mark-96.png" alt="" aria-hidden width={size} height={size} className="shrink-0 rounded-[6px]" />
  );
}
