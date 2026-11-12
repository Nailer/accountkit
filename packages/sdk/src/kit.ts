import { AccountKitError } from "./errors.js";
import { NearRpc, type BlockRef } from "./rpc.js";
import type {
  AgentStatus,
  LeaseView,
  NftItemInfo,
  NftToken,
  RegistrarConfig,
  SpendGrant,
  SubAccountRecord,
  TlaInfo,
} from "./types.js";
import { verifyItem, type VerifyResult } from "./verify.js";
import { rentTx, transferTx, type WalletTransaction } from "./actions.js";

export type NetworkId = "mainnet" | "testnet" | "sandbox" | (string & {});

export interface AccountKitConfig {
  network: NetworkId;
  /** RPC endpoints, tried in order. Defaults exist for mainnet and testnet. */
  rpcUrls?: string[];
  /**
   * Registry contract to use for listing names by owner. Optional: `resolve()`
   * always reads the registry from the TLA's own registrar config.
   */
  registry?: string;
  /** Chain id expected inside NEP-641 messages. Defaults to the network id. */
  chainId?: string;
}

export const DEFAULT_RPC: Record<string, string[]> = {
  mainnet: ["https://rpc.mainnet.fastnear.com", "https://rpc.mainnet.near.org"],
  testnet: ["https://rpc.testnet.fastnear.com", "https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"],
  sandbox: ["http://127.0.0.1:3030"],
};

/** House of Stake's live mainnet deployment, read from the `bid` registrar's config on 11 Nov 2026. */
export const MAINNET_REGISTRY = "registry.hos";

const ACCOUNT_ID_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function isValidAccountId(id: string): boolean {
  return id.length >= 2 && id.length <= 64 && ACCOUNT_ID_RE.test(id);
}

/** Splits `alice.club.testnet` into the label `alice` and the TLA `club.testnet`. */
export function parseTlaName(name: string): { label: string; tlaId: string } {
  const trimmed = name.trim().toLowerCase();
  const dot = trimmed.indexOf(".");
  if (!isValidAccountId(trimmed) || dot <= 0 || dot === trimmed.length - 1) {
    throw new AccountKitError("INVALID_NAME", `"${name}" is not a leased name of the form label.tla`);
  }
  return { label: trimmed.slice(0, dot), tlaId: trimmed.slice(dot + 1) };
}

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AccountKitError && e.code === "NOT_FOUND") return null;
    throw e;
  }
}

/**
 * Read-side entry point. Every method is a free RPC view call; nothing here
 * signs or spends. State-changing helpers live in actions.ts and return
 * transactions for the user's own wallet to sign.
 */
export class AccountKit {
  readonly network: NetworkId;
  readonly rpc: NearRpc;
  readonly chainId: string;
  private readonly registryHint?: string;

  constructor(config: AccountKitConfig) {
    this.network = config.network;
    const urls = config.rpcUrls ?? DEFAULT_RPC[config.network];
    if (!urls) throw new AccountKitError("RPC_UNAVAILABLE", `no default RPC for network "${config.network}"; pass rpcUrls`);
    this.rpc = new NearRpc(urls);
    this.chainId = config.chainId ?? (config.network === "sandbox" ? "testnet" : config.network);
    this.registryHint = config.registry ?? (config.network === "mainnet" ? MAINNET_REGISTRY : undefined);
  }

  /** The registrar config on a TLA account. Throws NOT_A_TLA if the account is not a House of Stake registrar. */
  async registrarConfig(tlaId: string, ref: BlockRef = { finality: "final" }): Promise<RegistrarConfig> {
    try {
      return await this.rpc.view<RegistrarConfig>(tlaId, "config", {}, ref);
    } catch (e) {
      if (e instanceof AccountKitError && (e.code === "NOT_FOUND" || e.code === "CONTRACT_PANIC")) {
        throw new AccountKitError("NOT_A_TLA", `${tlaId} does not run a House of Stake registrar`, e);
      }
      throw e;
    }
  }

  /**
   * Reads everything about a leased name at one final block: registrar config,
   * NFT record, the account's own item info, lease, extensions, keys and balance.
   */
  async resolve(name: string): Promise<TlaInfo> {
    const { label, tlaId } = parseTlaName(name);
    const fullName = `${label}.${tlaId}`;
    const block = await this.rpc.block({ finality: "final" });
    const ref: BlockRef = { blockId: block.hash };

    const account = await this.rpc.viewAccount(fullName, ref).catch((e) => {
      if (e instanceof AccountKitError && e.code === "NOT_FOUND") {
        throw new AccountKitError("NOT_FOUND", `${fullName} does not exist on ${this.network}`, e);
      }
      throw e;
    });
    const registrar = await this.registrarConfig(tlaId, ref);
    const registry = registrar.registry;

    const [token, record, item, lease, extensions, keys] = await Promise.all([
      orNull(this.rpc.view<NftToken | null>(registry, "nft_token", { token_id: fullName }, ref)),
      orNull(this.rpc.view<SubAccountRecord | null>(registry, "get_sub_account", { tla_id: tlaId, name: label }, ref)),
      orNull(this.rpc.view<NftItemInfo>(fullName, "nft_item_info", {}, ref)),
      orNull(this.rpc.view<LeaseView>(fullName, "hos_lease", {}, ref)),
      orNull(this.rpc.view<string[]>(fullName, "w_extensions", {}, ref)),
      this.rpc.accessKeys(fullName, ref),
    ]);

    if (!item || !lease || !extensions) {
      throw new AccountKitError(
        "NOT_A_TLA",
        `${fullName} exists but does not answer the House of Stake wallet views (nft_item_info, hos_lease, w_extensions)`,
      );
    }

    return {
      name: fullName,
      label,
      tlaId,
      network: this.network,
      block: { hash: block.hash, height: block.height, timestampNs: block.timestampNs.toString() },
      registrar,
      registry,
      token: token ?? null,
      record: record ?? null,
      item,
      lease,
      extensions,
      accessKeyCount: keys.length,
      account: {
        balanceYocto: account.amount,
        storageUsage: account.storageUsage,
        globalContractAccountId: account.globalContractAccountId,
        globalContractHash: account.globalContractHash,
      },
      owner: item.owner_id,
    };
  }

