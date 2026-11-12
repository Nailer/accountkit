import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { base58, base64, hex } from "@scure/base";
import { BorshWriter, concatBytes } from "./borsh.js";
import { AccountKitError } from "./errors.js";
import type { AccountKit } from "./kit.js";
import type { AccessKeyView, BlockRef } from "./rpc.js";
import { verifyItem } from "./verify.js";

/**
 * NEP-641 (Offchain Authorizations, Final since 2026-08) lets a keyless
 * account prove "I authorize this payload" with a view call instead of a
 * signature. A House of Stake leased account answers `w_resolve_auth` by
 * delegating to its owner account, which then proves itself with an ordinary
 * NEP-413 wallet signature. This module builds that request on the client and
 * resolves it on the server, entirely offchain: no transaction, no gas.
 */

const NEP641_DOMAIN = new TextEncoder().encode("NEAR_NEP641_OFFCHAIN_MESSAGE/V1");
const NEP413_TAG = 2 ** 31 + 413;
const MAX_DEPTH = 4;
const MAX_SUB_AUTHORIZATIONS = 16;

/** NEP-641 `OffchainMessage`. `timestamp` is an RFC-3339 string on the wire, u64 nanoseconds in Borsh. */
export interface OffchainMessage {
  chain_id: string;
  signer_id: string;
  path?: string[];
  timestamp: string;
  payload: string;
}

/** NEP-641 recommended payload shape. */
export interface JsonPayload {
  domain: string;
  action: string;
  msg: string;
}

export interface AccessKeyAuthorization {
  msg: OffchainMessage;
  via: { schema: "nep413"; extra?: { callback_url?: string } };
  access_key: string;
  signature: string;
}

/** The blob a House of Stake wallet's `w_resolve_auth` expects (hos-wallet `AuthorizationBlob`). */
export interface HosAuthorizationBlob {
  payload: string;
  owner: string;
  authorization: string;
}

export interface AuthorizationResolution {
  payload: string;
  pending?: { account_id: string; authorization: string; expect: string }[];
}

/** What the owner's wallet must sign with NEP-413 `signMessage`. */
export interface SignInRequest {
  tla: string;
  owner: string;
  payload: string;
  offchainMessage: OffchainMessage;
  /** Pass these three straight to wallet-selector `signMessage`. */
  nep413: { message: string; recipient: string; nonce: Uint8Array };
}

function parseRfc3339ToNs(ts: string): bigint {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(ts);
  if (!m) throw new AccountKitError("AUTH_INVALID", `timestamp ${ts} is not RFC-3339 UTC`);
  const secs = BigInt(Date.parse(`${m[1]}Z`) / 1000);
  const frac = BigInt((m[2] ?? "").padEnd(9, "0"));
  return secs * 1_000_000_000n + frac;
}

/** SHA3-256(b"NEAR_NEP641_OFFCHAIN_MESSAGE/V1" || borsh(msg)) */
export function offchainMessageHash(msg: OffchainMessage): Uint8Array {
  const borsh = new BorshWriter()
    .string(msg.chain_id)
    .string(msg.signer_id)
    .vecString(msg.path ?? [])
    .u64(parseRfc3339ToNs(msg.timestamp))
    .string(msg.payload)
    .bytes();
  return sha3_256(concatBytes(NEP641_DOMAIN, borsh));
}

/** NEP-641 NEP-413 mapping: `"<chain_id>: <signer_id>[ -> <id>]... @ <timestamp to the second>"`. */
export function nep413Recipient(msg: OffchainMessage): string {
  const chain = [msg.signer_id, ...(msg.path ?? [])].join(" -> ");
  const seconds = msg.timestamp.replace(/\.\d+Z$/, "Z");
  return `${msg.chain_id}: ${chain} @ ${seconds}`;
}

/** The 32-byte hash a NEP-413 signature signs. */
export function nep413Hash(message: string, nonce: Uint8Array, recipient: string, callbackUrl?: string | null): Uint8Array {
  if (nonce.length !== 32) throw new AccountKitError("AUTH_INVALID", "NEP-413 nonce must be 32 bytes");
  const bytes = new BorshWriter()
    .u32(NEP413_TAG)
    .string(message)
    .fixed(nonce)
    .string(recipient)
    .optionString(callbackUrl ?? null)
    .bytes();
  return sha256(bytes);
}

function rfc3339Seconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Step 1 (client or server): build what the owner signs to log in as `tla`.
 * The signer is the owner account; the path is `[tla]` because the owner is
 * reached as a pending sub-authorization of the TLA's resolver.
 */
