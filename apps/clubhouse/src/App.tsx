import { AccountKit, buildAuthorization, type WalletTransaction } from "@accountkit/sdk";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AgentPanel } from "./AgentPanel";
import { api, formatNear, formatNs, type Config, type Membership, type MembersResponse } from "./api";
import {
  ArrowRightIcon,
  CheckIcon,
  ClubMark,
  DoorIcon,
  ExternalIcon,
  KeyIcon,
  LogOutIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
  SwapIcon,
  WalletIcon,
  XIcon,
} from "./icons";
import { Alert, Button, ErrorAlert, Spinner, StatusPill } from "./ui";
import { connect, currentWallet, disconnect, signAndSend, signMessage, WALLETS } from "./wallet";

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const explorerTx = (network: string, hash: string) => `https://${network === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${hash}`;

/** A mainnet-only account id (`*.near`) can't sign on testnet, and vice versa. Implicit (hex) ids work on both. */
function networkMismatch(network: string, accountId: string): boolean {
  if (/^[0-9a-f]{64}$/.test(accountId) || accountId.startsWith("0x")) return false;
  if (network === "testnet") return accountId.endsWith(".near");
  if (network === "mainnet") return accountId.endsWith(".testnet");
  return false;
}

/* ---------------------------------------------------------------- pieces */

