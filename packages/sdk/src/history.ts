/**
 * A leased name's history without running an indexer: who held it, what it
 * paid out and what it received. The account's receipts come from a public
 * indexer (NearBlocks API v3 by default); the new owner of each transfer is
 * read from the receipt itself on an archival RPC node. Nothing here signs.
 *
 * `classifyReceipts` is pure, so apps with their own indexer can feed it rows
 * directly.
 */
import { AccountKitError } from "./errors.js";

/** The fields of an indexer receipt row that AccountKit reads (NearBlocks v3 `accounts/{id}/receipts`). */
export interface IndexerReceipt {
  receipt_id: string;
  predecessor_account_id: string;
  receiver_account_id: string;
  transaction_hash: string;
  actions: { action: string; method?: string | null }[];
  /** Total NEAR attached to the receipt's actions, in yoctoNEAR. */
  actions_agg?: { deposit?: string | null };
  block: { block_timestamp: string };
  outcome: { status: boolean };
}

interface Base {
  /** Milliseconds since the UNIX epoch. */
  at: number;
  txHash: string;
  receiptId: string;
}

export type HistoryEvent =
  /** The account was created for its first owner (the rent). */
  | (Base & { kind: "created"; by: string })
  /** The NFT moved, and control of the account moved with it. `from` and `to` are filled in by `kit.history`. */
  | (Base & { kind: "ownership"; from?: string; to?: string; cause?: string })
  /** Spare NEAR the wallet sent back to the seller during a transfer. */
  | (Base & { kind: "sweep"; to: string; amountYocto: string })
  /** NEAR the account paid out (an owner or agent payment). */
  | (Base & { kind: "payout"; to: string; amountYocto: string })
  /** NEAR the account received. */
  | (Base & { kind: "received"; from: string; amountYocto: string })
  /** An extension (the owner or an agent) asked the account to act; `ok` is false when the wallet refused. */
  | (Base & { kind: "call"; by: string; ok: boolean });

export interface TlaHistory {
  name: string;
  /** Newest first. */
  events: HistoryEvent[];
  /** Owners in order, newest first, from the transfers in this window. */
  holders: { owner: string; since: number; txHash: string }[];
  totals: { paidOutYocto: string; receivedYocto: string; sweptYocto: string; refusedCalls: number; ownershipChanges: number };
  /** Where the receipts came from. */
  source: string;
  /** False when the indexer returned a full page: older events exist beyond this window. */
  complete: boolean;
}

const ms = (ns: string) => Number(BigInt(ns) / 1_000_000n);
const yocto = (r: IndexerReceipt) => {
  const d = r.actions_agg?.deposit;
  return d && /^\d+$/.test(d) ? d : "0";
};

/**
 * Turns an account's receipts into history events (newest first).
 * Gas refunds (`system`), the wallet's own callbacks and failed transfers are left out.
 */
