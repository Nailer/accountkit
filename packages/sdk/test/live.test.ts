import { describe, expect, it } from "vitest";
import { AccountKit, verifyItem, resolveAuthorization } from "../src/index.js";

/**
 * Read-only checks against House of Stake's live mainnet deployment.
 * Free (view calls only). Run with: pnpm --filter @accountkit/sdk test:live
 */
const LIVE = process.env.LIVE === "1";
const NAME = process.env.TLA_NAME ?? "ibuiltthisshit.bid";

describe.skipIf(!LIVE)("mainnet (live, read-only)", () => {
  const kit = new AccountKit({ network: "mainnet" });

  it("resolves and verifies a real leased name", async () => {
    const info = await kit.resolve(NAME);
    expect(info.registry).toBe("registry.hos");
    const r = verifyItem(info);
    console.log(NAME, r.ok ? "VERIFIED" : "FAILED", "owner:", r.owner, "active:", r.active);
    for (const c of r.checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.id}: ${c.detail}`);
    expect(r.ok).toBe(true);
  });

  it("lists names an owner holds", async () => {
    const info = await kit.resolve(NAME);
    const names = await kit.namesOwnedBy(info.owner);
    expect(names).toContain(info.name);
  });

  it("refuses a sign-in from someone who is not the owner", async () => {
    const blob = JSON.stringify({ payload: "x", owner: "definitely-not-the-owner.near", authorization: "{}" });
    await expect(resolveAuthorization(kit, NAME, blob)).rejects.toThrow(/not an owner/);
  });

  it("reports a plain account as not a TLA", async () => {
    await expect(kit.resolve("wrap.near")).rejects.toMatchObject({ code: "NOT_A_TLA" });
  });
});
