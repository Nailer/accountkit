# Testnet deployment (our own copy of House of Stake's contracts)

House of Stake's TLA contracts, **unmodified**, from `houseofstake/tla-contracts` @ `d85860a8cc2bfcb8b617b28cab558da5d39333fc`. Deployed 11 Nov 2026 with the repo's own scripts (`integration/tests/testnet_deploy.rs`: `deploy_demo_fleet_to_testnet`, then `deploy_marketplace_to_testnet`). Funded only with free testnet NEAR from the NEAR faucet. **No mainnet transactions and no real funds.**

## Accounts

| Role | Account |
|---|---|
| TLA + registrar (the club namespace) | `akclub.testnet` |
| Registry (NFT collection, NEP-171) | `registry.akclub.testnet` |
| Wallet code (global contract publisher) | `impl.akclub.testnet` (hash `2xsUUcEMKJ6kqnPuH5JdT2J3KtQ3buWwHgxWxJN7ySg3`) |
| HoS extension (lease authority) | `ext.akclub.testnet` |
| Recovery | `rec.akclub.testnet` (two throwaway watcher keys; recovery is not part of the demo) |
| Council (us) | `council.akclub.testnet` |
| Demo membership | `alice-member.akclub.testnet` |
| Demo people | `ak-alice.testnet`, `ak-bob.testnet` (members), `ak-agent.testnet` (agent), `ak-shop.testnet` (approved recipient) |

Keys for all of these live only in the local NEAR CLI keychain (`~/.near-credentials/testnet/`) of the machine that deployed them. None are in this repository.

## What differs from House of Stake's mainnet

- **The club namespace is a test fixture.** We are the council of our own deployment, so we could register `akclub.testnet` as an open TLA. On mainnet only House of Stake's council can create namespaces.
- **Price staleness window extended.** The registry refuses to price rentals once its NEAR/USD rate is older than `max_rate_age_ns` (6 h by default), and a price keeper normally refreshes it. We run no keeper, so as council we set `max_rate_age_ns` to 30 days with `update_fee_config`. Renting then works until about 11 Dec 2026.
- **Not configured:** Intents venue, FT allowlist and NFT metadata (`deployment_readiness` reports `ready: false` for these). The Clubhouse flows don't use them.

## Evidence (testnet transactions)

