"use client";

import { Download, MoreVertical, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Orb } from "./ui";

/** Chrome / Edge / Android: the browser's own install prompt, captured for our button. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support tells them apart.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * "Install app" in the top bar. Uses the browser's install prompt where there is one
 * (Chrome, Edge, Samsung Internet, Android); elsewhere (iPhone, iPad, Safari, Firefox)
 * it shows the steps for that browser. Hidden once the app is installed.
 */
export function InstallButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true); // hidden until we know
  const [help, setHelp] = useState<Platform | null>(null);

  useEffect(() => {
    setInstalled(isInstalled());
    // The service worker makes the app installable and lets it open offline.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our button instead of the browser's mini-bar
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    setHelp(detectPlatform());
  }

  if (installed) return null;
  return (
    <>
      <Button variant="tonal" onClick={install} aria-label="Install app" title="Install IMPOSTR as an app" className="max-sm:w-8 max-sm:px-0">
        <Download />
        <span className="max-sm:sr-only">Install app</span>
      </Button>
      {help && <InstallHelp platform={help} onClose={() => setHelp(null)} />}
    </>
  );
}

const STEPS: Record<Platform, { title: string; steps: React.ReactNode[] }> = {
  ios: {
    title: "Install on iPhone or iPad",
    steps: [
      <>Open this page in <b>Safari</b>.</>,
      <>
        Tap <Share className="inline size-4 align-[-3px]" /> <b>Share</b> in the toolbar.
      </>,
      <>
        Choose <SquarePlus className="inline size-4 align-[-3px]" /> <b>Add to Home Screen</b>, then <b>Add</b>.
      </>,
    ],
  },
  android: {
    title: "Install on Android",
    steps: [
      <>Open this page in <b>Chrome</b>.</>,
      <>
        Tap <MoreVertical className="inline size-4 align-[-3px]" /> the menu at the top right.
      </>,
      <>
        Choose <b>Install app</b> or <b>Add to Home screen</b>.
      </>,
    ],
  },
  desktop: {
    title: "Install on your computer",
    steps: [
      <>
        In <b>Chrome</b> or <b>Edge</b>, click the install icon <Download className="inline size-4 align-[-3px]" /> at the right of the address bar,
        or open the menu and choose <b>Install IMPOSTR</b>.
      </>,
      <>
        In <b>Safari</b> on a Mac: <b>File → Add to Dock</b>.
      </>,
      <>Firefox does not install web apps; use Chrome, Edge or Safari.</>,
    ],
  },
};

function InstallHelp({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const { title, steps } = STEPS[platform];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="card-surface w-full max-w-sm rounded-lg border bg-surface p-5"
      >
        <div className="mb-4 flex items-center gap-3">
          <Orb>
            <Download />
          </Orb>
          <h2 id="install-title" className="card-title flex-1 text-[13px] font-semibold text-ink">
            {title}
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-[13px] leading-relaxed text-ink-2">
              <Orb size="sm">{String(i + 1).padStart(2, "0")}</Orb>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12px] text-ink-3">The app opens in its own window, with your private workspace, and updates itself.</p>
      </div>
    </div>
  );
}
