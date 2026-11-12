import type { TlaInfo } from "../src/types.js";

/** Shaped from a real mainnet read of ibuiltthisshit.bid on 11 Nov 2026 (see test/live.test.ts). */
export function fixture(): TlaInfo {
  return {
    name: "ibuiltthisshit.bid",
    label: "ibuiltthisshit",
    tlaId: "bid",
    network: "mainnet",
    block: { hash: "x", height: 1, timestampNs: "1794000000000000000" },
    registrar: {
      council: "hos-root.sputnik-dao.near",
      wallet_impl: "impl.hos",
      hos_extension: "ext.hos",
      recovery: "rec.hos",
      chain_id: "mainnet",
      wallet_timeout_secs: 3600,
      registry: "registry.hos",
      config_epoch: 0,
    },
    registry: "registry.hos",
    token: { token_id: "ibuiltthisshit.bid", owner_id: "dizzy123.near" },
    record: null,
    item: {
      spec: "sharded-item-1.0.0",
      init: true,
      status: "Active",
      collection_id: "registry.hos",
      token_id: "ibuiltthisshit.bid",
      owner_id: "dizzy123.near",
      rotation_seq: "19",
      rotation_epoch: 4,
    },
    lease: {
      authority: "ext.hos",
      payout_account: "dizzy123.near",
      lease_until_ns: "1852836892871619592",
      state: "Active",
      frozen: "Unfrozen",
      impl_version: 7,
    },
    extensions: ["dizzy123.near", "ext.hos"],
    accessKeyCount: 0,
    account: { balanceYocto: "1", storageUsage: 333, globalContractAccountId: "impl.hos" },
    owner: "dizzy123.near",
  };
}
