import { describe, expect, it } from "vitest";
import { challengeCodec } from "../challenge.js";

const secret = new TextEncoder().encode("x".repeat(32));
const c = { tla: "a-member.akclub.testnet", owner: "a.testnet", payload: '{"challenge":"n"}', expiresAt: 2_000 };

describe("challenge tokens", () => {
  it("round-trips a challenge", () => {
    const codec = challengeCodec(secret);
    expect(codec.read(codec.encode(c), 1_000)).toEqual(c);
  });

  it("is readable by another instance with the same secret", () => {
    expect(challengeCodec(secret).read(challengeCodec(secret).encode(c), 1_000)).toEqual(c);
  });

  it("refuses an expired token", () => {
    const codec = challengeCodec(secret);
    expect(codec.read(codec.encode(c), 2_001)).toBeNull();
  });

  it("refuses a token signed with another secret", () => {
    const other = challengeCodec(new TextEncoder().encode("y".repeat(32)));
    expect(challengeCodec(secret).read(other.encode(c), 1_000)).toBeNull();
  });

  it("refuses a token whose challenge was edited", () => {
    const codec = challengeCodec(secret);
    const [, sig] = codec.encode(c).split(".");
    const forged = Buffer.from(JSON.stringify({ ...c, owner: "mallory.testnet" })).toString("base64url");
    expect(codec.read(`${forged}.${sig}`, 1_000)).toBeNull();
  });

  it("refuses garbage", () => {
    const codec = challengeCodec(secret);
    for (const t of [undefined, 42, "", "abc", "a.b.c", "a".repeat(5000)]) expect(codec.read(t, 1_000)).toBeNull();
  });

  it("accepts a token once per instance", () => {
    const codec = challengeCodec(secret);
    const t = codec.encode(c);
    expect(codec.spend(t, c.expiresAt, 1_000)).toBe(true);
    expect(codec.spend(t, c.expiresAt, 1_000)).toBe(false);
  });
});