| Step | Transaction |
|---|---|
| Fleet mint: the owner account drives a keyless account | [FrVAmEYy…](https://testnet.nearblocks.io/txns/FrVAmEYy8ppQPPzJBwdhkLk8UeCCC7GN2yg6uvD5pyN3) |
| `ak-alice` rents `alice-member.akclub.testnet` (`rent_sub_account`) | [7hbKj26K…](https://testnet.nearblocks.io/txns/7hbKj26KpPbsbGGSAFE36A7wsgjApF4imrDkDEKKsC7f) |
| `ak-shop` rents `shop-membership-01.akclub.testnet` with the SDK's `rentQuote()` transaction (the "Join the club" path) | [GeAwLwxD…](https://testnet.nearblocks.io/txns/GeAwLwxDzNMbBkz48gLVVTdiWoASfVbpkuzQdzNoqtSp) |
| Membership transfer `ak-bob → ak-alice` (`nft_transfer`) | [38iJfbA1…](https://testnet.nearblocks.io/txns/38iJfbA11EHoXVW8fyCcjNHVVeCwvmiS8SqhMd5JPLVE) |
| Membership transfer `ak-alice → ak-bob` during the server-gate test | [G9uqMaRa…](https://testnet.nearblocks.io/txns/G9uqMaRakfpbSJxmiQshktz88bLYwyC2HjF4qUv5wWLU) |
| Agent pays the approved 0.2 NEAR bill: **allowed** | [EThXoD5U…](https://testnet.nearblocks.io/txns/EThXoD5USwz5UREG9mQ49T6YE1N9xQcGu74SpBzhAtit) |
| Agent tries 0.4 NEAR more: **refused**, "spend exceeds the granted cap" | [5dGh93ia…](https://testnet.nearblocks.io/txns/5dGh93iapiM17xf43x4djFJMarYUMwnTps7yzPcPJ9Ve) |
| Agent pays an unapproved account: **refused**, "receiver is not in the spend grant" | [BShpmMxL…](https://testnet.nearblocks.io/txns/BShpmMxLupKMGAujtyiBGoFzHpkguk6whAMT7ziSVftW) |

### From a fresh copy of the repository, 12 Nov 2026

`pnpm demo:bootstrap` created `akd-b41c3c-a`, `-b` and `-agent` `.testnet` from the faucet, then `pnpm e2e:transfer`, `e2e:agent` and `e2e:attack` ran with only those keys.

| Step | Transaction |
|---|---|
| `rentQuote()` rent of `akdb41c3c-member.akclub.testnet` (1.591 test NEAR) | [fPWXAHRX…](https://testnet.nearblocks.io/txns/fPWXAHRXZu94CTYdeLTrtYV6DfJaTDfj8jJvTrwo1d1) |
| Transfer a → b (`e2e:transfer`) | [4Hgzh96Q…](https://testnet.nearblocks.io/txns/4Hgzh96QYY9bduFVHVEVUC6ydakrprgXbNEJ7dXFaD9Q) |
| Hijacked agent pays itself: **refused**, "receiver is not in the spend grant" | [5NfmZMQg…](https://testnet.nearblocks.io/txns/5NfmZMQgqLUi5ePGuFybCY3DNXEX6LKbs7sULxENPK7D) |
| Hijacked agent adds an accomplice: **refused**, "only the owner may perform this operation" | [GQKLbJXe…](https://testnet.nearblocks.io/txns/GQKLbJXebXwuh8jLMWWsQfJDK4KE6wdLUFXDek61P1yW) |
| Hijacked agent removes the owner: **refused** | [BboxK85E…](https://testnet.nearblocks.io/txns/BboxK85Ea9iAZmTjbdsND4qCDHn6JyxyTjKp5Ay43AC4) |
| Sale in the middle of a payout (`nft_transfer`) | [A8QmDhpa…](https://testnet.nearblocks.io/txns/A8QmDhpaYdSv7dztW77vQtS8p4Dr4SYzjmoNPcJzeWVz) |
| Agent's next payment after the sale: **refused**, extension not enabled | [84qj1nU4…](https://testnet.nearblocks.io/txns/84qj1nU4PQyjbxFMLn5cqVxaU5BKErc8URddBaewzx2r) |

## What a transfer does to the account's NEAR

House of Stake's wallet sweeps the account's spare NEAR (everything above its storage reserve) to the **outgoing** payout account on every sale or transfer, then makes the new owner the payout account (`hos-wallet/src/lib.rs`, `apply_rotation` and `sweep_to`). In the sale above, the account went from 0.610 to 0.010 test NEAR and the seller received it. A buyer gets control of the account, not its spare NEAR. The demo funds the membership account again before each agent run for this reason.

The e2e scripts move the membership back and forth, so its current owner depends on the last run. Check it with the Clubhouse lookup box or `pnpm --filter @accountkit/sdk example:resolve alice-member.akclub.testnet testnet`.

## An incident worth knowing about

Our first transfer went to `ak-bob.testnet` before that account existed: the faucet had rate-limited us and our script misread its output. The registry accepted it, because NEP-171 `nft_transfer` accepts any valid account id. Until the account was created, the membership belonged to whoever would create that name first. We created it with our saved key, so nothing was lost. AccountKit's `prepareTransfer()` now refuses receivers that don't exist, and the e2e test checks this.

## The hosted copy (accountkit.vercel.app)

https://accountkit.vercel.app runs the same web app and API as `pnpm dev`, on NEAR testnet. `apps/clubhouse/scripts/build-vercel.mjs` builds it in Vercel's Build Output format: the web app as static files, and the API (`server/vercel.ts`, which calls the same routes as `server/index.ts`) bundled with esbuild into one Node function.

```bash
cd apps/clubhouse
pnpm build:vercel                     # writes apps/clubhouse/.vercel/output
vercel deploy --prebuilt --prod
```

Settings are Vercel environment variables: `NETWORK=testnet`, `CLUB_TLA=akclub.testnet`, `AGENT_ACCOUNT`, `AGENT_APPROVED`, `COOKIE_SECURE=1`, `TRUST_PROXY=1`, `ALLOWED_ORIGINS=https://accountkit.vercel.app`, a random `SESSION_SECRET`, and `DEMO_KEYS`, the demo accounts' testnet keys as JSON. The keys are never in the repository or the build output.

