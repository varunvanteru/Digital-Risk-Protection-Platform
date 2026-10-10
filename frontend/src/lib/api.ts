import type {
  AccuracyReport,
  BrandProfile,
  BrandSummary,
  Detection,
  DetectionDetail,
  DetectionStatus,
  Platform,
  QuickCheck,
  ScanSummary,
  SearchResponse,
  Source,
} from "./types";

export type BrandInput = {
  name: string;
  legalName?: string;
  aliases: string[];
  keywords: string[];
  domains: string[];
  description: string;
  publisher?: string;
  publisherAliases?: string[];
  accounts: { platform: Platform; handle: string; status: "official" | "partner" }[];
  apps: { platform: Platform; packageId: string; name?: string }[];
};

// The API is served by this app (src/app/api). Set NEXT_PUBLIC_API_URL only to use another server,
// e.g. the Python reference API at http://localhost:8100.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** Media paths from the API ("/media/...") are served by the API's server. */
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

// ---------- admin password (for actions that change data on the public site) ----------

const KEY_STORAGE = "brandshield.adminKey";

export function adminKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setAdminKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* private mode: the key lasts for this page only */
  }
}

/**
 * Set by the unlock dialog (components/unlock.tsx). Asks for the password and resolves
 * true once a correct one is saved, false if the user cancels.
 */
let unlockHandler: (() => Promise<boolean>) | null = null;
export function onUnlockRequest(fn: (() => Promise<boolean>) | null) {
  unlockHandler = fn;
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  // FormData sets its own multipart Content-Type with the boundary.
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const key = adminKey();
  if (key) headers.set("X-Admin-Key", key);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError(`Cannot reach the API at ${API_URL || "this server"}. Check your connection and try again.`, 0);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, init);
  if (res.status === 401 && unlockHandler && (await unlockHandler())) {
    res = await send(path, init); // retry once with the password just entered
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

  authStatus: () => request<{ required: boolean }>("/api/auth"),
  /** Check a password without saving it. */
  checkAdminKey: async (key: string) => {
    const res = await fetch(`${API_URL}/api/auth`, { method: "POST", headers: { "X-Admin-Key": key }, cache: "no-store" });
    return res.ok;
  },

  brand: () => request<BrandProfile>("/api/brand"),
  saveBrand: (body: BrandInput) => request<BrandProfile>("/api/brand", json("PUT", body)),
  brands: () => request<BrandSummary[]>("/api/brands"),
  createBrand: (body: BrandInput) => request<BrandProfile>("/api/brands", json("POST", body)),
  registerFromSearch: (body: { name: string; publishers: string[]; apps: { platform: Platform; packageId: string; name: string }[]; description?: string }) =>
    request<BrandProfile>("/api/brands/from-search", json("POST", body)),
  activateBrand: (id: string) => request<BrandProfile>(`/api/brands/${id}/activate`, { method: "POST" }),
  deleteBrand: (id: string) => request<BrandSummary[]>(`/api/brands/${id}`, { method: "DELETE" }),
  validateBrand: () =>
    request<{ brand: BrandProfile; summary: Record<string, number> }>("/api/brand/validate", { method: "POST" }),
  accuracy: () => request<AccuracyReport>("/api/accuracy"),
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
