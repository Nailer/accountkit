import type { TlaInfo } from "./types.js";

export interface VerifyCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface VerifyResult {
  /** The NFT record and the account agree, and the account is a genuine House of Stake leased name. */
  ok: boolean;
  /** The lease is live and the account can act right now (Active, unfrozen, not expired). */
  active: boolean;
  /** The verified owner. Only meaningful when `ok` is true. */
  owner: string | null;
  checks: VerifyCheck[];
}

const SHARDED_ITEM_SPEC_PREFIX = "sharded-item-";

/**
 * Checks that a leased name's NFT record (in the registry) and its account
 * (the item) describe the same thing, following House of Stake's draft
 * "Sharded NFT Items" rule: a consumer pairs the item's own `nft_item_info`
 * with the collection's `nft_token` and refuses unless they agree.
 *
 * Pure: it inspects a `TlaInfo` that `AccountKit.resolve()` already read at
 * one block, so the answer is consistent with a single chain state.
 */
export function verifyItem(info: TlaInfo): VerifyResult {
  const checks: VerifyCheck[] = [];
  const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });

  add(
    "registry-has-token",
    info.token !== null,
    info.token ? `${info.registry} lists token ${info.token.token_id}` : `${info.registry} has no token ${info.name}`,
  );

  add(
    "item-spec",
    info.item.spec.startsWith(SHARDED_ITEM_SPEC_PREFIX),
    `nft_item_info.spec = ${info.item.spec}`,
  );

  add(
    "item-names-collection",
    info.item.collection_id === info.registry,
    `item says collection ${info.item.collection_id}, registrar config says ${info.registry}`,
  );

  add(
    "item-names-itself",
    info.item.token_id === info.name,
    `item says token ${info.item.token_id}, account is ${info.name}`,
  );

  const tokenOwner = info.token?.owner_id ?? null;
  add(
    "owners-agree",
    tokenOwner !== null && tokenOwner === info.item.owner_id,
    `registry owner ${tokenOwner ?? "(none)"}, account owner ${info.item.owner_id}`,
  );

  const codeSource = info.account.globalContractAccountId ?? info.account.globalContractHash ?? "(own code)";
  add(
    "runs-registrar-wallet",
    info.account.globalContractAccountId === info.registrar.wallet_impl,
    `account runs global contract ${codeSource}, registrar expects ${info.registrar.wallet_impl}`,
  );

  add(
    "authority-is-hos-extension",
    info.lease.authority === info.registrar.hos_extension && info.extensions.includes(info.registrar.hos_extension),
    `lease authority ${info.lease.authority}, registrar extension ${info.registrar.hos_extension}`,
  );

  add(
    "owner-is-extension",
    info.extensions.includes(info.item.owner_id),
    `w_extensions = [${info.extensions.join(", ")}]`,
  );

  add(
    "no-access-keys",
    info.accessKeyCount === 0,
    info.accessKeyCount === 0 ? "the account holds no keys" : `the account holds ${info.accessKeyCount} access key(s)`,
  );

  const structuralOk = checks.every((c) => c.ok);

  const leaseUntil = BigInt(info.lease.lease_until_ns);
  const now = BigInt(info.block.timestampNs);
  const activeChecks: VerifyCheck[] = [
    { id: "item-active", ok: info.item.status === "Active", detail: `nft_item_info.status = ${info.item.status}` },
    { id: "lease-active", ok: info.lease.state === "Active", detail: `hos_lease.state = ${info.lease.state}` },
    { id: "not-frozen", ok: info.lease.frozen === "Unfrozen", detail: `hos_lease.frozen = ${info.lease.frozen}` },
    {
      id: "lease-not-expired",
      ok: leaseUntil > now,
      detail: `lease until ${new Date(Number(leaseUntil / 1_000_000n)).toISOString()}`,
    },
  ];
  checks.push(...activeChecks);

  return {
    ok: structuralOk,
    active: structuralOk && activeChecks.every((c) => c.ok),
    owner: structuralOk ? info.item.owner_id : null,
    checks,
  };
}
