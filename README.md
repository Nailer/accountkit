# AccountKit

**A TypeScript SDK for House of Stake's Top Level Accounts (TLAs) on NEAR, and Clubhouse, a demo app built on it.**

Built at NEAR HACKATHON (Nov 2026) for the `nfts` track.

## The problem

On NEAR, a House of Stake leased name such as `alice.bid` is three things at once:
- an **NEP-171 NFT** in the registry;
- a **real NEAR account** that holds money and calls contracts;
- an account with **no keys**: its owner controls it from their own account, and selling the NFT hands the whole account to the buyer.

The contracts are live and audited on mainnet (`registry.hos`, 79 names leased as of 11 Nov 2026). The official NFT track prompt says: *"There's no SDK yet — you build on the contracts directly."* So every app has to learn the registrar, registry, wallet, NEP-641 and lease internals by itself.

AccountKit is that missing developer layer. It **uses** House of Stake's contracts; it is not a wallet, a new TLA protocol or a replacement for nearaccounts.com.

## What AccountKit does

| Function | What it gives an app | Contract methods behind it |
|---|---|---|
| `kit.resolve(name)` | Everything about a leased name, read at one pinned block | registrar `config`; registry `nft_token`, `get_sub_account`; account `nft_item_info`, `hos_lease`, `w_extensions`, keys, balance |
| `verifyItem(info)` | 13 checks that the NFT record and the account agree: same owner, right collection, runs the registrar's wallet code, no keys, active lease | House of Stake's draft "sharded NFT items" rule |
| `createSignInRequest` / `buildAuthorization` / `verifySignIn` | **Log in as a TLA** with no transaction: the owner signs an NEP-413 message, and the TLA's `w_resolve_auth` (NEP-641) delegates to the owner. Accepted only if the signer is the *current* verified owner. | `w_resolve_auth` (view) |
| `kit.prepareTransfer(name, from, to)` | The transfer transaction for the owner's wallet. **Refuses receivers that don't exist** (the registry itself accepts them). | registry `nft_transfer` (NEP-171, 1 yocto) |
| `kit.rentQuote(tla, label)` | Price, availability and the rent transaction | registry `get_rent_price`, `is_name_available`, `rent_sub_account` |
| `addExtensionTx`, `grantSpendTx`, `revokeSpendTx`, `kit.agentStatus` | Give an agent a capped, expiring, recipient-limited budget that the **wallet contract** enforces | `w_execute_extension` (`add_extension`), `hos_grant_spend`, `hos_revoke_spend`, `hos_agent_status` |

AccountKit never holds keys: every state change is returned as a transaction for the user's own wallet to sign. Errors carry codes (`INVALID_NAME`, `NOT_FOUND`, `NOT_A_TLA`, `LEASE_EXPIRED`, `WRONG_OWNER`, `RPC_UNAVAILABLE`, `CONTRACT_PANIC`, `AUTH_INVALID`).

```ts
import { AccountKit, verifyItem } from "@accountkit/sdk";

const kit = new AccountKit({ network: "mainnet" });
const info = await kit.resolve("ibuiltthisshit.bid");
const { ok, active, owner } = verifyItem(info); // true, true, "dizzy123.near"
```

## Clubhouse (the demo app)

A members-only page where **membership is a TLA**:
1. Connect a wallet. Clubhouse lists the memberships you hold.
2. Sign in as one by signing a message (NEP-641/NEP-413). No transaction, no gas.
3. The server re-reads the chain on **every** members-only request.
4. Transfer the membership from your wallet. The buyer can sign in; your next request is refused.
5. *(Stretch)* Give a scripted agent a 0.5 NEAR budget for one recipient. The wallet contract allows the approved payment and refuses the rest.

## Try it

Requirements: Node 20.12+ and pnpm 10.

```bash
pnpm install
pnpm --filter @accountkit/sdk build
```

### 1. Verify a real mainnet TLA (free, read-only, 10 seconds)

```bash
pnpm test:live
```
→ You see `ibuiltthisshit.bid VERIFIED owner: dizzy123.near` and 13 `ok` checks, read from House of Stake's live mainnet contracts. To try any other name: `pnpm --filter @accountkit/sdk example:resolve <name>`.

