import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AccountKitError, classifyReceipts, fetchReceipts, ownershipArgs, summarizeHistory, type IndexerReceipt } from "../src/index.js";

// Real receipts of alice-member.akclub.testnet, read from NearBlocks v3 on 14 Nov 2026.
const NAME = "alice-member.akclub.testnet";
const rows = JSON.parse(readFileSync(new URL("./fixtures/history-receipts.json", import.meta.url), "utf8")) as IndexerReceipt[];

const row = (over: Partial<IndexerReceipt>): IndexerReceipt => ({
  receipt_id: "r1",
  predecessor_account_id: "someone.testnet",
  receiver_account_id: NAME,
  transaction_hash: "tx1",
  actions: [{ action: "TRANSFER", method: null }],
  actions_agg: { deposit: "5" },
  block: { block_timestamp: "1794559270146985759" },
  outcome: { status: true },
  ...over,
});

describe("classifyReceipts on real testnet receipts", () => {
  const events = classifyReceipts(NAME, rows);
  const h = summarizeHistory(NAME, events, "fixture", false);

  it("finds every ownership change", () => {
    expect(h.totals.ownershipChanges).toBe(17);
    expect(events.filter((e) => e.kind === "ownership").every((e) => e.txHash.length > 30)).toBe(true);
  });

  it("separates payouts from the sweep back to the seller", () => {
    const payouts = events.filter((e) => e.kind === "payout");
    const sweeps = events.filter((e) => e.kind === "sweep");
    // The agent's approved 0.2 NEAR payments to the shop are payouts...
    expect(payouts.some((e) => e.kind === "payout" && e.to === "ak-shop.testnet" && e.amountYocto === "200000000000000000000000")).toBe(true);
    // ...and NEAR leaving in the same transaction as a transfer is a sweep to the seller.
    expect(sweeps.length).toBeGreaterThan(5);
    expect(sweeps.every((e) => e.kind === "sweep" && e.to !== "ak-shop.testnet")).toBe(true);
    expect(BigInt(h.totals.paidOutYocto) + BigInt(h.totals.sweptYocto)).toBe(
      rows.filter((r) => r.predecessor_account_id === NAME && r.actions[0]!.action === "TRANSFER").reduce((a, r) => a + BigInt(r.actions_agg!.deposit!), 0n),
    );
  });

  it("counts what the account received", () => {
    expect(events.some((e) => e.kind === "received" && e.from === "ak-alice.testnet" && e.amountYocto === "800000000000000000000000")).toBe(true);
    expect(BigInt(h.totals.receivedYocto)).toBeGreaterThanOrEqual(800000000000000000000000n);
  });

  it("records calls the wallet refused", () => {
    expect(h.totals.refusedCalls).toBe(6);
    expect(events.filter((e) => e.kind === "call" && e.ok).length).toBe(4);
  });

  it("is newest first", () => {
    for (let i = 1; i < events.length; i++) expect(events[i - 1]!.at).toBeGreaterThanOrEqual(events[i]!.at);
  });
});

describe("classifyReceipts edge cases", () => {
  it("ignores gas refunds, failed transfers and the wallet's own callbacks", () => {
    const events = classifyReceipts(NAME, [
      row({ predecessor_account_id: "system" }),
      row({ receipt_id: "r2", outcome: { status: false } }),
      row({ receipt_id: "r3", predecessor_account_id: NAME, actions: [{ action: "FUNCTION_CALL", method: "hos_resolve_sweep" }] }),
    ]);
    expect(events).toEqual([]);
  });

  it("treats the rent as creation, not income", () => {
    const [e] = classifyReceipts(NAME, [row({ predecessor_account_id: "registry.akclub.testnet", actions: [{ action: "CREATE_ACCOUNT" }, { action: "TRANSFER" }] })]);
    expect(e).toMatchObject({ kind: "created", by: "registry.akclub.testnet" });
  });

  it("reads a missing or malformed deposit as zero", () => {
    const [e] = classifyReceipts(NAME, [row({ actions_agg: { deposit: null } })]);
    expect(e).toMatchObject({ kind: "received", amountYocto: "0" });
  });

  it("lists holders from named transfers, newest first", () => {
    const events = classifyReceipts(NAME, [
      row({ receipt_id: "a", transaction_hash: "t1", predecessor_account_id: "ext.akclub.testnet", actions: [{ action: "FUNCTION_CALL", method: "hos_transfer_ownership" }], block: { block_timestamp: "1000000000" } }),
      row({ receipt_id: "b", transaction_hash: "t2", predecessor_account_id: "ext.akclub.testnet", actions: [{ action: "FUNCTION_CALL", method: "hos_transfer_ownership" }], block: { block_timestamp: "2000000000" } }),
    ]);
    Object.assign(events[0]!, { to: "bob.testnet", from: "alice.testnet" });
    Object.assign(events[1]!, { to: "alice.testnet" });
    expect(summarizeHistory(NAME, events, "x", true).holders.map((x) => x.owner)).toEqual(["bob.testnet", "alice.testnet"]);
  });
});

describe("ownershipArgs", () => {
  it("decodes who the account went to from an archival receipt", () => {
    const args = btoa(JSON.stringify({ to: "ak-alice.testnet", cause: "Transfer", asked_by: "ak-bob.testnet" }));
    const receipt = { receipt: { Action: { actions: [{ FunctionCall: { method_name: "hos_transfer_ownership", args } }] } } };
    expect(ownershipArgs(receipt)).toEqual({ to: "ak-alice.testnet", from: "ak-bob.testnet", cause: "Transfer" });
  });
  it("returns nothing for other receipts or garbage", () => {
    expect(ownershipArgs({ receipt: { Action: { actions: [{ Transfer: { deposit: "1" } }] } } })).toEqual({});
    expect(ownershipArgs(null)).toEqual({});
  });
});

describe("fetchReceipts", () => {
  const ok = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
  it("asks the v3 receipts endpoint and returns the rows", async () => {
    let asked = "";
    const out = await fetchReceipts("https://indexer.example/", NAME, 50, async (u) => {
      asked = u;
      return new Response(JSON.stringify({ data: rows.slice(0, 2) }));
    });
    expect(asked).toBe(`https://indexer.example/v3/accounts/${NAME}/receipts?limit=50`);
    expect(out).toHaveLength(2);
  });
  it("turns rate limits, errors and empty answers into INDEXER_UNAVAILABLE", async () => {
    for (const f of [ok({}, 429), ok({}, 500), ok({ data: null, errors: [{ message: "retired" }] }), async () => Promise.reject(new Error("offline"))]) {
      const err = await fetchReceipts("https://indexer.example", NAME, 10, f as any).catch((e) => e);
      expect(err).toBeInstanceOf(AccountKitError);
      expect(err.code).toBe("INDEXER_UNAVAILABLE");
    }
  });
});