export function classifyReceipts(name: string, rows: IndexerReceipt[]): HistoryEvent[] {
  const transferTxs = new Set(
    rows.filter((r) => r.receiver_account_id === name && r.outcome.status && r.actions.some((a) => a.method === "hos_transfer_ownership")).map((r) => r.transaction_hash),
  );
  const out: HistoryEvent[] = [];
  for (const r of rows) {
    const base = { at: ms(r.block.block_timestamp), txHash: r.transaction_hash, receiptId: r.receipt_id };
    const kinds = r.actions.map((a) => a.action);
    const method = r.actions.find((a) => a.method)?.method ?? null;
    const incoming = r.receiver_account_id === name;
    const fromSelf = r.predecessor_account_id === name;
    if (incoming && kinds.includes("CREATE_ACCOUNT")) {
      if (r.outcome.status) out.push({ ...base, kind: "created", by: r.predecessor_account_id });
    } else if (incoming && method === "hos_transfer_ownership") {
      if (r.outcome.status) out.push({ ...base, kind: "ownership" });
    } else if (incoming && method === "w_execute_extension") {
      out.push({ ...base, kind: "call", by: r.predecessor_account_id, ok: r.outcome.status });
    } else if (fromSelf && !incoming && kinds.length === 1 && kinds[0] === "TRANSFER") {
      if (!r.outcome.status) continue;
      out.push({ ...base, kind: transferTxs.has(r.transaction_hash) ? "sweep" : "payout", to: r.receiver_account_id, amountYocto: yocto(r) });
    } else if (incoming && !fromSelf && r.predecessor_account_id !== "system" && kinds.length === 1 && kinds[0] === "TRANSFER") {
      if (r.outcome.status) out.push({ ...base, kind: "received", from: r.predecessor_account_id, amountYocto: yocto(r) });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Totals and the holder list for a set of events. */
export function summarizeHistory(name: string, events: HistoryEvent[], source: string, complete: boolean): TlaHistory {
  const sum = (kind: "payout" | "received" | "sweep") => events.reduce((a, e) => (e.kind === kind ? a + BigInt(e.amountYocto) : a), 0n).toString();
  const holders = events.flatMap((e) => (e.kind === "ownership" && e.to ? [{ owner: e.to, since: e.at, txHash: e.txHash }] : []));
  return {
    name,
    events,
    holders,
    totals: {
      paidOutYocto: sum("payout"),
      receivedYocto: sum("received"),
      sweptYocto: sum("sweep"),
      refusedCalls: events.filter((e) => e.kind === "call" && !e.ok).length,
      ownershipChanges: events.filter((e) => e.kind === "ownership").length,
    },
    source,
    complete,
  };
}

export const DEFAULT_INDEXER: Record<string, string> = {
  mainnet: "https://api.nearblocks.io",
  testnet: "https://api-testnet.nearblocks.io",
};

export const DEFAULT_ARCHIVAL_RPC: Record<string, string[]> = {
  mainnet: ["https://archival-rpc.mainnet.fastnear.com"],
  testnet: ["https://archival-rpc.testnet.fastnear.com"],
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** One page of an account's receipts from a NearBlocks-v3-compatible indexer. */
export async function fetchReceipts(indexerUrl: string, name: string, limit: number, fetcher: Fetcher = (u, i) => fetch(u, i)): Promise<IndexerReceipt[]> {
  const url = `${indexerUrl.replace(/\/$/, "")}/v3/accounts/${encodeURIComponent(name)}/receipts?limit=${limit}`;
  let res: Response;
  try {
    res = await fetcher(url, { signal: AbortSignal.timeout(12_000) });
  } catch (e) {
    throw new AccountKitError("INDEXER_UNAVAILABLE", `the indexer at ${indexerUrl} did not answer`, e);
  }
  if (res.status === 429) throw new AccountKitError("INDEXER_UNAVAILABLE", `the indexer at ${indexerUrl} is rate-limiting; try again in a minute or pass an indexer of your own`);
  if (!res.ok) throw new AccountKitError("INDEXER_UNAVAILABLE", `the indexer at ${indexerUrl} answered ${res.status}`);
  const body = (await res.json()) as { data?: IndexerReceipt[] | null; errors?: { message: string }[] };
  if (!Array.isArray(body.data)) throw new AccountKitError("INDEXER_UNAVAILABLE", `the indexer at ${indexerUrl} answered without data: ${body.errors?.[0]?.message ?? "unknown error"}`);
  return body.data;
}

/** The arguments of a `hos_transfer_ownership` receipt: who the account went to, who asked, and why. */
export function ownershipArgs(receipt: unknown): { to?: string; from?: string; cause?: string } {
  try {
    const actions = (receipt as any)?.receipt?.Action?.actions ?? [];
    for (const a of actions) {
      const fc = a?.FunctionCall;
      if (fc?.method_name !== "hos_transfer_ownership") continue;
      const args = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(fc.args), (c) => c.charCodeAt(0))));
      return {
        to: typeof args.to === "string" ? args.to : undefined,
        from: typeof args.asked_by === "string" ? args.asked_by : undefined,
        cause: typeof args.cause === "string" ? args.cause : undefined,
      };
    }
  } catch {
    /* an unreadable receipt leaves the event without names */
  }
  return {};
}
