import { base64 } from "@scure/base";
import { AccountKitError } from "./errors.js";
import { isValidAccountId } from "./names.js";
import type { TlaInfo } from "./types.js";

/**
 * Transaction builders. AccountKit never signs: each helper returns a
 * transaction in the shape NEAR Wallet Selector's `signAndSendTransaction`
 * accepts, so the user's own wallet signs it. Every method below exists in
 * tla-contracts @ d85860a (paths noted per helper).
 */

export const ONE_YOCTO = "1";
export const TGAS = 1_000_000_000_000n;

export interface FunctionCallAction {
  type: "FunctionCall";
  params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string };
}

export interface WalletTransaction {
  receiverId: string;
  actions: FunctionCallAction[];
}

function call(receiverId: string, methodName: string, args: Record<string, unknown>, tgas: bigint, deposit = ONE_YOCTO): WalletTransaction {
  return {
    receiverId,
    actions: [{ type: "FunctionCall", params: { methodName, args, gas: (tgas * TGAS).toString(), deposit } }],
  };
}

/* ---------- wallet `Request` (near/intents defuse-wallet, used by w_execute_extension) ---------- */

export type NearAction =
  | { action: "transfer"; payload: { amount: string } }
  | { action: "function_call"; payload: { function_name: string; args?: string; deposit?: string; gas?: string } };

export interface NearPromise {
  receiver_id: string;
  refund_to?: string;
  actions: NearAction[];
}

export type WalletOp =
  | { op: "add_extension"; payload: { account_id: string } }
  | { op: "remove_extension"; payload: { account_id: string } };

export interface WalletRequest {
  internal?: WalletOp[];
  external?: NearPromise[];
}

/** A NEAR transfer from the leased account to `receiverId`. */
export function nearTransfer(receiverId: string, amountYocto: string | bigint): NearPromise {
  return { receiver_id: receiverId, actions: [{ action: "transfer", payload: { amount: amountYocto.toString() } }] };
}

/** A function call made by the leased account. `args` is JSON-encoded, then base64 as the wallet expects. */
export function functionCall(
  receiverId: string,
  method: string,
  args: unknown,
  opts: { depositYocto?: string | bigint; tgas?: bigint } = {},
): NearPromise {
  const payload: { function_name: string; args?: string; deposit?: string; gas?: string } = {
    function_name: method,
    args: base64.encode(new TextEncoder().encode(JSON.stringify(args))),
  };
  if (opts.depositYocto && BigInt(opts.depositYocto) > 0n) payload.deposit = opts.depositYocto.toString();
  if (opts.tgas) payload.gas = (opts.tgas * TGAS).toString();
  return { receiver_id: receiverId, actions: [{ action: "function_call", payload }] };
}

/** An NEP-141 `ft_transfer` from the leased account (1 yoctoNEAR attached, as the standard requires). */
export function ftTransfer(token: string, receiverId: string, amount: string | bigint): NearPromise {
  return functionCall(token, "ft_transfer", { receiver_id: receiverId, amount: amount.toString() }, { depositYocto: 1n, tgas: 15n });
}

/* ---------- transactions the owner (or an extension) signs ---------- */

/**
 * Hand the name, its account and everything in it to `receiverId`.
 * Standard NEP-171 `nft_transfer` on the registry; the registry rotates the
 * wallet's owner extension in the same flow (tla-registry/src/nft.rs).
 * Signed by the current owner.
 */
export function transferTx(info: Pick<TlaInfo, "registry" | "name">, receiverId: string, memo?: string): WalletTransaction {
  return call(info.registry, "nft_transfer", { receiver_id: receiverId, token_id: info.name, approval_id: null, memo: memo ?? null }, 300n);
}

/**
 * Rent a new name under an open TLA (tla-registry `rent_sub_account`). The
 * caller becomes the owner. `depositYocto` must cover `get_rent_price().total_yocto`;
 * use `AccountKit.rentQuote()` to get it.
 */
