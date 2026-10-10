import { siAndroid, siAppstore, siFacebook, siGoogleplay, siInstagram, siTelegram, siX } from "simple-icons";
import type { Platform } from "@/lib/types";

const ICONS: Record<Platform, { path: string; title: string }> = {
  instagram: siInstagram,
  x: siX,
  facebook: siFacebook,
  telegram: siTelegram,
  google_play: siGoogleplay,
  app_store: siAppstore,
  apk_site: siAndroid,
};

/** Monochrome brand mark (simple-icons). Inherits the text colour so it fits every theme. */
export function PlatformLogo({ platform, size = 16, className }: { platform: Platform; size?: number; className?: string }) {
  const icon = ICONS[platform];
  return (
    <svg role="img" aria-label={icon.title} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d={icon.path} />
    </svg>
  );
}
