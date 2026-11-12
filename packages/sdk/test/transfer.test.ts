import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountKitError } from "../src/errors.js";
import { AccountKit } from "../src/kit.js";
import type { TlaInfo } from "../src/types.js";
import { fixture } from "./fixture.js";

/** A kit whose chain reads are stubbed: the fixture name, and a set of existing accounts. */
function kitWith(info: TlaInfo, existing: string[]) {
  const kit = new AccountKit({ network: "mainnet", rpcUrls: ["https://unused"] });
  vi.spyOn(kit, "resolve").mockResolvedValue(info);
  vi.spyOn(kit.rpc, "viewAccount").mockImplementation(async (id: string) => {
    if (!existing.includes(id)) throw new AccountKitError("NOT_FOUND", `UNKNOWN_ACCOUNT ${id}`);
    return { amount: "1", locked: "0", storageUsage: 1, codeHash: "11111111111111111111111111111111" };
  });
  return kit;
}

const NAME = "ibuiltthisshit.bid";
const OWNER = "dizzy123.near";

afterEach(() => vi.restoreAllMocks());

describe("prepareTransfer", () => {
  it("builds nft_transfer to an existing receiver", async () => {
    const tx = await kitWith(fixture(), ["bob.near"]).prepareTransfer(NAME, OWNER, "bob.near");
    expect(tx.receiverId).toBe("registry.hos");
    expect(tx.actions[0]?.params.methodName).toBe("nft_transfer");
    expect(tx.actions[0]?.params.args).toMatchObject({ receiver_id: "bob.near", token_id: NAME });
  });

  it("normalises the receiver's case and spaces", async () => {
    const tx = await kitWith(fixture(), ["bob.near"]).prepareTransfer(NAME, OWNER, "  Bob.NEAR ");
    expect(tx.actions[0]?.params.args).toMatchObject({ receiver_id: "bob.near" });
  });

  const refusals: [string, string, string, string][] = [
    ["a receiver that doesn't exist", OWNER, "ghost.near", "NOT_FOUND"],
    ["a caller who isn't the owner", "mallory.near", "bob.near", "WRONG_OWNER"],
    ["a transfer to the current owner", OWNER, OWNER, "WRONG_OWNER"],
    ["an invalid account id", OWNER, "not an account", "INVALID_NAME"],
    ["the membership account itself", OWNER, NAME, "INVALID_NAME"],
    ["the registry", OWNER, "registry.hos", "INVALID_NAME"],
    ["the lease authority", OWNER, "ext.hos", "INVALID_NAME"],
  ];
  for (const [what, from, to, code] of refusals) {
    it(`refuses ${what} (${code})`, async () => {
      const kit = kitWith(fixture(), ["bob.near", OWNER, NAME, "registry.hos", "ext.hos", "mallory.near"]);
      const err = await kit.prepareTransfer(NAME, from, to).catch((e) => e);
      expect(err).toBeInstanceOf(AccountKitError);
      expect(err.code).toBe(code);
    });
  }

  it("refuses a name whose lease has expired", async () => {
    const info = fixture();
    info.lease.lease_until_ns = "1";
    const err = await kitWith(info, ["bob.near"]).prepareTransfer(NAME, OWNER, "bob.near").catch((e) => e);
    expect(err.code).toBe("LEASE_EXPIRED");
  });

  it("refuses a name that fails verification", async () => {
    const info = fixture();
    info.accessKeyCount = 1;
    const err = await kitWith(info, ["bob.near"]).prepareTransfer(NAME, OWNER, "bob.near").catch((e) => e);
    expect(err.code).toBe("NOT_A_TLA");
  });
});
