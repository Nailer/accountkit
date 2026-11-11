import { describe, expect, it } from "vitest";
import { parseTlaName } from "../src/kit.js";
import type { TlaInfo } from "../src/types.js";
import { verifyItem } from "../src/verify.js";
import { transferTx, grantSpendTx, executeTx, nearTransfer } from "../src/actions.js";

/** Shaped from a real mainnet read of ibuiltthisshit.bid on 11 Nov 2026 (see test/live.test.ts). */
function fixture(): TlaInfo {
  return {
    name: "ibuiltthisshit.bid",
    label: "ibuiltthisshit",
    tlaId: "bid",
    network: "mainnet",
    block: { hash: "x", height: 1, timestampNs: "1794000000000000000" },
    registrar: {
      council: "hos-root.sputnik-dao.near",
      wallet_impl: "impl.hos",
      hos_extension: "ext.hos",
      recovery: "rec.hos",
      chain_id: "mainnet",
      wallet_timeout_secs: 3600,
      registry: "registry.hos",
      config_epoch: 0,
    },
    registry: "registry.hos",
    token: { token_id: "ibuiltthisshit.bid", owner_id: "dizzy123.near" },
    record: null,
    item: {
      spec: "sharded-item-1.0.0",
      init: true,
      status: "Active",
      collection_id: "registry.hos",
      token_id: "ibuiltthisshit.bid",
      owner_id: "dizzy123.near",
      rotation_seq: "19",
      rotation_epoch: 4,
    },
    lease: {
      authority: "ext.hos",
      payout_account: "dizzy123.near",
      lease_until_ns: "1852836892871619592",
      state: "Active",
      frozen: "Unfrozen",
      impl_version: 7,
    },
    extensions: ["dizzy123.near", "ext.hos"],
    accessKeyCount: 0,
    account: { balanceYocto: "1", storageUsage: 333, globalContractAccountId: "impl.hos" },
    owner: "dizzy123.near",
  };
}

describe("parseTlaName", () => {
  it("splits label and TLA", () => {
    expect(parseTlaName("alice.club.testnet")).toEqual({ label: "alice", tlaId: "club.testnet" });
    expect(parseTlaName("X.bid")).toEqual({ label: "x", tlaId: "bid" });
  });
  it("rejects non-names", () => {
    for (const bad of ["bid", ".bid", "a..b", "a.", "ALICE BOB.near"]) {
      expect(() => parseTlaName(bad)).toThrow(/not a leased name/);
    }
  });
});

describe("verifyItem", () => {
  it("accepts a consistent, active leased name", () => {
    const r = verifyItem(fixture());
    expect(r.ok).toBe(true);
    expect(r.active).toBe(true);
    expect(r.owner).toBe("dizzy123.near");
  });

  it("refuses when the registry and the account disagree on the owner", () => {
    const f = fixture();
    f.token = { token_id: f.name, owner_id: "mallory.near" };
    const r = verifyItem(f);
    expect(r.ok).toBe(false);
    expect(r.owner).toBeNull();
    expect(r.checks.find((c) => c.id === "owners-agree")?.ok).toBe(false);
  });

  it("refuses an account that claims a different collection", () => {
    const f = fixture();
    f.item.collection_id = "fake-registry.near";
    expect(verifyItem(f).ok).toBe(false);
  });

  it("refuses an account that does not run the registrar's wallet code", () => {
    const f = fixture();
    f.account.globalContractAccountId = "lookalike.near";
    expect(verifyItem(f).ok).toBe(false);
  });

  it("refuses an account that still holds a key", () => {
    const f = fixture();
    f.accessKeyCount = 1;
    expect(verifyItem(f).ok).toBe(false);
  });

  it("marks an expired lease as verified but inactive", () => {
    const f = fixture();
    f.lease.lease_until_ns = "1700000000000000000";
    const r = verifyItem(f);
    expect(r.ok).toBe(true);
    expect(r.active).toBe(false);
  });
});

describe("transaction builders", () => {
  it("transfers through the registry's NEP-171 nft_transfer with 1 yoctoNEAR", () => {
    const tx = transferTx(fixture(), "carol.near");
    expect(tx.receiverId).toBe("registry.hos");
    expect(tx.actions[0]!.params.methodName).toBe("nft_transfer");
    expect(tx.actions[0]!.params.args).toEqual({ receiver_id: "carol.near", token_id: "ibuiltthisshit.bid", approval_id: null, memo: null });
    expect(tx.actions[0]!.params.deposit).toBe("1");
  });

  it("builds a spend grant with nanosecond expiry", () => {
    const tx = grantSpendTx("alice.club.testnet", {
      extension: "agent.testnet",
      receivers: ["shop.testnet"],
      budgetYocto: 5n * 10n ** 24n,
      expiresAt: new Date("2026-11-20T00:00:00Z"),
    });
    expect(tx.actions[0]!.params.args).toMatchObject({
      extension: "agent.testnet",
      budget_yocto: "5000000000000000000000000",
      expires_at: (BigInt(Date.parse("2026-11-20T00:00:00Z")) * 1_000_000n).toString(),
      tokens: [],
      items: [],
    });
  });

  it("wraps a transfer in the defuse-wallet request shape", () => {
    const tx = executeTx("alice.club.testnet", { external: [nearTransfer("shop.testnet", 2n)] });
    expect(tx.actions[0]!.params.args).toEqual({
      request: { external: [{ receiver_id: "shop.testnet", actions: [{ action: "transfer", payload: { amount: "2" } }] }] },
    });
  });
});
