/** Shapes returned by the House of Stake contracts, as read from tla-contracts @ d85860a. */

/** `config()` on a registrar, which lives on the TLA account itself (e.g. `bid`, or `club.testnet`). */
export interface RegistrarConfig {
  council: string;
  wallet_impl: string;
  hos_extension: string;
  recovery: string;
  chain_id: string;
  wallet_timeout_secs: number;
  registry: string;
  config_epoch: number;
}

/** NEP-171 `nft_token()` on the registry. The token id is the full account name. */
export interface NftToken {
  token_id: string;
  owner_id: string;
  metadata?: { title?: string | null; extra?: string | null; [k: string]: unknown } | null;
}

/** `get_sub_account(tla_id, name)` on the registry. */
export interface SubAccountRecord {
  full_name: string;
  owner: string;
  tla_id: string;
  payout_account: string;
  lifecycle: string;
  rented_at: string;
  expires_at: string;
  annual_rent?: string;
  [k: string]: unknown;
}

export type ItemStatus = "Active" | "Parked" | string;

/** `nft_item_info()` on the leased account (House of Stake's draft "sharded NFT items" standard). */
export interface NftItemInfo {
  spec: string;
  init: boolean;
  status: ItemStatus;
  collection_id: string;
  token_id: string;
  owner_id: string;
  rotation_seq: string;
  rotation_epoch: number;
}

/** `hos_lease()` on the leased account. */
export interface LeaseView {
  authority: string;
  payout_account: string;
  lease_until_ns: string;
  state: string;
  frozen: string;
  impl_version: number;
}

export interface TokenBudget {
  budget: string;
  spent: string;
  [k: string]: unknown;
}

/** `hos_spend_grant(extension)` / the `grant` inside `hos_agent_status(extension)`. */
export interface SpendGrant {
  receivers: string[];
  budget_yocto: string;
  spent_yocto: string;
  tokens: Record<string, TokenBudget>;
  items: Record<string, string[]>;
  expires_at: string;
}

export interface AgentStatus {
  extension_enabled: boolean;
  grant: SpendGrant | null;
  state: string;
  frozen: string;
  lease_until_ns: string;
  reserve_yocto: string;
  impl_version: number;
}

/** Everything AccountKit reads about one leased name, pinned to a single block. */
export interface TlaInfo {
  /** Full account name, e.g. `alice.club.testnet` or `ibuiltthisshit.bid`. Also the NFT token id. */
  name: string;
  /** First label, e.g. `alice`. */
  label: string;
  /** Parent account that runs the registrar, e.g. `bid` or `club.testnet`. */
  tlaId: string;
  network: string;
  block: { hash: string; height: number; timestampNs: string };
  registrar: RegistrarConfig;
  registry: string;
  token: NftToken | null;
  record: SubAccountRecord | null;
  item: NftItemInfo;
  lease: LeaseView;
  extensions: string[];
  accessKeyCount: number;
  account: {
    balanceYocto: string;
    storageUsage: number;
    globalContractAccountId?: string;
    globalContractHash?: string;
  };
  /** Current owner, as the account itself reports it (`nft_item_info.owner_id`). */
  owner: string;
}
