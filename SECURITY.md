# Security

## Scope

AccountKit is a hackathon project. It has been exercised on **NEAR testnet only**; it never writes to mainnet. The smart contracts it uses are House of Stake's, not ours. Report contract issues to [houseofstake/tla-contracts](https://github.com/houseofstake/tla-contracts).

In scope here:
- the SDK (`packages/sdk`): verification, sign-in checks and transaction building;
- the Clubhouse API and web app (`apps/clubhouse`);
- the scripts that hold test keys (`apps/clubhouse/scripts`).

## Reporting

Please open a private security advisory on this repository (GitHub → Security → Report a vulnerability) rather than a public issue. Include the steps to reproduce, and the network and accounts involved.

## What the code relies on

| Property | Where it is enforced |
|---|---|
| Only the current NFT owner can sign in as a name | `w_resolve_auth` in House of Stake's wallet, then `verifySignIn` re-reads the owner (`packages/sdk/src/auth.ts`) |
| A seller loses access the moment the NFT moves | The members gate re-reads ownership from chain on every request (`currentMember` in `apps/clubhouse/server/index.ts`) |
| An agent can't spend beyond its grant | House of Stake's wallet (`hos_grant_spend`, `charge_spend`); tested on testnet by `pnpm e2e:attack` |
| No key exists that bypasses the NFT | Verification check 9, `no-access-keys` |
| Transfers never go to an account that doesn't exist yet | `prepareTransfer` in `packages/sdk/src/kit.ts` |

## Keys and secrets

- No keys are committed. Test keys live in `~/.near-credentials` or the git-ignored `apps/clubhouse/.demo-keys/`.
- The API signs only for the demo test accounts named in `.env`. Real users sign in their own wallet; Clubhouse never asks for a seed phrase or private key.
- `SESSION_SECRET`, when set, must stay out of the repository.

## Hardening in the API

- Listens on `127.0.0.1` by default; refuses cross-site POSTs.
- Per-IP rate limits on sign-in (30 a minute) and live runs (6 per 10 minutes).
- Sign-in challenges are HMAC-signed tokens that expire after 5 minutes; each is accepted once per server instance.
- HMAC-signed `HttpOnly`, `SameSite=Lax` session cookies (`Secure` with `COOKIE_SECURE=1`).
- `nosniff`, `DENY` framing and `no-referrer` headers on every response.
- Malformed or oversized bodies are refused with 400 or 413.

## Known limits

- The live run's server holds test keys. Don't run it with keys to accounts that hold real value.
- Rate limits and the record of used challenges are kept in memory, so they reset on restart and aren't shared between instances (the hosted copy can run several). Within its 5 minutes, a challenge's signature could be replayed on another instance by someone who captured it; only the owner's wallet can produce it.
- The agent's own key is full-access, because House of Stake's wallet requires a deposit on extension calls, which function-call keys can't attach. Its spending is contained by the on-chain grant (see the README).
