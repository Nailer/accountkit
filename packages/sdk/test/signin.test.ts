import { describe, expect, it } from "vitest";
import { createSignInRequest } from "../src/auth.js";

const base = { tla: "alice-member.akclub.testnet", owner: "ak-alice.testnet", chainId: "testnet" };

describe("createSignInRequest", () => {
  it("signs over the server's exact payload and names the membership in the path", () => {
    const payload = { domain: "Clubhouse", action: "Login", msg: '{"challenge":"c1"}' };
    const r = createSignInRequest({ ...base, payload });
    expect(r.payload).toBe(JSON.stringify(payload));
    expect(r.nep413.message).toBe(r.payload);
    expect(r.offchainMessage).toMatchObject({ chain_id: "testnet", signer_id: "ak-alice.testnet", path: ["alice-member.akclub.testnet"] });
  });

  it("derives a 32-byte nonce from the whole message", () => {
    const t = new Date("2026-11-12T10:00:00Z");
    const a = createSignInRequest({ ...base, payload: "x", timestamp: t });
    const b = createSignInRequest({ ...base, payload: "x", timestamp: t });
    const c = createSignInRequest({ ...base, payload: "y", timestamp: t });
    const d = createSignInRequest({ ...base, owner: "ak-bob.testnet", payload: "x", timestamp: t });
    expect(a.nep413.nonce).toHaveLength(32);
    expect(a.nep413.nonce).toEqual(b.nep413.nonce);
    expect(a.nep413.nonce).not.toEqual(c.nep413.nonce);
    expect(a.nep413.nonce).not.toEqual(d.nep413.nonce);
  });

  it("back-dates the timestamp 60 s by default and drops milliseconds", () => {
    const before = Date.now();
    const r = createSignInRequest({ ...base, payload: "x" });
    const ts = Date.parse(r.offchainMessage.timestamp);
    expect(r.offchainMessage.timestamp).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(before - ts).toBeGreaterThanOrEqual(59_000);
    expect(before - ts).toBeLessThan(62_000);
  });

  it("binds the recipient to the chain and the signer", () => {
    const main = createSignInRequest({ ...base, chainId: "mainnet", payload: "x" });
    const test = createSignInRequest({ ...base, payload: "x" });
    expect(main.nep413.recipient).not.toBe(test.nep413.recipient);
  });
});