### 2. Unit tests (offline)

```bash
pnpm --filter @accountkit/sdk test
```
→ 16 tests pass: Borsh and NEP-641 hashing (including the standard's own recipient example), a sign-in round trip, verification refusing tampered records, and the transaction shapes.

### 3. Clubhouse in the browser (testnet)

```bash
cp apps/clubhouse/.env.example apps/clubhouse/.env
pnpm --filter clubhouse dev
```
Open http://localhost:5173.

1. **Look up** `alice-member.akclub.testnet` in the box at the bottom → "Verified · 13/13 checks", with its current owner.
2. **Connect** a testnet wallet (MyNearWallet or Meteor). An empty testnet account works; the faucet gives 10 test NEAR.
3. **Join the club:** type a name of 12+ characters and press *Rent with my wallet* (~1.7 test NEAR) → it appears under "Your memberships".
4. **Sign in** as it → your wallet asks you to sign a message → the members-only page opens with the 13 checks.
5. **Transfer** it to another testnet account you control → the page says *"…now belongs to X. Y is no longer a member."* Connect as X and sign in → the page opens.

### 4. The same journey, scripted (needs the demo accounts' testnet keys)

These scripts use the test accounts' keys from the NEAR CLI keychain (`~/.near-credentials/testnet/`), so they run on the machine that holds them (see `DEPLOYMENT.md`):

```bash
pnpm e2e:transfer   # sign in, refuse the non-owner, transfer, refuse the old owner: 10 checks
pnpm e2e:server     # same through the HTTP API; the same session cookie is refused after the transfer
pnpm e2e:agent      # owner grants 0.5 NEAR; 0.2 allowed; 0.4 and an unapproved recipient refused on chain; revoke works
```

## What is real, what is not

| Part | Status |
|---|---|
| Mainnet read and verify | **Real.** Live House of Stake contracts, view calls only. |
| Testnet contracts | **Real House of Stake code, our deployment.** Unmodified contracts at `d85860a`, deployed with House of Stake's own scripts. The `akclub.testnet` namespace is a fixture we created as council of our own copy, which is impossible on mainnet. We also extended the price staleness window to 30 days (`DEPLOYMENT.md`). |
| Sign-in | **Real.** The NEP-641 resolver runs against the TLA's own `w_resolve_auth`; signatures come from the wallet (browser) or from near-api-js (scripts). |
| Transfer | **Real** testnet `nft_transfer` transactions (links in `DEPLOYMENT.md`). |
| Agent | **Scripted, not AI.** Clubhouse's agent turns each task into a fixed payment proposal. The enforcement is real: allowed and refused payments are actual testnet transactions, refused by the TLA wallet contract with its own error messages. |
| Browser wallet flow | Built and compiled; **not yet clicked through end to end by a human** at the time of writing. The server and API flows are covered by the scripts above. |
| History / activity view | Not included. No indexer. |

## Verified behaviour worth knowing

- **Selling clears agents.** An agent the old owner enabled does not survive a transfer: after `nft_transfer`, `w_extensions` holds only the new owner and House of Stake's extension (checked in `e2e:transfer`).
- **Transfers to non-existent accounts succeed on chain.** That hands the name to whoever creates that account first, so `prepareTransfer()` refuses them.
- **The NEP-641 status note in tla-contracts is out of date.** Its README calls NEP-641 a draft; the NEP is Final (v1.0.0, Aug 2026). We implement the Final spec.

## Layout

```
packages/sdk        @accountkit/sdk (TypeScript, ESM, depends only on @noble/* and @scure/base)
apps/clubhouse      Vite + React front end, a small Node API (server/), and e2e scripts (scripts/)
vendor/             House of Stake's tla-contracts (not committed; clone at d85860a to rebuild)
FEASIBILITY.md      What we checked before building, and the environment decisions
DEPLOYMENT.md       Testnet accounts, settings and transaction evidence
```

## Track

`nfts`, primary. Also `security`: the spend-grant demo shows the TLA wallet enforcing an agent's limits on chain. We don't claim `defi`, `social`, `games` or `open`.

## License

MIT
