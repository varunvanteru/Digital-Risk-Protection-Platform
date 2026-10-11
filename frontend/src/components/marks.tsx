"use client";

import clsx from "clsx";
import { useState } from "react";
import { PLATFORM_LABEL } from "@/lib/format";
import { PlatformLogo } from "./platform-logo";
import type { MarkVariant, Platform } from "@/lib/types";

/**
 * The demo brand's logo and the variants impersonators make of it.
 * Real deployments render the fetched avatar / icon image instead.
 */
const BRAND_FILL = "#0f5c56";

export function BrandMark({
  variant = "official",
  size = 32,
  initials = "ZP",
  src,
  className,
}: {
  variant?: MarkVariant;
  size?: number;
  initials?: string;
  /** Real avatar / icon URL. When present it is shown instead of the drawn mark. */
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
  if (src) variant = "unrelated";
  if (variant === "monogram" || variant === "unrelated" || variant === "similar") {
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

  const fill = variant === "recolor" ? "#3d8a80" : BRAND_FILL;
  const mirror = variant === "mirror";

  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={clsx("shrink-0", className)}
    >
      <rect width="40" height="40" rx="9" fill={fill} />
      <g transform={mirror ? "translate(40 0) scale(-1 1)" : undefined}>
        <path d="M11 11.5h17.5L13.5 27H29" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="29.5" cy="11.5" r="2.3" fill="#9fe3d6" />
      </g>
      {variant === "badge" && (
        <g>
          <rect x="0" y="30" width="40" height="10" fill="#7c2d12" />
          <text x="20" y="37.6" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="#fff" letterSpacing="0.4">
            SUPPORT
          </text>
        </g>
      )}
    </svg>
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
    <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
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
