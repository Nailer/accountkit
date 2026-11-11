import { AccountKit, buildAuthorization, type WalletTransaction } from "@accountkit/sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatNear, formatNs, type Config, type Membership, type MembersResponse } from "./api";
import { connect, currentWallet, disconnect, signAndSend, signMessage, WALLETS } from "./wallet";
import { AgentPanel } from "./AgentPanel";

type Busy = null | string;

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function Checks({ m }: { m: Membership }) {
  return (
    <details className="checks">
      <summary>
        {m.verified ? "Verified" : "Not verified"} · {m.checks.filter((c) => c.ok).length}/{m.checks.length} checks · block{" "}
        {m.block.height}
      </summary>
      <ul>
        {m.checks.map((c) => (
          <li key={c.id} className={c.ok ? "ok" : "fail"}>
            <span>{c.ok ? "✓" : "✗"}</span>
            <code>{c.id}</code> {c.detail}
          </li>
        ))}
      </ul>
    </details>
  );
}

function MembershipCard({ m }: { m: Membership }) {
  return (
    <div className="card membership">
      <div className="label">Membership</div>
      <div className="name">{m.name}</div>
      <dl>
        <dt>Owner</dt>
        <dd>{m.owner ?? "—"}</dd>
        <dt>Account balance</dt>
        <dd>{formatNear(m.balanceYocto)}</dd>
        <dt>Lease until</dt>
        <dd>{formatNs(m.leaseUntilNs)}</dd>
        <dt>Registry</dt>
        <dd>{m.registry}</dd>
      </dl>
      <Checks m={m} />
    </div>
  );
}

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [names, setNames] = useState<string[] | null>(null);
  const [members, setMembers] = useState<MembersResponse | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiver, setReceiver] = useState("");
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [lookupName, setLookupName] = useState("");
  const [lookup, setLookup] = useState<Membership | null>(null);
  const [joinLabel, setJoinLabel] = useState("");

  const kit = useMemo(() => (config ? new AccountKit({ network: config.network, chainId: config.chainId }) : null), [config]);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const refreshMembers = useCallback(async () => setMembers(await api.members()), []);

  useEffect(() => {
    api.config().then(async (c) => {
      setConfig(c);
      const w = await currentWallet(c.network).catch(() => null);
      if (w) setAccount(w.accountId);
      setMembers(await api.members());
    }, (e) => setError(`API unreachable: ${e.message}`));
  }, []);

  useEffect(() => {
    if (!account) return setNames(null);
    api.names(account).then((r) => setNames(r.names), (e) => setError(e.message));
  }, [account, members?.ok]);

  if (!config) return <main className="shell">{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>;

  const network = config.network;
  const signedIn = members?.ok === true;
  const refused = members && !members.ok && members.signedInAs;

  const enter = (tla: string) =>
    run(`Signing in as ${tla}`, async () => {
      const ch = await api.challenge(tla, account!);
      if (ch.error) throw new Error(ch.error);
      const nonce = decodeBase64(ch.nep413.nonce);
      const signed = await signMessage(network, { message: ch.nep413.message, recipient: ch.nep413.recipient, nonce });
      const authorization = buildAuthorization(
        { tla, owner: account!, payload: ch.nep413.message, offchainMessage: ch.offchainMessage, nep413: { ...ch.nep413, nonce } },
        { publicKey: signed.publicKey, signature: signed.signature },
      );
      const res = await api.login(ch.id, authorization);
      if (!res.ok) throw new Error(res.reason ?? "sign-in refused");
      await refreshMembers();
    });

  const transfer = () =>
    run("Waiting for your wallet", async () => {
      const m = members!.membership!;
      const tx: WalletTransaction = await kit!.prepareTransfer(m.name, account!, receiver);
      const out: any = await signAndSend(network, tx);
      setLastTx(out?.transaction?.hash ?? out?.transaction_outcome?.id ?? null);
      setBusy("Re-checking membership on chain");
      for (let i = 0; i < 10; i++) {
        const r = await api.members();
        if (!r.ok) return setMembers(r);
        await new Promise((res) => setTimeout(res, 1500));
      }
      await refreshMembers();
    });

  return (
    <main className="shell">
      <header>
        <div className="brand">
          <span className="mark">◆</span> Clubhouse
        </div>
        <div className="meta">
          <span className="badge">{network}</span>
          {config.club && <span className="badge subtle">club: {config.club}</span>}
          {account && (
            <>
              <span className="acct">{account}</span>
              <button
                className="link"
                onClick={() =>
                  run("Disconnecting", async () => {
                    await api.logout();
                    await disconnect(network);
                    setAccount(null);
                    setMembers(await api.members());
                  })
                }
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </header>

      {busy && <div className="busy">{busy}…</div>}
      {error && <div className="error">{error}</div>}

      {refused && (
        <section className="card denied">
          <h2>Access refused</h2>
          <p>{members!.reason}</p>
          <p className="muted">
            The server checks the chain on every request. Your sign-in for <b>{members!.tla}</b> was valid, but the membership has moved.
          </p>
          {lastTx && (
            <p>
              Transfer:{" "}
              <a href={`https://${network === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${lastTx}`} target="_blank" rel="noreferrer">
                {lastTx.slice(0, 12)}…
              </a>
            </p>
          )}
          <button onClick={() => run("Signing out", async () => { await api.logout(); await refreshMembers(); })}>Sign out</button>
        </section>
      )}

      {signedIn && members?.membership && (
        <section className="members">
          <div className="welcome">
            <div className="label">Members only</div>
            <h1>Welcome in, {members.member}.</h1>
            {members.notes?.map((n) => <p key={n} className="muted">{n}</p>)}
            <p className="muted small">Last checked {members.checkedAt}</p>
            <div className="row">
              <button onClick={() => run("Re-checking", refreshMembers)}>Re-check ownership</button>
              <button className="link" onClick={() => run("Signing out", async () => { await api.logout(); await refreshMembers(); })}>
                Sign out
              </button>
            </div>
          </div>
          <MembershipCard m={members.membership} />
          {account === members.member && config.agent && (
            <AgentPanel network={network} tla={members.membership.name} balanceYocto={members.membership.balanceYocto} onChange={refreshMembers} run={run} />
          )}
          {account === members.member && (
            <div className="card">
              <div className="label">Hand over your membership</div>
              <p className="muted">
                Sends the NEP-171 <code>nft_transfer</code> on the registry from your wallet. The account, its balance and its access move to the receiver.
                AccountKit refuses receivers that don't exist.
              </p>
              <div className="row">
                <input placeholder="receiver.testnet" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
                <button disabled={!receiver || !!busy} onClick={transfer}>
                  Transfer
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {!signedIn && !refused && (
        <section className="hero">
          <h1>Members only.</h1>
          <p className="lede">
            Your membership is a real NEAR account you own: a House of Stake Top Level Account. Sign in by proving you own it. Sell it, and your access goes with it.
          </p>
          {!account && (
            <div className="row">
              {WALLETS.map((w) => (
                <button key={w.id} onClick={() => run(`Connecting ${w.label}`, async () => setAccount(await connect(network, w.id)))}>
                  Connect {w.label}
                </button>
              ))}
            </div>
          )}
          {account && names && (
            <div className="card">
              <div className="label">Your memberships</div>
              {names.length === 0 && <p className="muted">{account} holds no {config.club ? `${config.club} ` : ""}membership.</p>}
              <ul className="names">
                {names.map((n) => (
                  <li key={n}>
                    <span>{n}</span>
                    <button disabled={!!busy} onClick={() => enter(n)}>
                      Sign in as {n.split(".")[0]}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="muted small">Signing in asks your wallet to sign a message (NEP-413). No transaction, no gas.</p>
            </div>
          )}
          {account && names && config.club && network !== "mainnet" && (
            <div className="card">
              <div className="label">Join the club</div>
              <p className="muted">
                Rent <code>yourname.{config.club}</code> through House of Stake's registry (<code>rent_sub_account</code>). It becomes a real account you own.
                Names of 12+ characters are cheapest (~1.7 test NEAR).
              </p>
              <div className="row">
                <input placeholder="your-name-here" value={joinLabel} onChange={(e) => setJoinLabel(e.target.value.toLowerCase())} />
                <button
                  disabled={!joinLabel || !!busy}
                  onClick={() =>
                    run("Waiting for your wallet", async () => {
                      const q = await kit!.rentQuote(config.club!, joinLabel);
                      if (!q.available) throw new Error(`${q.name} is taken`);
                      await signAndSend(network, q.tx);
                      setJoinLabel("");
                      setNames((await api.names(account)).names);
                    })
                  }
                >
                  Rent with my wallet
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card lookup">
        <div className="label">Look up any leased name</div>
        <div className="row">
          <input placeholder={network === "mainnet" ? "ibuiltthisshit.bid" : "alice-member.akclub.testnet"} value={lookupName} onChange={(e) => setLookupName(e.target.value)} />
          <button disabled={!lookupName} onClick={() => run("Reading chain", async () => setLookup(await api.lookup(lookupName)))}>
            Verify
          </button>
        </div>
        {lookup && <MembershipCard m={lookup} />}
      </section>

      <footer className="muted small">
        Built with AccountKit on House of Stake's TLA contracts. {network === "testnet" && "Testnet: test tokens only."}
      </footer>
    </main>
  );
}
