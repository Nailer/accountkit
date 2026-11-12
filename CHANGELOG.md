# Changelog

All notable changes. Dates are UTC.

## 0.2.0 — 12 Nov 2026

### Added
- `pnpm demo:bootstrap`: creates your own testnet demo accounts from the faucet and rents a membership, so the live run and e2e scripts no longer need our keys. It retries the faucet with backoff and backs up `.env`.
- `pnpm demo:status`, a read-only check of the demo setup, and `pnpm e2e:all`.
- `pnpm e2e:attack`: a hijacked agent is refused on chain when it tries to pay itself, add an accomplice, remove the owner or sign in as the membership; a sale mid-payout ends its access.
- SDK: `parseNear` / `formatNear`, the `INVALID_INPUT` error code, a README, a read-only transfer dry-run example, and coverage reporting.
- API: `GET /api/health`, request logging, graceful shutdown, `SESSION_SECRET` and `COOKIE_SECURE`.
- Web: a one-click refusal example in the lookup, account-history links to NearBlocks, Copy log for live runs, per-page titles, arrow-key tabs, Escape to close the menu, and footer links to the source.
- Logo set, favicon, touch icon and link-preview image.
- CI (lint, tests, typecheck, web build, a live mainnet read), Biome linting, `.editorconfig`, `.nvmrc`, `SECURITY.md`.

### Changed
- `prepareTransfer` refuses the account itself, its registry and its lease authority as receivers.
- `grantSpendTx` refuses grants the wallet would refuse: no or duplicate receivers, the account as receiver or extension, a negative budget, a past expiry.
- The API listens on 127.0.0.1, refuses cross-site POSTs, rate-limits sign-in and live runs, caps outstanding challenges, sends security headers, and answers bad input with 400/413 instead of 500.
- The app now says that a transfer returns the account's spare NEAR to the seller, as House of Stake's wallet does.
- README rewritten with diagrams, use cases, a transfer threat model and the on-chain attack log.

### Fixed
- Agent results reused the wrong rows because they were keyed by index.
- `/api/names` without an owner surfaced a raw contract panic.
- A live run could hold its lock forever if RPC hung; it now stops after 3 minutes.
- Buttons inside forms without an explicit type.

### Removed
- The unused MyNearWallet module.

### Tests
- SDK: 79 offline tests (from 16), covering RPC failover, transfers, spend grants, renting, each verification check, sign-in requests and NEAR amounts.
- API: 26 tests for sessions, the cross-site check, body parsing and rate limiting.

## 0.1.0 — 11 Nov 2026

- `@accountkit/sdk`: resolve and verify House of Stake Top Level Accounts (13 checks), NEP-413 / NEP-641 sign-in, safe transfer, renting and agent spend grants.
- Clubhouse: a members area gated on current ownership, a live testnet run, wallet sign-in and transfer, and name lookup.
- Our testnet deployment of House of Stake's unmodified contracts (`akclub.testnet`).
