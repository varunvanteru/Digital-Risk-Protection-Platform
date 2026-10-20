/** One account or app returned by a source, before any scoring. */
export interface Candidate {
  sourceId: string;
  channel: "social" | "app";
  platform: string;
  identifier: string; // lowercase handle, package name or track id; used for allowlist and dedupe
  handle: string;
  displayName: string;
  url: string;
  bio: string;
  audience: number;
  createdOn: string | null; // YYYY-MM-DD
  publisher: string | null;
  publisherId: string | null;
  links: string[];
  verified: boolean;
  image: string | null; // media path or remote URL of avatar / icon
  mark: string; // avatar variant label for the UI fallback
  privacyUrl: string | null;
  firstSeen: string | null; // "YYYY-MM-DD HH:MM:SS", only set by datasets that carry history
  seedStatus: string | null;
}

export function candidate(fields: Pick<Candidate, "sourceId" | "channel" | "platform" | "identifier" | "handle" | "displayName" | "url"> & Partial<Candidate>): Candidate {
  return {
    bio: "",
    audience: 0,
    createdOn: null,
    publisher: null,
    publisherId: null,
    links: [],
    verified: false,
    image: null,
    mark: "unrelated",
    privacyUrl: null,
    firstSeen: null,
    seedStatus: null,
    ...fields,
  };
}

export interface Connector {
  sourceId: string;
  timeoutMs?: number;
  /** Why this source cannot run (no public API, API key not set), or null when it can. */
  notConnected?(): string | null;
  fetch(keywords: string[]): Promise<Candidate[]>;
  enrich?(c: Candidate): Promise<void>;
}

export class SourceUnavailable extends Error {}

/** Python slicing by code points: s[:n]. */
export const firstChars = (s: string, n: number) => {
  const a = Array.from(s);
  return a.length <= n ? s : a.slice(0, n).join("");
};
