import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base64 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { BorshWriter } from "../src/borsh.js";
import {
  buildAuthorization,
  createSignInRequest,
  nep413Hash,
  nep413Recipient,
  offchainMessageHash,
} from "../src/auth.js";

describe("borsh", () => {
  it("encodes strings with a u32 little-endian length prefix", () => {
    expect(Array.from(new BorshWriter().string("ab").bytes())).toEqual([2, 0, 0, 0, 97, 98]);
  });
  it("encodes u64 little-endian and options", () => {
    expect(Array.from(new BorshWriter().u64(258n).bytes())).toEqual([2, 1, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(new BorshWriter().optionString(null).bytes())).toEqual([0]);
    expect(Array.from(new BorshWriter().optionString("a").bytes())).toEqual([1, 1, 0, 0, 0, 97]);
  });
});

describe("NEP-641 envelope", () => {
  const msg = {
    chain_id: "mainnet",
    signer_id: "extension.near",
    path: ["wallet.near", "v1.signer"],
    timestamp: "2026-08-05T07:28:00.123456789Z",
    payload: "hi",
  };

  it("formats the NEP-413 recipient exactly as the standard's example", () => {
    expect(nep413Recipient(msg)).toBe("mainnet: extension.near -> wallet.near -> v1.signer @ 2026-08-05T07:28:00Z");
  });

  it("hashes to 32 bytes and binds every field", () => {
    const h = offchainMessageHash(msg);
    expect(h.length).toBe(32);
    for (const change of [{ chain_id: "testnet" }, { signer_id: "x.near" }, { path: [] }, { timestamp: "2026-08-05T07:28:00.123456788Z" }, { payload: "ho" }]) {
      expect(offchainMessageHash({ ...msg, ...change })).not.toEqual(h);
    }
  });
});

describe("sign-in request round trip", () => {
  it("produces an authorization whose inner NEP-413 signature verifies", () => {
    const sk = ed25519.utils.randomSecretKey();
    const pk = ed25519.getPublicKey(sk);
    const publicKey = `ed25519:${base58.encode(pk)}`;

    const req = createSignInRequest({
      tla: "alice.club.testnet",
      owner: "bob.testnet",
      chainId: "testnet",
      payload: { domain: "clubhouse", action: "Login", msg: "nonce-123" },
      timestamp: new Date("2026-11-11T00:00:00Z"),
    });
    expect(req.offchainMessage.path).toEqual(["alice.club.testnet"]);
    expect(req.nep413.recipient).toBe("testnet: bob.testnet -> alice.club.testnet @ 2026-11-11T00:00:00Z");

    // What a wallet's signMessage does: sign the NEP-413 hash, return base64.
    const sig = ed25519.sign(nep413Hash(req.nep413.message, req.nep413.nonce, req.nep413.recipient), sk);
    const blob = JSON.parse(buildAuthorization(req, { publicKey, signature: base64.encode(sig) }));

    expect(blob.owner).toBe("bob.testnet");
    expect(blob.payload).toBe(req.payload);
    const inner = JSON.parse(blob.authorization);
    expect(inner.access_key).toBe(publicKey);
    expect(inner.via).toEqual({ schema: "nep413" });

    const check = nep413Hash(inner.msg.payload, offchainMessageHash(inner.msg), nep413Recipient(inner.msg));
    expect(ed25519.verify(base58.decode(inner.signature.slice(8)), check, pk)).toBe(true);
  });
});
