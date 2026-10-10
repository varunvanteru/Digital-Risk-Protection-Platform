/**
 * Small helpers shared by the API. Rounding follows Python's round() exactly
 * (ties to even, decided on the exact binary value), so scores match the
 * reference engine in backend/ to the last digit.
 */

function isExactTie(x: number, digits: number): boolean {
  // x * 10^digits lies exactly halfway between two integers (on the exact binary value of x).
  if (!Number.isFinite(x) || Number.isInteger(x)) return false;
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, Math.abs(x));
  const hi = buf.getUint32(0);
  const lo = buf.getUint32(4);
  const exp = (hi >>> 20) & 0x7ff;
  const B = BigInt;
  let mant = (B(hi & 0xfffff) << B(32)) | B(lo);
  let e = exp - 1075;
  if (exp === 0) e = -1074;
  else mant |= B(1) << B(52);
  if (e >= 0) return false;
  const den = B(1) << B(-e);
  const num = mant * B(10) ** B(digits);
  return (num % den) * B(2) === den;
}

/** Python's round(x, digits). */
export function pyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x)) return x;
  if (digits === 0) {
    const f = Math.floor(x);
    const diff = x - f;
    if (diff === 0.5) return f % 2 === 0 ? f : f + 1;
    return diff < 0.5 ? f : f + 1;
  }
  if (isExactTie(x, digits)) {
    const scaled = Math.abs(x) * 10 ** digits; // exact tie: floor is well defined
    const f = Math.floor(scaled);
    const even = f % 2 === 0 ? f : f + 1;
    return Math.sign(x) * Number((even / 10 ** digits).toFixed(digits));
  }
  return Number(x.toFixed(digits));
}

/** Keep the first occurrence of each value, in order (Python's dict.fromkeys). */
export function unique<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

/** "2026-10-10 14:23:31": the naive-UTC DATETIME format the database stores. */
export function utcnow(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Database DATETIME / DATE to the API's ISO form ("...Z" for datetimes, plain for dates). */
export function iso(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.length <= 10 ? v : v.slice(0, 19).replace(" ", "T") + "Z";
}

/** Whole days from date a to date b (both "YYYY-MM-DD"). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
}

export function hexId(n: number): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, n);
}

/** Python str.lower() on the code-point level is close enough to toLowerCase for names. */
export const chars = (s: string): string[] => Array.from(s);

/** Python's "{:,}" for integers. */
export function thousands(n: number): string {
  return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
}

/** 422 with {field, message}: the shape the frontend shows next to a form field. */
export function badRequest(field: string, message: string): never {
  throw new HttpError(422, { field, message });
}

export async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SourceTimeout(`Timed out after ${Math.round(ms / 1000)} s`, what)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class SourceTimeout extends Error {
  constructor(
    message: string,
    public what: string,
  ) {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run fn over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
