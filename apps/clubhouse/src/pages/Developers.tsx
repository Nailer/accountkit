import { motion } from "motion/react";
import { type Config } from "../api";
import { CodeBlock } from "../components/CodeBlock";
import { Reveal } from "../components/motion";
import { Alert, ButtonLink, Pill } from "../components/primitives";
import { useToast } from "../components/toast";
import { ArrowRightIcon, CopyIcon, PlayIcon } from "../icons";
import { copyText } from "../lib/copy";
import { SDK_SNIPPETS } from "../lib/snippets";

const API = [
  { group: "Read", items: [
    ["new AccountKit({ network })", "mainnet, testnet or sandbox. Picks RPC endpoints with fallback. Reads only; never holds keys."],
    ["kit.resolve(name)", "Registrar config, NFT record, item info, lease, extensions, keys and balance, all read at one pinned block."],
    ["verifyItem(info)", "13 checks that the registry's NFT and the account agree. Returns ok, active, owner and every check with its detail."],
    ["kit.ownerOf(name) · kit.assertOwner(name, id)", "The verified, active owner, or a typed error."],
    ["kit.namesOwnedBy(owner)", "Names an account holds, from the registry's owner index."],
    ["kit.agentStatus(name, ext) · kit.spendGrant(name, ext)", "Whether an extension is enabled and its on-chain grant."],
  ]},
  { group: "Sign in (NEP-641)", items: [
    ["createSignInRequest({ tla, owner, chainId, payload })", "What the owner's wallet signs with NEP-413: message, recipient and a 32-byte nonce that binds every field."],
    ["buildAuthorization(request, signed)", "Wraps the wallet's signature into the blob the TLA's w_resolve_auth accepts."],
    ["verifySignIn(kit, { tla, authorization, expectedPayload })", "Server side: resolves the tree at one block and accepts only the current verified owner."],
  ]},
  { group: "Transactions (signed by the user's wallet)", items: [
    ["kit.prepareTransfer(name, from, to)", "NEP-171 nft_transfer on the registry. Refuses receivers that don't exist."],
    ["kit.rentQuote(tla, label)", "Availability, price and the rent_sub_account transaction."],
    ["addExtensionTx · removeExtensionTx", "Enable or remove an agent or co-owner on the account."],
    ["grantSpendTx · revokeSpendTx", "hos_grant_spend: budget, receivers, token and item allowances, expiry."],
    ["executeTx(name, request)", "w_execute_extension with a wallet request (nearTransfer, functionCall, ftTransfer)."],
  ]},
];

const ERRORS = [
  ["INVALID_NAME", "Not a valid account id of the form label.tla"],
  ["NOT_FOUND", "The account, registrar or record doesn't exist"],
  ["NOT_A_TLA", "The account exists but isn't a House of Stake leased name"],
  ["LEASE_EXPIRED", "Parked, frozen or past its lease"],
  ["WRONG_OWNER", "The caller isn't the current owner"],
  ["RPC_UNAVAILABLE", "No RPC endpoint answered"],
  ["CONTRACT_PANIC", "The contract refused the call (message included)"],
  ["AUTH_INVALID", "An NEP-641 authorization didn't resolve"],
];

const CONTRACTS = [
  ["Network", "NEAR testnet"],
  ["Club namespace (TLA + registrar)", "akclub.testnet"],
  ["Registry (NFT collection)", "registry.akclub.testnet"],
  ["Wallet code (global contract)", "impl.akclub.testnet"],
  ["Lease authority", "ext.akclub.testnet"],
  ["Contract source", "houseofstake/tla-contracts @ d85860a (unmodified)"],
  ["Mainnet registry (read-only)", "registry.hos"],
];

function CopyValue({ v }: { v: string }) {
  const toast = useToast();
  return (
    <button className="copy-val mono" onClick={() => copyText(v).then(() => toast("ok", `Copied ${v}`), () => toast("bad", "Couldn't copy"))} aria-label={`Copy ${v}`}>
      {v} <CopyIcon />
    </button>
  );
}

