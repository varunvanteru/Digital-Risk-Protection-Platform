"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { BrandProfile, BrandSummary, Detection, DetectionDetail, DetectionStatus, ScanSummary, Source } from "./types";

interface Store {
  brand: BrandProfile;
  brands: BrandSummary[];
  switchBrand: (id: string) => Promise<void>;
  detections: Detection[];
  sources: Source[];
  lastScan: ScanSummary | null;
  scanning: boolean;
  runScan: () => Promise<void>;
  refresh: () => Promise<void>;
  setBrand: (b: BrandProfile) => void;
  setStatus: (id: string, status: DetectionStatus) => Promise<DetectionDetail>;
  setOutage: (id: string, on: boolean) => Promise<void>;
}

type LoadState = { kind: "loading"; waking?: boolean } | { kind: "error"; message: string } | { kind: "ready" };

// A hosted backend on a free tier sleeps when idle and takes up to a minute to start.
const WAKE_RETRY_MS = 3000;
const WAKE_TIMEOUT_MS = 90_000;

const Ctx = createContext<(Store & { load: LoadState; retry: () => void }) | null>(null);

/** Client state backed by the BrandShield API. */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [lastScan, setLastScan] = useState<ScanSummary | null>(null);
  const [scanning, setScanning] = useState(false);
  const poll = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const [b, d, s, scans, list] = await Promise.all([api.brand(), api.detections(), api.sources(), api.latestScan(), api.brands()]);
    setBrand(b);
    setBrands(list);
    setDetections(d);
    setSources(s);
    setLastScan(scans.last);
    setScanning(!!scans.running);
  }, []);

  const initial = useCallback(() => {
    setLoad({ kind: "loading" });
    const started = Date.now();
    const attempt = () =>
      refresh()
        .then(() => setLoad({ kind: "ready" }))
        .catch((e: unknown) => {
          // Unreachable or 502/503 while the server boots: keep trying for a while.
          const booting = e instanceof ApiError && (e.status === 0 || e.status === 502 || e.status === 503);
          if (booting && Date.now() - started < WAKE_TIMEOUT_MS) {
            setLoad({ kind: "loading", waking: true });
            window.setTimeout(attempt, WAKE_RETRY_MS);
          } else {
            setLoad({ kind: "error", message: e instanceof Error ? e.message : "Something went wrong" });
          }
        });
    attempt();
  }, [refresh]);

  // The sign-in page shows no workspace data; leaving it is a full page load, which loads it then.
  const onLogin = usePathname() === "/login";
  useEffect(() => {
    if (!onLogin) initial();
  }, [initial, onLogin]);

  // While a scan runs, poll until it finishes, then refresh everything.
  useEffect(() => {
    if (!scanning) return;
    poll.current = window.setInterval(async () => {
      try {
        const s = await api.latestScan();
        if (!s.running) {
          setScanning(false);
          await refresh();
        }
      } catch {
        /* keep polling; the banner shows if the API goes away */
      }
    }, 1500);
    return () => {
      if (poll.current) window.clearInterval(poll.current);
    };
  }, [scanning, refresh]);

  const runScan = useCallback(async () => {
    try {
      await api.startScan();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e; // already running: just follow it
    }
    setScanning(true);
  }, []);

  const setStatus = useCallback(async (id: string, status: DetectionStatus) => {
    const updated = await api.setStatus(id, status);
    const [d, b] = await Promise.all([api.detections(), api.brand()]);
    setDetections(d);
    setBrand(b);
    return updated;
  }, []);

  const switchBrand = useCallback(
    async (id: string) => {
      await api.activateBrand(id);
      await refresh();
    },
    [refresh],
  );

  const setOutage = useCallback(async (id: string, on: boolean) => {
    const s = await api.setOutage(id, on);
    setSources((list) => list.map((x) => (x.id === id ? s : x)));
  }, []);

  const value = useMemo(
    () => ({
      load,
      retry: initial,
      brand: brand as BrandProfile,
      brands,
      switchBrand,
      detections,
      sources,
      lastScan,
      scanning,
      runScan,
      refresh,
      setBrand,
      setStatus,
      setOutage,
    }),
    [load, initial, brand, brands, switchBrand, detections, sources, lastScan, scanning, runScan, refresh, setStatus, setOutage],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useCtx() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

/** For pages: only rendered once data has loaded, so `brand` is always set. */
export function useStore(): Store {
  return useCtx();
}

export function useLoadState() {
  const { load, retry } = useCtx();
  return { load, retry };
}
