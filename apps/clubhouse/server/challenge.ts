/**
 * Sign-in challenges as signed tokens, so any server instance can check one
 * (a hosted deployment may answer /api/challenge and /api/login from
 * different instances). The token carries the challenge and an HMAC over it;
 * tampering or expiry makes it unreadable. Each token is accepted once per
 * instance (`spend`); the signature it unlocks can only come from the owner's
 * wallet, and it expires after a few minutes.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface Challenge {
  tla: string;
  owner: string;
  payload: string;
  expiresAt: number;
}

const MAX_SPENT = 10_000;

export function challengeCodec(secret: Uint8Array) {
  const mac = (body: string) => createHmac("sha256", secret).update(`challenge:${body}`).digest("base64url");
  const spent = new Map<string, number>();

  return {
    encode(c: Challenge): string {
      const body = Buffer.from(JSON.stringify(c)).toString("base64url");
      return `${body}.${mac(body)}`;
    },

    /** The challenge, or null if the token is malformed, tampered with or expired. */
    read(token: unknown, now = Date.now()): Challenge | null {
      if (typeof token !== "string" || token.length > 4096) return null;
      const [body, sig, extra] = token.split(".");
      if (!body || !sig || extra !== undefined) return null;
      const want = Buffer.from(mac(body));
      const got = Buffer.from(sig);
      if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
      try {
        const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        if (typeof c?.tla !== "string" || typeof c?.owner !== "string" || typeof c?.payload !== "string" || typeof c?.expiresAt !== "number") return null;
        return c.expiresAt < now ? null : c;
      } catch {
        return null;
      }
    },

    /** Marks a token used. False if this instance has already accepted it. */
    spend(token: string, expiresAt: number, now = Date.now()): boolean {
      if (spent.has(token)) return false;
      for (const [t, exp] of spent) if (exp < now) spent.delete(t);
      for (const t of spent.keys()) {
        if (spent.size < MAX_SPENT) break;
        spent.delete(t);
      }
      spent.set(token, expiresAt);
      return true;
    },
  };
}
