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
