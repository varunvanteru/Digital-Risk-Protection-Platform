import { useId } from "react";
import { PLATFORM_LABEL } from "@/lib/format";
import type { Platform } from "@/lib/types";
import { LOGOS } from "./platform-logos.data";

/** Suffix every id="..." in an SVG body, and the url(#...) / href="#..." references to it. */
function scopeIds(body: string, uid: string): string {
  if (!body.includes("id=")) return body;
  return body
    .replace(/\bid="([^"]+)"/g, `id="$1-${uid}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1-${uid})`)
    .replace(/href="#([^"]+)"/g, `href="#$1-${uid}"`);
}

/**
 * Official full-colour platform logo. X and Threads are monochrome by brand
 * rules, so they follow the text colour and stay visible on dark themes.
 */
export function PlatformLogo({ platform, size = 16, className }: { platform: Platform; size?: number; className?: string }) {
  const logo = LOGOS[platform];
  const label = PLATFORM_LABEL[platform];
  // Gradient and clip IDs inside the SVG must be unique on the page: when the same logo appears
  // twice (e.g. the phone list, hidden on desktop, and the table) a hidden copy would win.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (logo.kind === "img") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo.src} alt={label} width={size} height={size} className={className} style={{ width: size, height: size, borderRadius: size * 0.22 }} />
    );
  }
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={logo.viewBox}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      dangerouslySetInnerHTML={{ __html: scopeIds(logo.body, uid) }}
    />
  );
}
