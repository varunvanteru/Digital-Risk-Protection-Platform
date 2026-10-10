import { PLATFORM_LABEL } from "@/lib/format";
import type { Platform } from "@/lib/types";
import { LOGOS } from "./platform-logos.data";

/**
 * Official full-colour platform logo. X and Threads are monochrome by brand
 * rules, so they follow the text colour and stay visible on dark themes.
 */
export function PlatformLogo({ platform, size = 16, className }: { platform: Platform; size?: number; className?: string }) {
  const logo = LOGOS[platform];
  const label = PLATFORM_LABEL[platform];
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
      dangerouslySetInnerHTML={{ __html: logo.body }}
    />
  );
}
