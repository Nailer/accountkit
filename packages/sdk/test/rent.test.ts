import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountKitError } from "../src/errors.js";
import { AccountKit } from "../src/kit.js";

const PRICE = 1_491_000_000_000_000_000_000_000n; // 1.491 NEAR
const MARGIN = 100_000_000_000_000_000_000_000n; // 0.1 NEAR, as House of Stake's tests use

function kitFor(available: boolean) {
  const kit = new AccountKit({ network: "testnet", rpcUrls: ["https://unused"] });
  vi.spyOn(kit, "registrarConfig").mockResolvedValue({ registry: "registry.akclub.testnet" } as never);
  const view = vi.spyOn(kit.rpc, "view").mockImplementation(async (_acc: string, method: string) => {
    if (method === "is_name_available") return available;
    if (method === "get_rent_price") return { total_yocto: PRICE.toString() };
    throw new Error(`unexpected view ${method}`);
  });
  return { kit, view };
}

afterEach(() => vi.restoreAllMocks());

describe("rentQuote", () => {
  it("prices the name and builds rent_sub_account with a 0.1 NEAR margin", async () => {
    const { kit, view } = kitFor(true);
    const q = await kit.rentQuote("akclub.testnet", "yourname-member");
    expect(q).toMatchObject({ name: "yourname-member.akclub.testnet", available: true, totalYocto: PRICE.toString() });
    expect(q.tx.receiverId).toBe("registry.akclub.testnet");
    expect(q.tx.actions[0]?.params).toMatchObject({
      methodName: "rent_sub_account",
      args: { tla_id: "akclub.testnet", name: "yourname-member" },
      deposit: (PRICE + MARGIN).toString(),
    });
    expect(view).toHaveBeenCalledWith("registry.akclub.testnet", "is_name_available", { tla_id: "akclub.testnet", name: "yourname-member" });
  });

  it("reports a taken name as unavailable", async () => {
    const { kit } = kitFor(false);
    expect((await kit.rentQuote("akclub.testnet", "alice-member")).available).toBe(false);
  });

  it("refuses an invalid label before any read", async () => {
    const { kit, view } = kitFor(true);
    const err = await kit.rentQuote("akclub.testnet", "Not Valid!").catch((e) => e);
    expect(err).toBeInstanceOf(AccountKitError);
    expect(err.code).toBe("INVALID_NAME");
    expect(view).not.toHaveBeenCalled();
  });
});
