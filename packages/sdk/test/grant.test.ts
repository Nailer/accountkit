import { describe, expect, it } from "vitest";
import { grantSpendTx, revokeSpendTx } from "../src/actions.js";
import { AccountKitError } from "../src/errors.js";

const TLA = "member.akclub.testnet";
const base = () => ({
  extension: "agent.testnet",
  receivers: ["shop.testnet"],
  budgetYocto: 500_000_000_000_000_000_000_000n,
  expiresAt: new Date(Date.now() + 3_600_000),
});

describe("grantSpendTx", () => {
  it("builds hos_grant_spend with 1 yoctoNEAR and a nanosecond expiry", () => {
    const g = base();
    const tx = grantSpendTx(TLA, g);
    const a = tx.actions[0]!.params;
    expect(tx.receiverId).toBe(TLA);
    expect(a.methodName).toBe("hos_grant_spend");
    expect(a.deposit).toBe("1");
    expect(a.args).toMatchObject({ extension: "agent.testnet", receivers: ["shop.testnet"], budget_yocto: "500000000000000000000000" });
    expect(a.args.expires_at).toBe((BigInt(g.expiresAt.getTime()) * 1_000_000n).toString());
  });

  const refused: [string, Partial<ReturnType<typeof base>>][] = [
    ["no receivers", { receivers: [] }],
    ["an invalid receiver", { receivers: ["Not Valid"] }],
    ["the account itself as receiver", { receivers: [TLA] }],
    ["a duplicate receiver", { receivers: ["shop.testnet", "shop.testnet"] }],
    ["the account as its own extension", { extension: TLA }],
    ["an invalid extension", { extension: "x" }],
    ["a negative budget", { budgetYocto: -1n }],
    ["an expiry in the past", { expiresAt: new Date(Date.now() - 1000) }],
    ["an invalid expiry", { expiresAt: new Date("nope") }],
  ];
  for (const [what, patch] of refused) {
    it(`refuses ${what} before anything is signed`, () => {
      let err: unknown;
      try {
        grantSpendTx(TLA, { ...base(), ...patch });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AccountKitError);
      expect((err as AccountKitError).code).toBe("INVALID_INPUT");
    });
  }

  it("accepts a budget given as a decimal string of yoctoNEAR", () => {
    expect(() => grantSpendTx(TLA, { ...base(), budgetYocto: "1000" })).not.toThrow();
  });

  it("refuses a budget that is not a whole number", () => {
    expect(() => grantSpendTx(TLA, { ...base(), budgetYocto: "0.5" })).toThrow(/not a whole number/);
  });
});

describe("revokeSpendTx", () => {
  it("calls hos_revoke_spend with 1 yoctoNEAR", () => {
    const a = revokeSpendTx(TLA, "agent.testnet").actions[0]!.params;
    expect(a).toMatchObject({ methodName: "hos_revoke_spend", deposit: "1", args: { extension: "agent.testnet" } });
  });
});
