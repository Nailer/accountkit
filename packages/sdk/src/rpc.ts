import { AccountKitError } from "./errors.js";

/** A NEAR block reference: a pinned hash, or a finality level. */
export type BlockRef = { blockId: string } | { finality: "final" | "optimistic" };

export interface BlockInfo {
  hash: string;
  height: number;
  /** Nanoseconds since the UNIX epoch, as a bigint (it does not fit a JS number). */
  timestampNs: bigint;
}

export interface AccountView {
  amount: string;
  locked: string;
  storageUsage: number;
  codeHash: string;
  /** Set when the account runs a global contract published by this account id. */
  globalContractAccountId?: string;
  /** Set when the account runs a global contract identified by hash. */
  globalContractHash?: string;
}

export interface AccessKeyView {
  publicKey: string;
  permission: "FullAccess" | { FunctionCall: unknown };
}

const DEFAULT_TIMEOUT_MS = 10_000;

function blockParams(ref: BlockRef): Record<string, unknown> {
  return "blockId" in ref ? { block_id: ref.blockId } : { finality: ref.finality };
}

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Minimal NEAR JSON-RPC client with endpoint fallback. View calls only:
 * AccountKit never holds keys, so anything that changes state goes through
 * the user's wallet (see actions.ts).
 */
export class NearRpc {
  readonly urls: string[];
  private readonly timeoutMs: number;

  constructor(urls: string[], timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (urls.length === 0) throw new AccountKitError("RPC_UNAVAILABLE", "no RPC url configured");
    this.urls = urls;
    this.timeoutMs = timeoutMs;
  }

  /** Sends one JSON-RPC request, trying each endpoint in turn on network failure. */
  async request<T = any>(method: string, params: unknown): Promise<T> {
    const failures: string[] = [];
    for (const url of this.urls) {
      let body: any;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "accountkit", method, params }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (res.status >= 500 || res.status === 429) {
          failures.push(`${url}: HTTP ${res.status}`);
          continue;
        }
        body = await res.json();
      } catch (e) {
        failures.push(`${url}: ${(e as Error).message}`);
        continue;
      }
      if (body.error) {
        const cause = body.error.cause?.name ?? body.error.name;
        const info = body.error.cause?.info ?? body.error.data;
        if (cause === "UNKNOWN_ACCOUNT" || cause === "UNKNOWN_ACCESS_KEY" || cause === "NO_CONTRACT_CODE") {
          throw new AccountKitError("NOT_FOUND", `${cause}: ${JSON.stringify(info)}`, body.error);
        }
        if (cause === "UNKNOWN_BLOCK" || cause === "INTERNAL_ERROR" || cause === "TIMEOUT_ERROR") {
          failures.push(`${url}: ${cause}`);
          continue;
        }
        if (cause === "CONTRACT_EXECUTION_ERROR") {
          throw new AccountKitError("CONTRACT_PANIC", String(info?.vm_error ?? body.error.data ?? cause), body.error);
        }
        throw new AccountKitError("CONTRACT_PANIC", `${cause}: ${JSON.stringify(info ?? body.error)}`, body.error);
      }
      return body.result as T;
    }
    throw new AccountKitError("RPC_UNAVAILABLE", `no RPC endpoint answered: ${failures.join("; ")}`);
  }

  async block(ref: BlockRef = { finality: "final" }): Promise<BlockInfo> {
    const r = await this.request("block", blockParams(ref));
    return {
      hash: r.header.hash,
      height: r.header.height,
      timestampNs: BigInt(r.header.timestamp_nanosec ?? r.header.timestamp),
    };
  }

  /** Calls a view method and parses its JSON result. Contract panics become CONTRACT_PANIC. */
  async view<T = any>(accountId: string, method: string, args: unknown = {}, ref: BlockRef = { finality: "final" }): Promise<T> {
    const r = await this.request("query", {
      request_type: "call_function",
      account_id: accountId,
      method_name: method,
      args_base64: toBase64(JSON.stringify(args)),
      ...blockParams(ref),
    });
    if (r.error) {
      const msg = String(r.error);
      if (msg.includes("MethodNotFound") || msg.includes("CodeDoesNotExist")) {
        throw new AccountKitError("NOT_FOUND", `${accountId}.${method}: ${msg}`);
      }
      const panic = /panic_msg: \\?"(.*?)\\?"/.exec(msg)?.[1] ?? msg;
      throw new AccountKitError("CONTRACT_PANIC", `${accountId}.${method}: ${panic}`, r);
    }
    const text = new TextDecoder().decode(Uint8Array.from(r.result as number[]));
    return (text.length ? JSON.parse(text) : null) as T;
  }

  async viewAccount(accountId: string, ref: BlockRef = { finality: "final" }): Promise<AccountView> {
    const r = await this.request("query", { request_type: "view_account", account_id: accountId, ...blockParams(ref) });
    return {
      amount: r.amount,
      locked: r.locked,
      storageUsage: r.storage_usage,
      codeHash: r.code_hash,
      globalContractAccountId: r.global_contract_account_id ?? undefined,
      globalContractHash: r.global_contract_hash ?? undefined,
    };
  }

  async accessKeys(accountId: string, ref: BlockRef = { finality: "final" }): Promise<AccessKeyView[]> {
    const r = await this.request("query", { request_type: "view_access_key_list", account_id: accountId, ...blockParams(ref) });
    return (r.keys as any[]).map((k) => ({ publicKey: k.public_key, permission: k.access_key.permission }));
  }

  /** Returns the key's permission, or null when the account exists but does not hold that key. */
  async accessKey(accountId: string, publicKey: string, ref: BlockRef = { finality: "final" }): Promise<AccessKeyView | null> {
    try {
      const r = await this.request("query", {
        request_type: "view_access_key",
        account_id: accountId,
        public_key: publicKey,
        ...blockParams(ref),
      });
      if (r.error) return null;
      return { publicKey, permission: r.permission };
    } catch (e) {
      if (e instanceof AccountKitError && e.code === "NOT_FOUND" && String(e.message).startsWith("UNKNOWN_ACCESS_KEY")) return null;
      throw e;
    }
  }
}
