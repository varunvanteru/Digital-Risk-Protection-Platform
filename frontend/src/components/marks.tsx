import clsx from "clsx";
import { PLATFORM_LABEL, PLATFORM_SHORT } from "@/lib/format";
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
  className,
}: {
  variant?: MarkVariant;
  size?: number;
  initials?: string;
  className?: string;
}) {
  if (variant === "monogram" || variant === "unrelated") {
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
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded border border-line bg-surface px-1 font-mono text-[10px] font-medium text-ink-2",
        className,
      )}
    >
      {PLATFORM_SHORT[platform]}
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
export function ProductMark({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" className="fill-ink" />
      <path d="M12 5.5l5 2v4.2c0 3.1-2.1 5.6-5 6.8-2.9-1.2-5-3.7-5-6.8V7.5l5-2z" className="stroke-inverse" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.6 12l1.7 1.7 3.2-3.4" className="stroke-inverse" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
