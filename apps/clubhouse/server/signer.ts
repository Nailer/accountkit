/**
 * Server-side signing for TEST accounts only (the e2e script and the demo
 * agent). Keys come from the local NEAR CLI keychain
 * (~/.near-credentials/<network>/<account>.json); nothing is hard-coded.
 * The browser app never uses this: real users sign with their own wallet.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, actions } from "near-api-js-v7";
import type { WalletTransaction } from "@accountkit/sdk";

export function loadKey(network: string, accountId: string): string {
  const path = join(process.env.NEAR_CREDENTIALS_DIR ?? join(homedir(), ".near-credentials"), network, `${accountId}.json`);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw.private_key !== "string") throw new Error(`no private_key in ${path}`);
  return raw.private_key;
}

export function testAccount(network: string, rpcUrl: string, accountId: string): Account {
  return new Account(accountId, rpcUrl, loadKey(network, accountId) as any);
}

export interface SentTx {
  hash: string;
  ok: boolean;
  failure?: string;
}

/** Sends an AccountKit WalletTransaction (one function call) and reports success or the contract's refusal. */
export async function sendTx(account: Account, tx: WalletTransaction): Promise<SentTx> {
  const a = tx.actions[0]!;
  let res: any;
  try {
    // throwOnFailure: false keeps the outcome (and its hash) when the
    // contract refuses: a refused transaction is still on chain, as proof.
    res = await account.signAndSendTransaction({
      receiverId: tx.receiverId,
      actions: [
        actions.functionCall(
          a.params.methodName,
          new TextEncoder().encode(JSON.stringify(a.params.args)),
          BigInt(a.params.gas),
          BigInt(a.params.deposit),
        ),
      ],
      waitUntil: "FINAL",
      throwOnFailure: false,
    } as any);
  } catch (e: any) {
    const hash = e?.context?.transactionHash ?? e?.transactionHash ?? e?.txHash ?? "?";
    return { hash, ok: false, failure: String(e?.message ?? e) };
  }
  const hash = res?.transaction?.hash ?? res?.transaction_outcome?.id ?? "?";
  const failures: string[] = [];
  const status = res?.status;
  if (status && typeof status === "object" && "Failure" in status) failures.push(JSON.stringify(status.Failure));
  for (const r of res?.receipts_outcome ?? []) {
    const s = r?.outcome?.status;
    if (s && typeof s === "object" && "Failure" in s) failures.push(JSON.stringify(s.Failure));
  }
  return failures.length ? { hash, ok: false, failure: failures.join(" | ") } : { hash, ok: true };
}
