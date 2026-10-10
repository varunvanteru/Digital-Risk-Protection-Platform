import type { BrandProfile, Detection, DetectionDetail, DetectionStatus, Platform, QuickCheck, ScanSummary, SearchResponse, Source } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8100").replace(/\/$/, "");

/** Media paths from the API ("/media/...") are served by the backend. */
export function mediaUrl(path: string | null | undefined) {
  if (!path) return undefined;
  return path.startsWith("/media/") ? `${API_URL}${path}` : path;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public field?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Cannot reach the API at ${API_URL}. Is the backend running?`, 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    if (detail && typeof detail === "object" && "message" in detail) throw new ApiError(detail.message, res.status, detail.field);
    if (typeof detail === "string") throw new ApiError(detail, res.status);
    if (Array.isArray(detail)) throw new ApiError(detail[0]?.msg ?? "Invalid request", res.status);
    throw new ApiError(`Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  health: () => request<{ status: string; database: string; mysql: string }>("/api/health"),

  brand: () => request<BrandProfile>("/api/brand"),
  saveBrand: (body: {
    name: string;
    aliases: string[];
    keywords: string[];
    domains: string[];
    description: string;
    publisher?: string;
    accounts: { platform: Platform; handle: string; status: "official" | "partner" }[];
    apps: { platform: Platform; packageId: string; name?: string }[];
  }) => request<BrandProfile>("/api/brand", json("PUT", body)),
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<BrandProfile>("/api/brand/logo", { method: "POST", body: fd });
  },
  addAccount: (body: { platform: Platform; handle: string; status: "official" | "partner" }) =>
    request<BrandProfile>("/api/brand/accounts", json("POST", body)),
  removeAccount: (id: number) => request<BrandProfile>(`/api/brand/accounts/${id}`, { method: "DELETE" }),
  addApp: (body: { platform: Platform; packageId: string; name?: string; publisher?: string; publisherId?: string }) =>
    request<BrandProfile>("/api/brand/apps", json("POST", body)),

  detections: () => request<Detection[]>("/api/detections"),
  detection: (id: string) => request<DetectionDetail>(`/api/detections/${id}`),
  setStatus: (id: string, status: DetectionStatus) => request<DetectionDetail>(`/api/detections/${id}`, json("PATCH", { status })),
  undoAllowlist: (id: string) => request<DetectionDetail>(`/api/detections/${id}/allowlist`, { method: "DELETE" }),

  check: (value: string) => request<QuickCheck>("/api/check", json("POST", { value })),
  search: (query: string, platforms: (Platform | "all")[]) => request<SearchResponse>("/api/search", json("POST", { query, platforms })),

  sources: () => request<Source[]>("/api/sources"),
  setOutage: (id: string, simulateOutage: boolean) => request<Source>(`/api/sources/${id}`, json("PATCH", { simulateOutage })),

  startScan: () => request<ScanSummary>("/api/scans", { method: "POST" }),
  latestScan: () => request<{ running: ScanSummary | null; last: ScanSummary | null; total: number }>("/api/scans/latest"),
};
