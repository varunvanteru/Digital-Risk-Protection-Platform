"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { BRAND, DETECTIONS, SOURCES } from "./mock-data";
import { scoreDetection, type ScoreBreakdown } from "./scoring";
import type { BrandProfile, Detection, DetectionStatus, OfficialAccount, Source, SourceHealth } from "./types";

export type ScoredDetection = Detection & { breakdown: ScoreBreakdown };

interface Store {
  brand: BrandProfile;
  detections: ScoredDetection[];
  sources: Source[];
  setStatus: (id: string, status: DetectionStatus) => void;
  saveBrand: (b: BrandProfile) => void;
  addOfficialAccount: (a: OfficialAccount) => void;
  removeOfficialAccount: (canonicalId: string) => void;
  setSourceHealth: (id: string, health: SourceHealth) => void;
  scanning: boolean;
  runScan: () => void;
  lastScanAt: string;
}

const Ctx = createContext<Store | null>(null);

/**
 * Client-side state for the prototype. The backend will own this later;
 * the shape mirrors the planned API so components do not change.
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<BrandProfile>(BRAND);
  const [statuses, setStatuses] = useState<Record<string, DetectionStatus>>({});
  const [sources, setSources] = useState<Source[]>(SOURCES);
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState("2026-10-10T14:02:00+05:30");

  const detections = useMemo(() => {
    const officialIds = new Set(brand.accounts.map((a) => `${a.platform}:${a.handle.toLowerCase()}`));
    return DETECTIONS.filter((d) => !officialIds.has(`${d.platform}:${d.handle.toLowerCase()}`))
      .map((d) => ({ ...d, status: statuses[d.id] ?? d.status, breakdown: scoreDetection(d) }))
      .sort((a, b) => b.breakdown.score - a.breakdown.score);
  }, [brand.accounts, statuses]);

  const setStatus = useCallback((id: string, status: DetectionStatus) => {
    setStatuses((s) => ({ ...s, [id]: status }));
  }, []);

  const saveBrand = useCallback((b: BrandProfile) => setBrand(b), []);

  const addOfficialAccount = useCallback((a: OfficialAccount) => {
    setBrand((b) => ({ ...b, accounts: [...b.accounts, a] }));
  }, []);

  const removeOfficialAccount = useCallback((canonicalId: string) => {
    setBrand((b) => ({ ...b, accounts: b.accounts.filter((a) => a.canonicalId !== canonicalId) }));
  }, []);

  const setSourceHealth = useCallback((id: string, health: SourceHealth) => {
    setSources((list) =>
      list.map((s) =>
        s.id === id
          ? {
              ...s,
              health,
              note:
                health === "unavailable"
                  ? "Not reachable. The scan continues with other sources; showing the last good results."
                  : health === "degraded"
                    ? s.note ?? "Responding slowly. Results may be incomplete."
                    : undefined,
            }
          : s,
      ),
    );
  }, []);

  const runScan = useCallback(() => {
    setScanning(true);
    window.setTimeout(() => {
      setScanning(false);
      setLastScanAt(new Date().toISOString());
    }, 2200);
  }, []);

  const value = useMemo(
    () => ({ brand, detections, sources, setStatus, saveBrand, addOfficialAccount, removeOfficialAccount, setSourceHealth, scanning, runScan, lastScanAt }),
    [brand, detections, sources, setStatus, saveBrand, addOfficialAccount, removeOfficialAccount, setSourceHealth, scanning, runScan, lastScanAt],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
