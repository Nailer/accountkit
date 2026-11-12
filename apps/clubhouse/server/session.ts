/**
 * Session cookies: HMAC-signed, so the server needs no session store. A cookie
 * only says who signed in; the members gate still re-reads ownership from
 * chain on every request.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface Session {
  tla: string;
  owner: string;
  exp: number;
}

export const COOKIE_NAME = "ck_session";

export function sessionCodec(secret: Uint8Array) {
  const sign = (data: string) => createHmac("sha256", secret).update(data).digest("base64url");

  function encode(s: Session): string {
    const body = Buffer.from(JSON.stringify(s)).toString("base64url");
    return `${body}.${sign(body)}`;
  }

  /** The session in a Cookie header, or null if absent, forged, malformed or expired. */
  function read(cookieHeader: string | undefined, now = Date.now()): Session | null {
    const raw = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`).exec(cookieHeader ?? "")?.[1];
    if (!raw) return null;
    const [body, mac, extra] = raw.split(".");
    if (!body || !mac || extra !== undefined) return null;
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
      if (typeof s.tla !== "string" || typeof s.owner !== "string" || typeof s.exp !== "number") return null;
      return s.exp > now ? s : null;
    } catch {
      return null;
    }
  }

  return { encode, read };
}
