import { Buffer } from "buffer";
import { setupWalletSelector, type Wallet, type WalletSelector } from "@near-wallet-selector/core";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import type { WalletTransaction } from "@accountkit/sdk";

// Browser wallets (MyNearWallet) call Buffer.from on the NEP-413 nonce.
(globalThis as any).Buffer ??= Buffer;

let selectorPromise: Promise<WalletSelector> | null = null;

export function getSelector(network: string): Promise<WalletSelector> {
  selectorPromise ??= setupWalletSelector({
    network: network as "mainnet" | "testnet",
    modules: [setupMyNearWallet(), setupMeteorWallet()],
  });
  return selectorPromise;
}

export const WALLETS = [
  { id: "my-near-wallet", label: "MyNearWallet" },
  { id: "meteor-wallet", label: "Meteor Wallet" },
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

export async function disconnect(network: string) {
  const w = await currentWallet(network);
  await w?.wallet.signOut();
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

/** Hands an AccountKit transaction to the connected wallet to sign and send. */
export async function signAndSend(network: string, tx: WalletTransaction) {
  const w = await currentWallet(network);
  if (!w) throw new Error("connect a wallet first");
  return w.wallet.signAndSendTransaction({ receiverId: tx.receiverId, actions: tx.actions as any });
}

/** Several transactions in one wallet prompt (e.g. enable the agent, then grant it a budget). */
export async function signAndSendMany(network: string, txs: WalletTransaction[]) {
  const w = await currentWallet(network);
  if (!w) throw new Error("connect a wallet first");
  return w.wallet.signAndSendTransactions({ transactions: txs.map((t) => ({ receiverId: t.receiverId, actions: t.actions as any })) });
}

/** A plain NEAR transfer from the connected wallet (used to fund the membership account). */
export async function sendNear(network: string, receiverId: string, yocto: string) {
  const w = await currentWallet(network);
  if (!w) throw new Error("connect a wallet first");
  return w.wallet.signAndSendTransaction({ receiverId, actions: [{ type: "Transfer", params: { deposit: yocto } }] as any });
}
