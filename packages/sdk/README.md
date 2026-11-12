# @accountkit/sdk

TypeScript SDK for House of Stake's Top Level Accounts (TLAs) on NEAR: rented names that are an NEP-171 NFT and a real NEAR account at the same time. Whoever holds the NFT controls the account, which has no keys of its own.

- **No keys, no state.** Every write comes back as a transaction for the user's own wallet to sign.
- **Three dependencies:** `@noble/curves`, `@noble/hashes`, `@scure/base`. Works in browsers and Node 20.12+.
- **Mainnet and testnet.** Mainnet reads House of Stake's live `registry.hos`.

See the [repository README](../../README.md) for how it works, diagrams and the threat model.

## Read and verify a name

```ts
import { AccountKit, verifyItem } from "@accountkit/sdk";

const kit = new AccountKit({ network: "mainnet" });
const { info, result } = await kit.verify("ibuiltthisshit.bid");
result.ok;     // true: the NFT record and the account agree (checks 1-9)
result.active; // true: the lease is usable right now (checks 10-13)
result.owner;  // "dizzy123.near"
```

`kit.resolve(name)` reads everything at one pinned block. `verifyItem(info)` runs 13 named checks, and `result.checks` lists each one with its detail.

## Sign in as a name, with no transaction

```ts
import { buildAuthorization, createSignInRequest, verifySignIn } from "@accountkit/sdk";

// Server: issue a one-time request.
const req = createSignInRequest({ tla: name, owner, chainId: kit.chainId, payload: { domain: "MyApp", action: "Login", msg: challenge } });
// Client: the owner's wallet signs req.nep413 (signMessage) and returns { publicKey, signature }.
const authorization = buildAuthorization(req, signed);
// Server: accept only if the signer is the current verified owner and the lease is active.
const r = await verifySignIn(kit, { tla: name, authorization, expectedPayload: req.payload });
```

## Hand it over safely

```ts
const tx = await kit.prepareTransfer(name, owner, "bob.near");
// Refuses: receivers that don't exist (the registry would accept them), non-owners,
// the account itself, its registry or authority, expired leases. Then: wallet.signAndSendTransaction(tx).
```

House of Stake's wallet clears the old owner's agents and spend grants during the transfer, and sweeps the account's spare NEAR back to the seller.

## Rent a name

```ts
const q = await kit.rentQuote("akclub.testnet", "yourname-member");
q.available; q.totalYocto; // price from the registry
q.tx;                      // rent_sub_account, with a 0.1 NEAR margin
```

## Give an agent a budget the account enforces

```ts
import { addExtensionTx, grantSpendTx, parseNear, revokeSpendTx } from "@accountkit/sdk";

addExtensionTx(name, "agent.near");
grantSpendTx(name, { extension: "agent.near", receivers: ["shop.near"], budgetYocto: parseNear("0.5"), expiresAt: new Date(Date.now() + 3_600_000) });
await kit.agentStatus(name, "agent.near"); // { extension_enabled, grant: { budget_yocto, spent_yocto, ... } }
revokeSpendTx(name, "agent.near");
```

`grantSpendTx` refuses, before anything is signed, what the wallet would refuse on chain: no or duplicate receivers, the account itself as a receiver, a negative budget, or a past expiry.

## Errors

Every failure is an `AccountKitError` with a `code`:

| Code | Meaning |
|---|---|
| `INVALID_NAME` | Not a valid account id, or not of the form `label.tla` |
| `INVALID_INPUT` | An argument the contract would refuse, caught before signing |
| `NOT_FOUND` | The account, registrar or NFT record doesn't exist |
| `NOT_A_TLA` | The account exists but isn't a genuine House of Stake leased name |
| `LEASE_EXPIRED` | The lease ran out, or the account is frozen or parked |
| `WRONG_OWNER` | The caller isn't the current owner |
| `RPC_UNAVAILABLE` | No RPC endpoint answered (each endpoint is tried in turn) |
| `CONTRACT_PANIC` | The contract refused the call; the message is included |
| `AUTH_INVALID` | An NEP-641 authorization didn't resolve |

```ts
import { isAccountKitError } from "@accountkit/sdk";
try { await kit.ownerOf(name); } catch (e) { if (isAccountKitError(e, "LEASE_EXPIRED")) { /* ... */ } }
```

## Units

```ts
parseNear("0.5");                // 500000000000000000000000n (strict: no sign, no exponent, ≤ 24 decimals)
formatNear(1591000000000000000000000n); // "1.591" (rounds down)
```

## Development

```bash
pnpm build          # compile to dist/
pnpm test           # unit tests, offline
pnpm test:live      # read a real mainnet name (LIVE=1)
```

MIT licensed.