  /** `resolve()` + `verifyItem()` in one call. */
  async verify(name: string): Promise<{ info: TlaInfo; result: VerifyResult }> {
    const info = await this.resolve(name);
    return { info, result: verifyItem(info) };
  }

  /**
   * The verified current owner. Throws LEASE_EXPIRED if the name is not
   * currently active, and NOT_A_TLA if the record and account disagree.
   */
  async ownerOf(name: string): Promise<string> {
    const { info, result } = await this.verify(name);
    if (!result.ok) {
      const failed = result.checks.filter((c) => !c.ok).map((c) => c.id);
      throw new AccountKitError("NOT_A_TLA", `${info.name} failed verification: ${failed.join(", ")}`, result);
    }
    if (!result.active) {
      throw new AccountKitError("LEASE_EXPIRED", `${info.name} is not active (parked, frozen or expired)`, result);
    }
    return result.owner!;
  }

  /** Throws WRONG_OWNER unless `accountId` is the verified, active owner of `name`. */
  async assertOwner(name: string, accountId: string): Promise<void> {
    const owner = await this.ownerOf(name);
    if (owner !== accountId) {
      throw new AccountKitError("WRONG_OWNER", `${accountId} is not the owner of ${name} (owner is ${owner})`);
    }
  }

  /**
   * Safe transfer preparation. The registry's `nft_transfer` accepts any
   * valid account id, including one that does not exist yet (we hit this on
   * testnet): whoever later creates that account would get the name. This
   * checks the name verifies and is active, `from` is its owner, and the
   * receiver exists, then returns the transaction for the owner's wallet.
   */
  async prepareTransfer(name: string, from: string, receiverId: string, memo?: string): Promise<WalletTransaction> {
    const { info, result } = await this.verify(name);
    if (!result.ok) throw new AccountKitError("NOT_A_TLA", `${info.name} failed verification`, result);
    if (!result.active) throw new AccountKitError("LEASE_EXPIRED", `${info.name} is not active`, result);
    if (result.owner !== from) throw new AccountKitError("WRONG_OWNER", `${from} is not the owner of ${info.name} (owner is ${result.owner})`);
    const to = receiverId.trim().toLowerCase();
    if (!isValidAccountId(to)) throw new AccountKitError("INVALID_NAME", `"${receiverId}" is not a valid NEAR account id`);
    if (to === from) throw new AccountKitError("WRONG_OWNER", `${to} already owns ${info.name}`);
    // The wallet refuses these on chain (SELF_TARGET / UNAUTHORIZED); refuse before the owner signs and pays gas.
    if (to === info.name || to === info.registry || to === info.lease.authority) {
      throw new AccountKitError("INVALID_NAME", `${to} can't own ${info.name}: it is the account itself, its registry or its lease authority`);
    }
    try {
      await this.rpc.viewAccount(to);
    } catch (e) {
      if (e instanceof AccountKitError && e.code === "NOT_FOUND") {
        throw new AccountKitError("NOT_FOUND", `${to} does not exist on ${this.network}; transferring to it would hand the name to whoever creates it`);
      }
      throw e;
    }
    return transferTx(info, to, memo);
  }

  /**
   * Price to rent `label.tlaId`, plus the transaction for the renter's wallet.
   * Adds a 0.1 NEAR margin, as House of Stake's own tests do.
   */
  async rentQuote(tlaId: string, label: string): Promise<{ name: string; available: boolean; totalYocto: string; tx: WalletTransaction }> {
    const name = `${label}.${tlaId}`;
    parseTlaName(name);
    const { registry } = await this.registrarConfig(tlaId);
    const [available, price] = await Promise.all([
      this.rpc.view<boolean>(registry, "is_name_available", { tla_id: tlaId, name: label }),
      this.rpc.view<{ total_yocto: string }>(registry, "get_rent_price", { tla_id: tlaId, name: label }),
    ]);
    const deposit = BigInt(price.total_yocto) + 100_000_000_000_000_000_000_000n;
    return { name, available, totalYocto: price.total_yocto, tx: rentTx(registry, tlaId, label, deposit) };
  }

  /** Names a given account owns, from the registry's owner index. */
  async namesOwnedBy(owner: string, registry = this.registryHint): Promise<string[]> {
    if (!registry) throw new AccountKitError("NOT_FOUND", "no registry configured for this network; pass one");
    const tokens = await this.rpc.view<NftToken[]>(registry, "nft_tokens_for_owner", {
      account_id: owner,
      from_index: "0",
      limit: 50,
    });
    return tokens.map((t) => t.token_id);
  }

  /** The spend grant an extension holds on a leased account, or null. */
  async spendGrant(name: string, extension: string): Promise<SpendGrant | null> {
    return this.rpc.view<SpendGrant | null>(name, "hos_spend_grant", { extension });
  }

  /** Whether an extension is enabled, its grant, and the balance floor spends cannot breach. */
  async agentStatus(name: string, extension: string): Promise<AgentStatus> {
    return this.rpc.view<AgentStatus>(name, "hos_agent_status", { extension });
  }
}