export function Developers({ config }: { config: Config }) {
  return (
    <div className="devpage">
      <section className="dev-hero theme-ink" aria-labelledby="dev-h1">
        <div className="container dev-hero-grid">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="eyebrow">AccountKit SDK</span>
            <h1 id="dev-h1">Use House of Stake accounts without learning six contracts.</h1>
            <p className="lede">A small TypeScript library. Dependencies: @noble/curves, @noble/hashes and @scure/base. Every function below maps to a contract method in tla-contracts @ d85860a.</p>
            <div className="dev-status">
              <Pill tone="warn">Workspace package · not published to npm yet</Pill>
              <Pill tone="ok">16 unit tests · live mainnet read test</Pill>
            </div>
            <div className="hero-ctas">
              <ButtonLink to="/demo#live" icon={<PlayIcon width={18} height={18} />}>See it run on testnet</ButtonLink>
              <ButtonLink to="/developers#reference" variant="secondary" trailing={<ArrowRightIcon width={16} height={16} className="arrow" />}>API reference</ButtonLink>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}>
            <CodeBlock tabs={SDK_SNIPPETS} title="clubhouse.ts" />
          </motion.div>
        </div>
      </section>

      <section className="theme-paper dev-section" aria-labelledby="qs-title">
        <div className="container dev-two">
          <div>
            <Reveal><span className="eyebrow">Quickstart</span></Reveal>
            <Reveal delay={0.05}><h2 id="qs-title">Run it from the repository.</h2></Reveal>
            <Reveal delay={0.1}><p className="lede">Until the package is published, use it from the monorepo. Node 20.12+ and pnpm 10.</p></Reveal>
            <Reveal delay={0.15}>
              <Alert tone="info" title="What's verified">
                <p>Unit tests cover Borsh, NEP-641 hashing, sign-in round trips, verification refusing tampered records and transaction shapes. The live test reads a real mainnet name from registry.hos.</p>
              </Alert>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <CodeBlock title="terminal" code={`pnpm install
pnpm --filter @accountkit/sdk build

# read and verify a real mainnet name (free, read-only)
pnpm test:live

# run Clubhouse against our testnet deployment
cp apps/clubhouse/.env.example apps/clubhouse/.env
pnpm --filter clubhouse dev`} />
          </Reveal>
        </div>
      </section>

      <section id="reference" className="theme-ink dev-section" aria-labelledby="ref-title">
        <div className="container">
          <Reveal><span className="eyebrow">API reference</span></Reveal>
          <Reveal delay={0.05}><h2 id="ref-title">Every function, and what it touches.</h2></Reveal>
          <div className="api-groups">
            {API.map((g, gi) => (
              <Reveal key={g.group} delay={0.06 * gi} className="api-group card">
                <h3>{g.group}</h3>
                <ul>
                  {g.items.map(([sig, desc]) => (
                    <li key={sig}><code>{sig}</code><span>{desc}</span></li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="theme-paper dev-section" aria-labelledby="contracts-title">
        <div className="container dev-two">
          <div id="contracts">
            <Reveal><span className="eyebrow">Network &amp; contracts</span></Reveal>
            <Reveal delay={0.05}><h2 id="contracts-title">Exactly what Clubhouse talks to.</h2></Reveal>
            <Reveal delay={0.1}>
              <p className="lede">House of Stake's contracts, unmodified, deployed by us on testnet with their own deploy scripts. The club namespace is a test fixture: on mainnet only House of Stake's council can create one.</p>
            </Reveal>
            <Reveal delay={0.15}>
              <dl className="kv">
                {CONTRACTS.map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{k === "Network" || k === "Contract source" ? <span className="mono">{v}</span> : <CopyValue v={v} />}</dd></div>
                ))}
              </dl>
            </Reveal>
          </div>
          <div id="errors">
            <Reveal><span className="eyebrow">Error codes</span></Reveal>
            <Reveal delay={0.05}><h2>Typed failures, for branching.</h2></Reveal>
            <Reveal delay={0.1} className="card err-card">
              <table>
                <tbody>
                  {ERRORS.map(([c, d]) => (
                    <tr key={c}><td><code>{c}</code></td><td>{d}</td></tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          </div>
        </div>
      </section>
      <span hidden>{config.network}</span>
    </div>
  );
}
