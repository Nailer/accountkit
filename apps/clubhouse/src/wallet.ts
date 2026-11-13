// biome-ignore lint/style/useNodejsImportProtocol: the npm "buffer" polyfill for browsers, not Node's module
import { Buffer } from "buffer";
import { setupWalletSelector, type Wallet, type WalletSelector } from "@near-wallet-selector/core";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupSender } from "@near-wallet-selector/sender";
import type { WalletTransaction } from "@accountkit/sdk";

// Some browser wallets call Buffer.from on the NEP-413 nonce.
(globalThis as any).Buffer ??= Buffer;

let selectorPromise: Promise<WalletSelector> | null = null;

export function getSelector(network: string): Promise<WalletSelector> {
  selectorPromise ??= setupWalletSelector({
    network: network as "mainnet" | "testnet",
    // MyNearWallet stopped accepting new app connections in 2026, so it is not offered.
    modules: [setupMeteorWallet(), setupIntearWallet(), setupHereWallet(), setupSender()],
  });
  return selectorPromise;
}

export const WALLETS = [
  { id: "meteor-wallet", label: "Meteor Wallet", kind: "Web or extension" },
  { id: "intear-wallet", label: "Intear Wallet", kind: "Web" },
  { id: "here-wallet", label: "HERE Wallet", kind: "Mobile or web" },
  { id: "sender", label: "Sender", kind: "Browser extension" },
] as const;

export async function connect(network: string, walletId: string): Promise<string> {
  const selector = await getSelector(network);
  const wallet = await selector.wallet(walletId);
  const accounts = await wallet.signIn({ contractId: undefined as any, methodNames: [] } as any);
  const id = accounts[0]?.accountId ?? (await wallet.getAccounts())[0]?.accountId;
  if (!id) throw new Error("the wallet did not return an account");
  return id;
}

export async function currentWallet(network: string): Promise<{ wallet: Wallet; accountId: string } | null> {
  const selector = await getSelector(network);
  if (!selector.isSignedIn()) return null;
  const wallet = await selector.wallet();
  const accountId = (await wallet.getAccounts())[0]?.accountId;
  return accountId ? { wallet, accountId } : null;
}

/**
 * Signs out of the wallet. Some wallets never answer signOut (a closed popup,
 * a locked extension), so after 5 seconds this forgets the session locally
 * instead of leaving the page stuck on "Disconnecting".
 */
export async function disconnect(network: string) {
  const w = await currentWallet(network);
  if (!w) return;
  const answered = await Promise.race([
    w.wallet.signOut().then(() => true, () => false),
    new Promise<boolean>((res) => setTimeout(() => res(false), 5000)),
  ]);
  if (answered) return;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("near-wallet-selector:")) localStorage.removeItem(k);
  } catch {
    /* storage blocked: nothing stored to forget */
  }
  selectorPromise = null;
}

/** NEP-413 signMessage. Returns the signer's public key and base64 signature. */
export async function signMessage(network: string, p: { message: string; recipient: string; nonce: Uint8Array }) {
  const w = await currentWallet(network);
  if (!w) throw new Error("connect a wallet first");
  if (!w.wallet.signMessage) throw new Error("this wallet cannot sign messages (NEP-413)");
  const res = await w.wallet.signMessage({ message: p.message, recipient: p.recipient, nonce: Buffer.from(p.nonce) });
  if (!res) throw new Error("the wallet did not return a signature");
  return { accountId: res.accountId, publicKey: res.publicKey, signature: res.signature };
}

/**
 * wallet-selector 10 takes near-api-js style actions ({ functionCall: {...} })
 * and rejects the older { type, params } shape with "Unsupported NAJ action".
 * AccountKit returns { type, params } (readable, JSON-safe), so convert here.
 */
export function toNajActions(actions: { type: string; params: Record<string, any> }[]) {
  return actions.map((a) => {
    if (a.type === "FunctionCall") {
      const { methodName, args, gas, deposit } = a.params;
      return { functionCall: { methodName, args: new TextEncoder().encode(JSON.stringify(args ?? {})), gas: BigInt(gas), deposit: BigInt(deposit) } };
    }
    if (a.type === "Transfer") return { transfer: { deposit: BigInt(a.params.deposit) } };
    throw new Error(`unsupported action ${a.type}`);
  });
}

/** Hands an AccountKit transaction to the connected wallet to sign and send. */
export async function signAndSend(network: string, tx: WalletTransaction) {
  const w = await currentWallet(network);
  if (!w) throw new Error("connect a wallet first");
  return w.wallet.signAndSendTransaction({ receiverId: tx.receiverId, actions: toNajActions(tx.actions) as any });
}

/** Several transactions in one wallet prompt (e.g. enable the agent, then grant it a budget). */
export async function signAndSendMany(network: string, txs: WalletTransaction[]) {
  const w = await currentWallet(network);
  if (!w) throw new Error("connect a wallet first");
  return w.wallet.signAndSendTransactions({ transactions: txs.map((t) => ({ receiverId: t.receiverId, actions: toNajActions(t.actions) as any })) });
}

/** A plain NEAR transfer from the connected wallet (used to fund the membership account). */
export async function sendNear(network: string, receiverId: string, yocto: string) {
  const w = await currentWallet(network);
  if (!w) throw new Error("connect a wallet first");
  return w.wallet.signAndSendTransaction({ receiverId, actions: toNajActions([{ type: "Transfer", params: { deposit: yocto } }]) as any });
}
