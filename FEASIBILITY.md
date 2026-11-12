# AccountKit: setup and feasibility note

Written 11 Nov 2026, ~02:15 UTC. Deadline 14 Nov 2026 23:59 UTC (about 93 hours left).

## Verdict: go, with one decision needed from the team

The core ownership journey (read a TLA → verify it → owner signs in → transfer → new owner signs in, old owner is refused) can be built on the real House of Stake contracts. Reading and sign-in already work against **real mainnet TLAs at zero cost**. The transfer step needs a contract environment we control: **local sandbox** (free, ready) or **our own testnet deployment** (free tokens, but about 70 testnet NEAR and your approval to deploy).

## What was checked, and how

| Item | Result | Evidence |
|---|---|---|
| Rules, deadline | Development ends 2026-11-14T23:59Z. Testnet-only projects are eligible (Q-010). | `HACKATHON.md` |
| NFT track prompt | Says the TLA contracts are "live and audited on mainnet" and "There's no SDK yet". | tracks/10-nfts.md |
| Contracts | `houseofstake/tla-contracts` @ `d85860a` (2026-10-15). All 13 wasm files build locally. | `vendor/tla-contracts`, `cargo near build` |
| Toolchain | Rust 1.97.1 (pinned by the repo). **Needs cargo-near ≥ 0.22**: the installed 0.13.4 fails wasm validation (bulk-memory). We used cargo-near 0.22.0 from NEAR's GitHub release, kept outside your PATH. Docker is not installed, so reproducible builds are not possible here; non-reproducible builds are fine for testing. | build log |
| Live mainnet deployment | Registry `registry.hos`, wallet code `impl.hos` (global contract), extension `ext.hos`, recovery `rec.hos`, council `hos-root.sputnik-dao.near`. 1,008 TLAs, 79 leased names. | `config()` on the `agi` and `bid` registrars, `get_stats()` |
| Read + verify a real TLA | `ibuiltthisshit.bid`: all 13 checks pass (NFT record and account agree, runs `impl.hos`, no access keys, active lease). | `pnpm --filter @accountkit/sdk test:live` |
| NEP-641 on a real TLA | `w_resolve_auth` delegates to the owner (`pending: [{account_id: owner}]`) and panics with "named account is not an owner" for anyone else. | live test |

## Methods AccountKit wraps (all read from source, none invented)

| Purpose | Contract | Method | Source |
|---|---|---|---|
| Registrar config (finds the registry) | TLA account, e.g. `bid` | `config` | `contracts/registrar/src/lib.rs` |
| NFT record | registry | `nft_token`, `get_sub_account`, `nft_tokens_for_owner` | `tla-registry/src/nft.rs`, `views.rs` |
| Item's own view of itself | leased account | `nft_item_info`, `hos_lease`, `w_extensions` | `hos-wallet/src/lib.rs` |
| Sign-in (NEP-641) | leased account | `w_resolve_auth` (view) | `hos-wallet/src/lib.rs` |
| **Transfer** | registry | `nft_transfer` (NEP-171, 1 yocto). The registry rotates the wallet's owner extension in the same flow. **Not** a generic NFT transfer on the account. | `tla-registry/src/nft.rs`, test `nft_transfer_rotates_the_wallet_and_the_registry_together` |
| Owner acts | leased account | `w_execute_extension` with a defuse-wallet `Request` | `hos-wallet`, near/intents `contracts/wallet/src/request` |
| Agent limits | leased account | `add_extension` (internal op), `hos_grant_spend`, `hos_revoke_spend`, `hos_agent_status` | test `a_granted_agent_moves_tokens_up_to_its_budget_and_no_further` |

## NEP-641 status: the repo is out of date

- The TLA repo README says leased accounts implement NEP-641, *"which is still a draft, so that interface may change"*.
- The NEP page (near/NEPs `neps/nep-0641.md`) now reads **Status: Final, Version 1.0.0, last updated 2026-08-11**.
- **Our resolution:** we implement the Final spec (`OffchainMessage`, SHA3-256 hash with the `NEAR_NEP641_OFFCHAIN_MESSAGE/V1` domain, NEP-413 access-key authorization, recursive `pending`). We pin the contract version (`d85860a`, wallet `impl_version` 7 on mainnet) and treat the README sentence as stale.
- **Caveat:** our offchain verifier has unit tests and is checked against the live contract's `w_resolve_auth`, but has not been cross-checked against another team's NEP-641 implementation.

## Namespaces: what a "club" can and cannot do

- **Mainnet:** creating a namespace (`register_tla`, `activate_open_tla`) and business-name whitelisting (`admin_whitelist_add`) are council / admin only. A club cannot create its own namespace on mainnet without House of Stake. Renting a name costs real NEAR, which the team has ruled out.
- **Our own deployment (sandbox or testnet):** we are the council, so we can register a `club` TLA and mint member names. **The demo will say clearly that the club namespace is a test fixture on our deployment, not a mainnet namespace.**

## Environments

| Environment | What works | Cost | Status |
|---|---|---|---|
| Mainnet, read-only | resolve, verify, list by owner, NEP-641 sign-in by a real TLA owner | $0 (view calls; signing a message is not a transaction) | **Working now** |
| Local sandbox (near-workspaces) | Everything, including transfer and spend grants. No browser wallet (wallets cannot connect to a local chain). | $0 | **Blocked on this machine.** NEAR ships sandbox binaries only for linux-x86_64, linux-aarch64 and darwin-arm64. This Mac is Intel (x86_64), Docker is absent and only ~9 GB of disk is free, so building nearcore from source is not realistic. Works on an Apple Silicon Mac, on Linux, or in GitHub Actions. |
| Our testnet deployment | Everything, with a real browser wallet | ~70 testnet NEAR (free from faucets): about 43 NEAR to publish the 432 KB wallet as a global contract, plus storage for 5 contracts. **Requires your approval to deploy and to create testnet accounts.** | Not started |

## Update, 11 Nov ~10:00 UTC: decision taken, core flow working

- **The team approved a testnet deployment.** House of Stake's unmodified contracts are live under `akclub.testnet` (see `DEPLOYMENT.md`), funded only with faucet test NEAR.
- **Core journey proven on testnet:** resolve → verify → owner signs in → non-owner refused → `nft_transfer` → new owner signs in → old owner and old session refused (`pnpm e2e:transfer`, `pnpm e2e:server`).
- **Agent spend grant proven on testnet:** 0.2 NEAR allowed; overspend and unapproved recipient refused by the wallet contract; revoke works (`pnpm e2e:agent`).
- **Not yet done:** a human clicking through the browser wallet flow (Meteor or Intear: sign-message and transfer). MyNearWallet was dropped from the app because it no longer connects to apps.
- **Update, 12 Nov:** `pnpm demo:bootstrap` creates fresh testnet demo accounts from the faucet, so the scripted journeys no longer need the original team's keys.

## Decision needed (resolved: option 1)

The sandbox can't run on this Intel Mac, so **testnet is now the only place the transfer demo can run from here.**

1. **Approve a testnet deployment** of the House of Stake contracts (unmodified, `d85860a`) under new testnet accounts the team controls, funded from free faucets (~70 testnet NEAR). This gives judges a browser demo with a real wallet. *Or*
2. **Run the sandbox on another machine:** your cofounder's Apple Silicon Mac or Linux box, or GitHub Actions (needs a push, which also needs your approval). *Or*
3. **Ship read + sign-in only:** this works today on mainnet, but without the transfer step the core journey isn't complete.

Until the team decides, the build continues on the parts that need neither: the SDK, the mainnet read and sign-in flow, and the Clubhouse UI.
