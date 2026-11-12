/** Small, dependency-free HTTP helpers for the Clubhouse API. */

/**
 * Whether a POST may proceed. Requests with no Origin (scripts, curl) are
 * allowed; browser requests must come from this machine or an origin listed
 * in `allowed`. Stops another website from making the server sign or log in.
 */
export function originAllowed(origin: string | undefined, allowed: ReadonlySet<string> = new Set()): boolean {
  if (!origin) return true;
  if (allowed.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/** An error that maps straight to an HTTP status and a JSON body. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Reads a JSON object body of at most `limit` bytes. Bad input is a 4xx, never a 500. */
export async function readJsonBody(req: AsyncIterable<Buffer | string>, limit = 64 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = typeof c === "string" ? Buffer.from(c) : c;
    size += b.length;
    if (size > limit) throw new HttpError(413, `request body is larger than ${limit} bytes`, "BODY_TOO_LARGE");
    chunks.push(b);
  }
  if (chunks.length === 0) return {};
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "request body is not valid JSON", "BAD_JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "request body must be a JSON object", "BAD_JSON");
  return value as Record<string, unknown>;
}

/**
 * Fixed-window rate limit per key (an IP address here). In memory: fine for a
 * single demo server; a multi-instance deployment would need a shared store.
 */
export function rateLimiter(limit: number, windowMs: number) {
  const windows = new Map<string, { start: number; count: number }>();
  return function allow(key: string, now = Date.now()): boolean {
    const w = windows.get(key);
    if (!w || now - w.start >= windowMs) {
      if (windows.size > 10_000) windows.clear(); // bound memory under a flood of distinct keys
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= limit;
  };
}