export function createSignInRequest(opts: {
  tla: string;
  owner: string;
  chainId: string;
  payload: JsonPayload | string;
  /** Defaults to now - 60 s, as NEP-641 recommends, to absorb clock skew. */
  timestamp?: Date;
}): SignInRequest {
  const payload = typeof opts.payload === "string" ? opts.payload : JSON.stringify(opts.payload);
  const ts = opts.timestamp ?? new Date(Date.now() - 60_000);
  const offchainMessage: OffchainMessage = {
    chain_id: opts.chainId,
    signer_id: opts.owner,
    path: [opts.tla],
    timestamp: rfc3339Seconds(ts),
    payload,
  };
  return {
    tla: opts.tla,
    owner: opts.owner,
    payload,
    offchainMessage,
    nep413: {
      message: payload,
      recipient: nep413Recipient(offchainMessage),
      nonce: offchainMessageHash(offchainMessage),
    },
  };
}

function normalizeSignature(sig: string | Uint8Array): Uint8Array {
  if (sig instanceof Uint8Array) return sig;
  if (sig.startsWith("ed25519:")) return base58.decode(sig.slice("ed25519:".length));
  return base64.decode(sig);
}

/**
 * Step 2 (client): wrap the wallet's `signMessage` result into the blob the
 * TLA's `w_resolve_auth` accepts. Wallets return the signature as base64.
 */
export function buildAuthorization(
  request: SignInRequest,
  signed: { publicKey: string; signature: string | Uint8Array; callbackUrl?: string },
): string {
  const sig = normalizeSignature(signed.signature);
  const ownerAuth: AccessKeyAuthorization = {
    msg: request.offchainMessage,
    via: signed.callbackUrl ? { schema: "nep413", extra: { callback_url: signed.callbackUrl } } : { schema: "nep413" },
    access_key: signed.publicKey,
    signature: `ed25519:${base58.encode(sig)}`,
  };
  const blob: HosAuthorizationBlob = {
    payload: request.payload,
    owner: request.owner,
    authorization: JSON.stringify(ownerAuth),
  };
  return JSON.stringify(blob);
}

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

interface Resolved {
  payload: string;
  /** Accounts whose full-access key signature closed a branch of the tree. */
  signers: string[];
}

/** NEP-641 access-key verification for one node. Throws AUTH_INVALID on any failure. */
async function verifyAccessKeyAuthorization(
  kit: AccountKit,
  accountId: string,
  path: string[],
  auth: AccessKeyAuthorization,
  block: { hash: string; timestampNs: bigint },
): Promise<string> {
  const ref: BlockRef = { blockId: block.hash };
  const fail = (why: string): never => {
    throw new AccountKitError("AUTH_INVALID", `access-key authorization for ${accountId}: ${why}`);
  };
  if (auth.via?.schema !== "nep413") fail(`unsupported schema ${auth.via?.schema}`);
  if (auth.msg.chain_id !== kit.chainId) fail(`chain_id ${auth.msg.chain_id} is not ${kit.chainId}`);
  if (auth.msg.signer_id !== accountId) fail(`signer_id ${auth.msg.signer_id} is not ${accountId}`);
  if (!sameStrings(auth.msg.path ?? [], path)) fail(`path [${auth.msg.path ?? []}] is not [${path}]`);
  if (!auth.access_key.startsWith("ed25519:") || !auth.signature.startsWith("ed25519:")) {
    fail("only ed25519 keys are supported by this resolver");
  }

  const pub = base58.decode(auth.access_key.slice(8));
  const sig = base58.decode(auth.signature.slice(8));
  const hash = nep413Hash(auth.msg.payload, offchainMessageHash(auth.msg), nep413Recipient(auth.msg), auth.via.extra?.callback_url);
  if (!ed25519.verify(sig, hash, pub)) fail("signature does not verify");

  if (parseRfc3339ToNs(auth.msg.timestamp) > block.timestampNs) fail("timestamp is later than the pinned block");

  let key: AccessKeyView | null;
  try {
    key = await kit.rpc.accessKey(accountId, auth.access_key, ref);
  } catch (e) {
    if (e instanceof AccountKitError && e.code === "NOT_FOUND") {
      // Account does not exist: accept only an implicit account derived from this key.
      if (accountId === hex.encode(pub)) return auth.msg.payload;
      fail("account does not exist");
    }
    throw e;
  }
  if (!key) fail("account exists but does not hold this key");
  if (key!.permission !== "FullAccess") fail("key is a function-call key, not full access");
  return auth.msg.payload;
}