export function rentTx(registry: string, tlaId: string, label: string, depositYocto: string | bigint): WalletTransaction {
  return call(registry, "rent_sub_account", { tla_id: tlaId, name: label }, 300n, depositYocto.toString());
}

/**
 * Make the leased account do something. Called by the owner or any enabled
 * extension (hos-wallet `w_execute_extension`); the wallet checks the caller.
 */
export function executeTx(tla: string, request: WalletRequest, tgas = 100n): WalletTransaction {
  return call(tla, "w_execute_extension", { request }, tgas);
}

/** Owner enables another account (an agent, a co-owner) as an extension of the leased account. */
export function addExtensionTx(tla: string, accountId: string): WalletTransaction {
  return executeTx(tla, { internal: [{ op: "add_extension", payload: { account_id: accountId } }] }, 40n);
}

export function removeExtensionTx(tla: string, accountId: string): WalletTransaction {
  return executeTx(tla, { internal: [{ op: "remove_extension", payload: { account_id: accountId } }] }, 40n);
}

export interface SpendGrantInput {
  /** The extension (agent) the grant applies to. It must already be enabled via `addExtensionTx`. */
  extension: string;
  /** Where value may land. At least one. */
  receivers: string[];
  /** NEAR the extension may move in total, in yoctoNEAR. */
  budgetYocto: string | bigint;
  /** Per-token budgets for NEP-141 tokens. */
  tokens?: { token: string; budget: string | bigint }[];
  /** NFT items the extension may move, per collection. */
  items?: { collection: string; token_ids: string[] }[];
  /** When the grant stops working. */
  expiresAt: Date;
}

/**
 * Owner sets an on-chain spending limit for an extension (hos-wallet
 * `hos_grant_spend`). The wallet enforces it: a spend outside the receivers,
 * over budget or after expiry fails on chain, whatever the agent decides.
 * Re-granting raises ceilings without resetting what was spent; revoke to reset.
 */
export function grantSpendTx(tla: string, g: SpendGrantInput): WalletTransaction {
  assertGrant(tla, g);
  return call(
    tla,
    "hos_grant_spend",
    {
      extension: g.extension,
      receivers: g.receivers,
      budget_yocto: g.budgetYocto.toString(),
      tokens: (g.tokens ?? []).map((t) => ({ token: t.token, budget: t.budget.toString() })),
      items: g.items ?? [],
      expires_at: (BigInt(g.expiresAt.getTime()) * 1_000_000n).toString(),
    },
    40n,
  );
}

/** Catches grants the wallet would refuse, before the owner signs (see hos-wallet assert_grantable). */
function assertGrant(tla: string, g: SpendGrantInput): void {
  const bad = (why: string) => {
    throw new AccountKitError("INVALID_INPUT", `spend grant for ${g.extension} on ${tla}: ${why}`);
  };
  if (!isValidAccountId(g.extension)) bad(`"${g.extension}" is not a valid account id`);
  if (g.extension === tla) bad("the account can't be its own extension");
  if (g.receivers.length === 0) bad("name at least one receiver");
  for (const r of g.receivers) {
    if (!isValidAccountId(r)) bad(`receiver "${r}" is not a valid account id`);
    if (r === tla) bad("a grant can't name the account itself as a receiver");
  }
  if (new Set(g.receivers).size !== g.receivers.length) bad("a receiver is listed twice");
  let budget: bigint;
  try {
    budget = BigInt(g.budgetYocto);
  } catch {
    return bad(`budget "${g.budgetYocto}" is not a whole number of yoctoNEAR`);
  }
  if (budget < 0n) bad("the budget can't be negative");
  if (Number.isNaN(g.expiresAt.getTime())) bad("the expiry is not a valid date");
  if (g.expiresAt.getTime() <= Date.now()) bad("the expiry is in the past");
}

export function revokeSpendTx(tla: string, extension: string): WalletTransaction {
  return call(tla, "hos_revoke_spend", { extension }, 40n);
}
