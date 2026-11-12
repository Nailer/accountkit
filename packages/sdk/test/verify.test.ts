import { describe, expect, it } from "vitest";
import { parseTlaName } from "../src/names.js";
import { fixture } from "./fixture.js";
import { verifyItem } from "../src/verify.js";
import { transferTx, grantSpendTx, executeTx, nearTransfer } from "../src/actions.js";

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

describe("verifyItem: each check can fail on its own", () => {
  const failing = (mutate: (i: ReturnType<typeof fixture>) => void) => {
    const info = fixture();
    mutate(info);
    const v = verifyItem(info);
    return { v, failed: v.checks.filter((c) => !c.ok).map((c) => c.id) };
  };

  it("names exactly one failed check for a frozen lease, and keeps the record ok", () => {
    const { v, failed } = failing((i) => {
      i.lease.frozen = "SelfFrozen";
    });
    expect(failed).toEqual(["not-frozen"]);
    expect(v.ok).toBe(true);
    expect(v.active).toBe(false);
  });

  it("marks a retired item inactive", () => {
    const { failed, v } = failing((i) => {
      i.item.status = "Retired";
    });
    expect(failed).toContain("item-active");
    expect(v.active).toBe(false);
  });

  it("refuses an owner who isn't an extension of the account", () => {
    const { failed, v } = failing((i) => {
      i.extensions = ["ext.hos"];
    });
    expect(failed).toEqual(["owner-is-extension"]);
    expect(v.ok).toBe(false);
  });

  it("refuses a lease authority other than House of Stake's extension", () => {
    const { failed } = failing((i) => {
      i.lease.authority = "someone-else.near";
    });
    expect(failed).toEqual(["authority-is-hos-extension"]);
  });

  it("refuses a name the registry doesn't know", () => {
    const { failed, v } = failing((i) => {
      i.token = null;
    });
    expect(failed).toContain("registry-has-token");
    expect(v.ok).toBe(false);
  });

  it("returns all 13 checks with stable ids, in order", () => {
    expect(verifyItem(fixture()).checks.map((c) => c.id)).toEqual([
      "registry-has-token",
      "item-spec",
      "item-names-collection",
      "item-names-itself",
      "owners-agree",
      "runs-registrar-wallet",
      "authority-is-hos-extension",
      "owner-is-extension",
      "no-access-keys",
      "item-active",
      "lease-active",
      "not-frozen",
      "lease-not-expired",
    ]);
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
    const expiresAt = new Date(Date.now() + 86_400_000);
    const tx = grantSpendTx("alice.club.testnet", {
      extension: "agent.testnet",
      receivers: ["shop.testnet"],
      budgetYocto: 5n * 10n ** 24n,
      expiresAt,
    });
    expect(tx.actions[0]!.params.args).toMatchObject({
      extension: "agent.testnet",
      budget_yocto: "5000000000000000000000000",
      expires_at: (BigInt(expiresAt.getTime()) * 1_000_000n).toString(),
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