async function resolveNode(
  kit: AccountKit,
  accountId: string,
  path: string[],
  authorization: string,
  block: { hash: string; timestampNs: bigint },
  depth: number,
  budget: { remaining: number },
): Promise<Resolved> {
  // NEP-641: try the access-key interpretation first; it takes precedence.
  let accessKeyError: AccountKitError | null = null;
  let parsed: AccessKeyAuthorization | null = null;
  try {
    const candidate = JSON.parse(authorization);
    if (candidate && typeof candidate === "object" && "msg" in candidate && "access_key" in candidate) parsed = candidate;
  } catch {
    /* not JSON, so not an access-key blob */
  }
  if (parsed) {
    try {
      const payload = await verifyAccessKeyAuthorization(kit, accountId, path, parsed, block);
      return { payload, signers: [accountId] };
    } catch (e) {
      if (!(e instanceof AccountKitError)) throw e;
      accessKeyError = e;
    }
  }

  let res: AuthorizationResolution;
  try {
    res = await kit.rpc.view<AuthorizationResolution>(accountId, "w_resolve_auth", { path, authorization }, { blockId: block.hash });
  } catch (e) {
    if (accessKeyError) throw accessKeyError;
    throw new AccountKitError("AUTH_INVALID", `${accountId}.w_resolve_auth refused: ${(e as Error).message}`, e);
  }

  const pending = res.pending ?? [];
  if (pending.length === 0) return { payload: res.payload, signers: [] };
  if (depth >= MAX_DEPTH) throw new AccountKitError("AUTH_INVALID", "authorization tree is too deep");
  budget.remaining -= pending.length;
  if (budget.remaining < 0) throw new AccountKitError("AUTH_INVALID", "too many sub-authorizations");

  const subPath = [accountId, ...path];
  const signers: string[] = [];
  for (const p of pending) {
    const sub = await resolveNode(kit, p.account_id, subPath, p.authorization, block, depth + 1, budget);
    if (sub.payload !== p.expect) {
      throw new AccountKitError("AUTH_INVALID", `${p.account_id} authorized a different payload than ${accountId} expects`);
    }
    signers.push(...sub.signers);
  }
  return { payload: res.payload, signers };
}

/**
 * Resolves an NEP-641 authorization for `accountId` against one final block,
 * following the caller-side algorithm in the standard. Returns the payload
 * the whole tree authorizes and which accounts signed. Throws AUTH_INVALID.
 */
export async function resolveAuthorization(kit: AccountKit, accountId: string, authorization: string): Promise<Resolved & { blockHash: string }> {
  const b = await kit.rpc.block({ finality: "final" });
  const block = { hash: b.hash, timestampNs: b.timestampNs };
  const out = await resolveNode(kit, accountId, [], authorization, block, 0, { remaining: MAX_SUB_AUTHORIZATIONS });
  return { ...out, blockHash: b.hash };
}

export interface SignInResult {
  ok: boolean;
  tla: string;
  /** The account that proved itself (the owner's wallet account). */
  signer: string | null;
  /** The current owner according to the verified NFT record. */
  owner: string | null;
  reason?: string;
}

/**
 * Step 3 (server): accept a login only if (a) the TLA's NEP-641 tree resolves
 * to exactly the payload this app issued, (b) the account that signed is the
 * TLA's *current* owner per a verified NFT record, and (c) the lease is active.
 * Replay protection (a fresh nonce/expiry inside `expectedPayload`) is the
 * app's job, as NEP-641 says.
 */
export async function verifySignIn(
  kit: AccountKit,
  opts: { tla: string; authorization: string; expectedPayload: string },
): Promise<SignInResult> {
  const tla = opts.tla.trim().toLowerCase();
  try {
    const resolved = await resolveAuthorization(kit, tla, opts.authorization);
    if (resolved.payload !== opts.expectedPayload) {
      return { ok: false, tla, signer: null, owner: null, reason: "the signed payload is not the one this app issued" };
    }
    const info = await kit.resolve(tla);
    const v = verifyItem(info);
    const signer = resolved.signers[0] ?? null;
    if (!v.ok) return { ok: false, tla, signer, owner: null, reason: "the NFT record and the account disagree" };
    if (!v.active) return { ok: false, tla, signer, owner: v.owner, reason: "the lease is not active" };
    if (signer !== v.owner) {
      return { ok: false, tla, signer, owner: v.owner, reason: `${signer} signed, but the current owner is ${v.owner}` };
    }
    return { ok: true, tla, signer, owner: v.owner };
  } catch (e) {
    if (e instanceof AccountKitError && (e.code === "AUTH_INVALID" || e.code === "NOT_A_TLA" || e.code === "NOT_FOUND")) {
      return { ok: false, tla, signer: null, owner: null, reason: e.message };
    }
    throw e;
  }
}
