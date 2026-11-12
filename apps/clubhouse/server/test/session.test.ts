import { describe, expect, it } from "vitest";
import { sessionCodec } from "../session.js";

const codec = sessionCodec(new Uint8Array(32).fill(7));
const other = sessionCodec(new Uint8Array(32).fill(8));
const s = { tla: "alice-member.akclub.testnet", owner: "ak-alice.testnet", exp: Date.now() + 60_000 };
const cookie = (v: string) => `theme=dark; ck_session=${v}; other=1`;

describe("session cookies", () => {
  it("round-trips a session among other cookies", () => {
    expect(codec.read(cookie(codec.encode(s)))).toEqual(s);
  });

  it("rejects a cookie signed with another secret", () => {
    expect(codec.read(cookie(other.encode(s)))).toBeNull();
  });

  it("rejects a tampered body", () => {
    const [, mac] = codec.encode(s).split(".");
    const forged = Buffer.from(JSON.stringify({ ...s, owner: "mallory.testnet" })).toString("base64url");
    expect(codec.read(cookie(`${forged}.${mac}`))).toBeNull();
  });

  it("rejects an expired session", () => {
    expect(codec.read(cookie(codec.encode({ ...s, exp: Date.now() - 1 })))).toBeNull();
  });

  it("rejects malformed values without throwing", () => {
    for (const v of ["", "abc", "a.b.c", ".", "x."]) expect(codec.read(cookie(v))).toBeNull();
    expect(codec.read(undefined)).toBeNull();
  });

  it("rejects a validly signed body with the wrong shape", () => {
    const evil = sessionCodec(new Uint8Array(32).fill(7));
    const body = Buffer.from(JSON.stringify({ tla: 1 })).toString("base64url");
    const mac = evil.encode(s).split(".")[1]; // a MAC for a different body
    expect(codec.read(cookie(`${body}.${mac}`))).toBeNull();
  });
});