function Checks({ m }: { m: Membership }) {
  const passed = m.checks.filter((c) => c.ok).length;
  return (
    <details className="checks">
      <summary>
        {passed}/{m.checks.length} on-chain checks · block {m.block.height.toLocaleString()}
      </summary>
      <ul>
        {m.checks.map((c) => (
          <li key={c.id} className={c.ok ? "ok" : "fail"}>
            <span className="check-icon">{c.ok ? <CheckIcon width={14} height={14} /> : <XIcon width={14} height={14} />}</span>
            <span>
              <code>{c.id}</code> {c.detail}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function MembershipCard({ m, network, title = "Membership account" }: { m: Membership; network: string; title?: string }) {
  return (
    <div className="card membership-card">
      <div className="card-head">
        <div className="eyebrow">{title}</div>
        <div className="pills">
          <StatusPill ok={m.verified}>{m.verified ? "Record verified" : "Not verified"}</StatusPill>
          <StatusPill ok={m.active}>{m.active ? "Active" : "Inactive"}</StatusPill>
        </div>
      </div>
      <div className="account-name">{m.name}</div>
      <dl className="facts">
        <dt>Current owner</dt>
        <dd className="mono">{m.owner ?? "—"}</dd>
        <dt>Balance</dt>
        <dd>
          {formatNear(m.balanceYocto)}
          {network !== "mainnet" && <span className="unit-note"> (testnet)</span>}
        </dd>
        <dt>Lease until</dt>
        <dd>{formatNs(m.leaseUntilNs)}</dd>
        <dt>Registry</dt>
        <dd className="mono">{m.registry}</dd>
      </dl>
      <Checks m={m} />
    </div>
  );
}

/** Explains the idea with a labelled example (not live data). */
function AnatomyCard({ club }: { club: string | null }) {
  const example = `alice-member.${club ?? "akclub.testnet"}`;
  return (
    <aside className="card anatomy" aria-labelledby="anatomy-title">
      <div className="card-head">
        <div className="eyebrow" id="anatomy-title">
          How a membership works
        </div>
        <span className="tag">Example</span>
      </div>
      <ol className="anatomy-chain">
        <li>
          <span className="node-icon">
            <ShieldCheckIcon />
          </span>
          <div>
            <div className="node-title">Membership NFT</div>
            <div className="node-text">
              A record in House of Stake's registry: <span className="mono">{example}</span>
            </div>
          </div>
        </li>
        <li>
          <span className="node-icon">
            <KeyIcon />
          </span>
          <div>
            <div className="node-title">A real NEAR account, same name</div>
            <div className="node-text">It can hold tokens. It has no keys of its own, so nobody can keep a copy of it.</div>
          </div>
        </li>
        <li>
          <span className="node-icon accent">
            <WalletIcon />
          </span>
          <div>
            <div className="node-title">Controlled by its current owner</div>
            <div className="node-text">Whoever holds the NFT controls the account from their own wallet.</div>
          </div>
        </li>
      </ol>
      <p className="anatomy-foot">
        <SwapIcon width={16} height={16} /> Transfer the NFT and the account, what it holds and its Clubhouse access all move to the new owner.
      </p>
    </aside>
  );
}

function HowItWorks() {
  const steps = [
    { icon: <WalletIcon />, title: "Connect a testnet wallet", text: "MyNearWallet or Meteor Wallet, on NEAR testnet. Clubhouse finds the memberships your account owns." },
    {
      icon: <KeyIcon />,
      title: "Prove you own one",
      text: "Your wallet signs a one-time message. It is not a transaction: nothing is sent and no fee is paid.",
    },
    {
      icon: <DoorIcon />,
      title: "Enter the members area",
      text: "Clubhouse re-checks the current owner on every visit. If the membership moves to someone else, your access ends.",
    },
  ];
  return (
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.title} className="step">
            <div className="step-top">
              <span className="step-num">{i + 1}</span>
              <span className="step-icon">{s.icon}</span>
            </div>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------------- app */

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [names, setNames] = useState<string[] | null>(null);
  const [namesError, setNamesError] = useState<string | null>(null);
  const [members, setMembers] = useState<MembersResponse | null>(null);
  const [busy, setBusy] = useState<{ key: string; label: string } | null>(null);
  const [failure, setFailure] = useState<{ key: string; raw: string; retry: () => void } | null>(null);
  const [receiver, setReceiver] = useState("");
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [joinLabel, setJoinLabel] = useState("");
  const [joined, setJoined] = useState<string | null>(null);
  const [lookupName, setLookupName] = useState("");
  const [lookup, setLookup] = useState<Membership | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  const kit = useMemo(() => (config ? new AccountKit({ network: config.network, chainId: config.chainId }) : null), [config]);

  /** Runs one user action at a time; remembers it so a failure can offer "Try again". */
  const run = useCallback(async (key: string, label: string, fn: () => Promise<void>) => {
    const attempt = async () => {
      setBusy({ key, label });
      setFailure(null);
      try {
        await fn();
      } catch (e) {
        setFailure({ key, raw: (e as Error).message, retry: () => void attempt() });
      } finally {
        setBusy(null);
      }
    };
    await attempt();
  }, []);

  const refreshMembers = useCallback(async () => setMembers(await api.members()), []);

  const boot = useCallback(() => {
    setBootError(null);
    api.config().then(
      async (c) => {
        setConfig(c);
        const w = await currentWallet(c.network).catch(() => null);
        if (w) setAccount(w.accountId);
        setMembers(await api.members());
      },
      (e) => setBootError(`API unreachable: ${e.message}`),
    );
  }, []);
  useEffect(boot, [boot]);

  const loadNames = useCallback(() => {
    if (!account) return setNames(null);
    setNames(null);
    setNamesError(null);
    api.names(account).then(
      (r) => setNames(r.names),
      (e) => setNamesError(e.message),
    );
  }, [account]);
  useEffect(loadNames, [loadNames, members?.ok]);

  if (!config) {
    return (
      <div className="app">
        <main className="container boot">
          {bootError ? <ErrorAlert raw={bootError} onRetry={boot} /> : <p className="muted"><Spinner /> Loading Clubhouse…</p>}
        </main>
      </div>
    );
  }

  const network = config.network;
  const netLabel = network === "mainnet" ? "NEAR mainnet" : network === "testnet" ? "NEAR testnet" : network;
  const signedIn = members?.ok === true;
  const refused = !!(members && !members.ok && members.signedInAs);
  const wrongNetwork = account ? networkMismatch(network, account) : false;
  const isBusy = (key: string) => busy?.key === key;
  const failed = (key: string) => (failure?.key === key ? failure : null);

  const signOut = () => run("signout", "Signing out", async () => {
    await api.logout();
    await refreshMembers();
  });

  const disconnectWallet = () =>
    run("disconnect", "Disconnecting", async () => {
      await api.logout();
      await disconnect(network);
      setAccount(null);
      setJoined(null);
      setMembers(await api.members());
    });

  const enter = (tla: string) =>
    run(`enter:${tla}`, `Waiting for your wallet to sign in as ${tla}`, async () => {
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

  const transfer = (e: FormEvent) => {
    e.preventDefault();
    return run("transfer", "Waiting for your wallet to approve the transfer", async () => {
      const m = members!.membership!;
      const tx: WalletTransaction = await kit!.prepareTransfer(m.name, account!, receiver);
      const out: any = await signAndSend(network, tx);
      setLastTx(out?.transaction?.hash ?? out?.transaction_outcome?.id ?? null);
      setBusy({ key: "transfer", label: "Transfer sent. Re-checking ownership on chain" });
      for (let i = 0; i < 10; i++) {
        const r = await api.members();
        if (!r.ok) return setMembers(r);
        await new Promise((res) => setTimeout(res, 1500));
      }
      await refreshMembers();
    });
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    return run("join", "Waiting for your wallet to approve the rental", async () => {
      const q = await kit!.rentQuote(config.club!, joinLabel);
      if (!q.available) throw new Error(`${q.name} is taken`);
      await signAndSend(network, q.tx);
      setJoined(q.name);
      setJoinLabel("");
      setNames((await api.names(account!)).names);
    });
  };

  const verifyName = async (e: FormEvent) => {
    e.preventDefault();
    const name = lookupName.trim();
    if (!name || lookupBusy) return;
    setLookup(null);
    setLookupError(null);
    setLookupBusy(true);
    try {
      setLookup(await api.lookup(name));
    } catch (err) {
      setLookupError((err as Error).message);
    } finally {
      setLookupBusy(false);
    }
  };

  /* ---------------- header ---------------- */
  const header = (
    <header className="topbar">
      <div className="container topbar-inner">
        <a className="brand" href="/" aria-label="Clubhouse home">
          <ClubMark />
          <span>Clubhouse</span>
        </a>
        <div className="topbar-meta">
          <span className={`net-badge ${network === "mainnet" ? "net-main" : ""}`}>
            <span className="dot" /> {netLabel}
          </span>
          {account && (
            <div className="account-chip">
              <WalletIcon width={16} height={16} />
              <span className="mono" title={account}>
                {account}
              </span>
              <button className="chip-action" onClick={disconnectWallet} disabled={!!busy} title="Disconnect this wallet">
                <LogOutIcon width={16} height={16} />
                <span className="sr-only-sm">Disconnect</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  const globalFailure = failure;

  /* ---------------- views ---------------- */
  let view;

  if (members === null) {
    view = (
      <p className="progress-note session-check">
        <Spinner label="Checking your session" /> Checking your Clubhouse session on chain…
      </p>
    );
  } else if (refused) {
    const m = members!;
    view = (
      <section className="state-card refused" aria-labelledby="refused-title">
        <span className="state-icon bad">
          <XIcon />
        </span>
        <div className="eyebrow">Members area</div>
        <h1 id="refused-title">Access refused</h1>
        <p className="lede">{m.reason}</p>
        <p className="muted">
          Your sign-in for <span className="mono">{m.tla}</span> was valid when you made it. Clubhouse checks the current owner on every visit, and this
          membership now belongs to <span className="mono">{m.currentOwner ?? "someone else"}</span>.
        </p>
        {lastTx && (
          <p>
            <a className="ext-link" href={explorerTx(network, lastTx)} target="_blank" rel="noreferrer">
              View the transfer on NearBlocks <ExternalIcon />
            </a>
          </p>
        )}
        <div className="actions">
          <Button onClick={signOut} loading={isBusy("signout")} icon={<LogOutIcon width={18} height={18} />}>
            Sign out
          </Button>
        </div>
      </section>
    );
  } else if (signedIn && members?.membership) {
    const m = members.membership;
    const isOwnerWallet = account === members.member;
    view = (
      <>
        <section className="members-head">
          <div>
            <div className="eyebrow">Members area</div>
            <h1>Welcome in.</h1>
            <p className="lede">
              Signed in as <span className="mono strong">{members.member}</span>, owner of <span className="mono strong">{m.name}</span>.
            </p>
            <p className="muted small">
              <ShieldCheckIcon width={16} height={16} className="inline-icon" /> Ownership confirmed on chain at{" "}
              {members.checkedAt ? new Date(members.checkedAt).toLocaleTimeString() : "—"}. This check runs again on every visit.
            </p>
          </div>
          <div className="actions">
            <Button variant="secondary" onClick={() => run("recheck", "Re-checking ownership", refreshMembers)} loading={isBusy("recheck")} icon={<RefreshIcon width={18} height={18} />}>
              Re-check ownership
            </Button>
            <Button variant="ghost" onClick={signOut} loading={isBusy("signout")} icon={<LogOutIcon width={18} height={18} />}>
              Sign out
            </Button>
          </div>
        </section>

        {!isOwnerWallet && account && (
          <Alert tone="warning" title="A different wallet is connected">
            <p>
              You are signed in as <span className="mono">{members.member}</span>, but the connected wallet is <span className="mono">{account}</span>. Connect{" "}
              {members.member} to manage this membership.
            </p>
          </Alert>
        )}

        <div className="members-grid">
          <MembershipCard m={m} network={network} title="Your membership account" />

          {!account && (
            <div className="card">
              <div className="card-head">
                <div className="eyebrow">Manage this membership</div>
                <WalletIcon />
              </div>
              <p className="muted">
                To transfer the membership or set spending rules, connect the wallet for <span className="mono">{members.member}</span>. Signing in alone doesn't
                connect a wallet to this page.
              </p>
              <div className="connect-buttons">
                {WALLETS.map((w, i) => (
                  <Button
                    key={w.id}
                    variant={i === 0 ? "primary" : "secondary"}
                    onClick={() => run(`connect:${w.id}`, `Connecting ${w.label}`, async () => setAccount(await connect(network, w.id)))}
                    disabled={!!busy && !isBusy(`connect:${w.id}`)}
                    loading={isBusy(`connect:${w.id}`)}
                    icon={<WalletIcon width={18} height={18} />}
                  >
                    Connect {w.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {isOwnerWallet && (
            <form className="card transfer-card" onSubmit={transfer}>
              <div className="card-head">
                <div className="eyebrow">Hand over your membership</div>
                <SwapIcon />
              </div>
              <p className="muted">
                Your wallet sends a standard NFT transfer (<code>nft_transfer</code>) to the registry. The account, everything it holds and its Clubhouse access move to
                the receiver. You lose access straight away.
              </p>
              <label className="field-label" htmlFor="receiver">
                Receiver's testnet account
              </label>
              <div className="field-row">
                <input
                  id="receiver"
                  className="input mono"
                  placeholder="friend.testnet"
                  autoComplete="off"
                  spellCheck={false}
                  value={receiver}
                  onChange={(e) => setReceiver(e.target.value.trim())}
                  disabled={!!busy}
                />
                <Button type="submit" disabled={!receiver || (!!busy && !isBusy("transfer"))} loading={isBusy("transfer")} icon={<ArrowRightIcon width={18} height={18} />}>
                  Transfer
                </Button>
              </div>
              <p className="hint">AccountKit checks that the receiver exists before your wallet opens, so a typo can't send the membership to nobody.</p>
              {isBusy("transfer") && <p className="progress-note"><Spinner /> {busy!.label}…</p>}
            </form>
          )}
        </div>

        {isOwnerWallet && config.agent && (
          <AgentPanel network={network} tla={m.name} balanceYocto={m.balanceYocto} onChange={refreshMembers} run={run} busyKey={busy?.key ?? null} />
        )}
      </>
    );
  } else {
    /* landing / connected-but-not-signed-in */
    const connectedPanel = account && (
      <div className="card entry-card" aria-live="polite">
        <div className="card-head">
          <div className="eyebrow">Your memberships</div>
          <StatusPill ok={null}>{netLabel}</StatusPill>
        </div>

        {wrongNetwork ? (
          <Alert
            tone="warning"
            title={`Clubhouse runs on ${netLabel}`}
            action={
              <Button variant="secondary" onClick={disconnectWallet} loading={isBusy("disconnect")}>
                Disconnect and switch
              </Button>
            }
          >
            <p>
              <span className="mono">{account}</span> is a {network === "testnet" ? "mainnet" : "testnet"} account. Connect an account that ends in{" "}
              <span className="mono">.{network === "testnet" ? "testnet" : "near"}</span>.
            </p>
          </Alert>
        ) : namesError ? (
          <ErrorAlert raw={namesError} onRetry={loadNames} />
        ) : names === null ? (
          <p className="progress-note">
            <Spinner /> Checking which {config.club ?? "House of Stake"} memberships <span className="mono">{account}</span> owns…
          </p>
        ) : names.length > 0 ? (
          <>
            <ul className="name-list">
              {names.map((n) => (
                <li key={n}>
                  <div className="name-row-main">
                    <span className="mono name">{n}</span>
                    <span className="muted small">Owned by your connected account</span>
                  </div>
                  <Button onClick={() => enter(n)} disabled={!!busy && !isBusy(`enter:${n}`)} loading={isBusy(`enter:${n}`)} icon={<DoorIcon width={18} height={18} />}>
                    Enter members area
                  </Button>
                </li>
              ))}
            </ul>
            {busy?.key.startsWith("enter:") ? (
              <p className="progress-note">
                <Spinner /> {busy.label}. Approve the message in your wallet…
              </p>
            ) : (
              <p className="hint">Entering asks your wallet to sign a one-time message. No transaction, no fee.</p>
            )}
          </>
        ) : (
          <div className="empty">
            <p className="empty-title">No membership found</p>
            <p className="muted">
              We looked in House of Stake's registry for names under <span className="mono">{config.club ?? "any club"}</span> owned by{" "}
              <span className="mono">{account}</span>, and found none.
            </p>
          </div>
        )}

        {joined && <Alert tone="success" title={`${joined} is yours`}>It now appears in your list above. Enter the members area with it.</Alert>}

        {!wrongNetwork && names !== null && config.club && network !== "mainnet" && (
          <form className="join" onSubmit={join}>
            <label className="field-label" htmlFor="join">
              {names.length === 0 ? "Get a membership" : "Get another membership"}
            </label>
            <p className="hint">
              Rent <span className="mono">yourname.{config.club}</span> from House of Stake's registry with test NEAR (~1.7 for names of 12+ characters). It
              becomes an account you own.
            </p>
            <div className="field-row">
              <div className="suffix-input">
                <input
                  id="join"
                  className="input mono"
                  placeholder="your-name-here"
                  autoComplete="off"
                  spellCheck={false}
                  value={joinLabel}
                  onChange={(e) => setJoinLabel(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  disabled={!!busy}
                />
                <span className="suffix mono">.{config.club}</span>
              </div>
              <Button type="submit" variant="secondary" disabled={!joinLabel || (!!busy && !isBusy("join"))} loading={isBusy("join")} icon={<PlusIcon width={18} height={18} />}>
                Rent with my wallet
              </Button>
            </div>
          </form>
        )}
      </div>
    );

    view = (
      <>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              AccountKit demo · {netLabel}
            </div>
            <h1 className="display">
              Membership that <em>is</em> an account.
            </h1>
            <p className="lede">
              Clubhouse is a members-only space. Each membership is an NFT from House of Stake that is also a real NEAR account. Access follows whoever owns
              that account right now.
            </p>

            {!account ? (
              <div className="connect">
                <div className="connect-buttons">
                  {WALLETS.map((w, i) => (
                    <Button
                      key={w.id}
                      variant={i === 0 ? "primary" : "secondary"}
                      onClick={() => run(`connect:${w.id}`, `Connecting ${w.label}`, async () => setAccount(await connect(network, w.id)))}
                      disabled={!!busy && !isBusy(`connect:${w.id}`)}
                      loading={isBusy(`connect:${w.id}`)}
                      icon={<WalletIcon width={18} height={18} />}
                    >
                      Connect {w.label}
                    </Button>
                  ))}
                </div>
                <p className="hint">
                  Use a {netLabel} account. Test tokens only; they have no value. Just looking?{" "}
                  <a href="#lookup">Check a name without connecting</a>.
                </p>
              </div>
            ) : (
              connectedPanel
            )}
          </div>
          <AnatomyCard club={config.club} />
        </section>

        <section className="lower">
          <form className="card lookup-card" id="lookup" onSubmit={verifyName} aria-labelledby="lookup-title">
            <div className="card-head">
              <h2 id="lookup-title">Look up a leased name</h2>
              <SearchIcon />
            </div>
            <p className="muted">
              Enter a full House of Stake account name. Clubhouse reads its NFT record and the account itself, checks they agree, and shows the current owner.
              It does not sign you in.
            </p>
            <label className="field-label" htmlFor="lookup-input">
              Account name
            </label>
            <div className="field-row">
              <input
                id="lookup-input"
                className={`input mono ${lookupError ? "input-error" : lookup ? (lookup.verified ? "input-ok" : "input-error") : ""}`}
                placeholder={network === "mainnet" ? "ibuiltthisshit.bid" : "alice-member.akclub.testnet"}
                autoComplete="off"
                spellCheck={false}
                value={lookupName}
                aria-invalid={!!lookupError}
                aria-describedby="lookup-help"
                onChange={(e) => {
                  setLookupName(e.target.value);
                  setLookupError(null);
                }}
              />
              <Button type="submit" variant="secondary" disabled={!lookupName.trim()} loading={lookupBusy} icon={<SearchIcon width={18} height={18} />}>
                {lookupBusy ? "Checking" : "Verify"}
              </Button>
            </div>
            <p className="hint" id="lookup-help">
              Format: <span className="mono">label.club</span>, for example <span className="mono">alice-member.akclub.testnet</span>.
            </p>
            {lookupError && <ErrorAlert raw={lookupError} onRetry={() => (document.getElementById("lookup") as HTMLFormElement | null)?.requestSubmit()} />}
            {lookup && <MembershipCard m={lookup} network={network} title="Lookup result" />}
          </form>
          <HowItWorks />
        </section>
      </>
    );
  }

  return (
    <div className="app">
      {header}
      <main className="container page">
        {globalFailure && <ErrorAlert raw={globalFailure.raw} onRetry={globalFailure.retry} onDismiss={() => setFailure(null)} />}
        {view}
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <span>
            <span className="dot dot-accent" /> {netLabel}
            {network !== "mainnet" && " · test tokens only, no real value"}
          </span>
          <span>
            Built with AccountKit on House of Stake's Top Level Account contracts{config.club ? ` · club ${config.club}` : ""}
          </span>
        </div>
      </footer>
    </div>
  );
}
