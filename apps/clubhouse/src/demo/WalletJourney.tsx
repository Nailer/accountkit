import { AccountKit, buildAuthorization, type WalletTransaction } from "@accountkit/sdk";
import { explorerTx } from "../lib/explorer";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AgentPanel } from "../AgentPanel";
import { api, type Config, type MembersResponse } from "../api";
import { Alert, Button, ErrorAlert, Spinner } from "../components/primitives";
import { useToast } from "../components/toast";
import { ArrowRightIcon, DoorIcon, ExternalIcon, LogOutIcon, PlusIcon, RefreshIcon, ShieldCheckIcon, SwapIcon, WalletIcon, XIcon } from "../icons";
import { connect, currentWallet, disconnect, signAndSend, signMessage, WALLETS } from "../wallet";
import { MembershipDetail } from "./MembershipDetail";

const decodeBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** `*.near` accounts can't sign on testnet and vice versa. Implicit (hex) ids work on both. */
function networkMismatch(network: string, accountId: string): boolean {
  if (/^[0-9a-f]{64}$/.test(accountId) || accountId.startsWith("0x")) return false;
  if (network === "testnet") return accountId.endsWith(".near");
  if (network === "mainnet") return accountId.endsWith(".testnet");
  return false;
}

const STAGES = ["Connect a wallet", "Pick a membership", "Prove you own it", "Members area"];

function Stepper({ stage }: { stage: number }) {
  return (
    <ol className="stepper" aria-label="Your progress">
      {STAGES.map((s, i) => (
        <li key={s} className={i < stage ? "done" : i === stage ? "now" : ""} aria-current={i === stage ? "step" : undefined}>
          <span className="st-num">{i < stage ? "✓" : i + 1}</span>
          <span className="st-label">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function WalletJourney({ config }: { config: Config }) {
  const network = config.network;
  const toast = useToast();
  const [account, setAccount] = useState<string | null>(null);
  const [walletChecked, setWalletChecked] = useState(false);
  const [names, setNames] = useState<string[] | null>(null);
  const [namesError, setNamesError] = useState<string | null>(null);
  const [members, setMembers] = useState<MembersResponse | null>(null);
  const [busy, setBusy] = useState<{ key: string; label: string } | null>(null);
  const [failure, setFailure] = useState<{ key: string; raw: string; retry: () => void } | null>(null);
  const [receiver, setReceiver] = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [joinLabel, setJoinLabel] = useState("");
  const [joined, setJoined] = useState<string | null>(null);

  const kit = useMemo(() => new AccountKit({ network: config.network, chainId: config.chainId }), [config]);

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

  useEffect(() => {
    currentWallet(network)
      .then((w) => w && setAccount(w.accountId))
      .catch(() => {})
      .finally(() => setWalletChecked(true));
    refreshMembers().catch(() => setMembers({ ok: false }));
  }, [network, refreshMembers]);

  const loadNames = useCallback(() => {
    if (!account) return setNames(null);
    setNames(null);
    setNamesError(null);
    api.names(account).then((r) => setNames(r.names), (e) => setNamesError(e.message));
  }, [account]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload the list after signing in or out, as well as on account change
  useEffect(loadNames, [loadNames, members?.ok]);

  const signedIn = members?.ok === true;
  const refused = !!(members && !members.ok && members.signedInAs);
  const wrongNetwork = account ? networkMismatch(network, account) : false;
  const isBusy = (k: string) => busy?.key === k;
  const stage = signedIn ? 3 : !account ? 0 : names && names.length > 0 ? 2 : 1;

  const signOut = () => run("signout", "Signing out", async () => { await api.logout(); await refreshMembers(); toast("info", "Signed out of Clubhouse."); });
  const disconnectWallet = () =>
    run("disconnect", "Disconnecting", async () => {
      await api.logout();
      await disconnect(network);
      setAccount(null);
      setJoined(null);
      await refreshMembers();
      toast("info", "Wallet disconnected.");
    });

  const enter = (tla: string) =>
    run(`enter:${tla}`, "Approve the sign-in message in your wallet", async () => {
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
      toast("ok", `Welcome in. Signed in as ${tla}.`);
    });

  const transfer = (e: FormEvent) => {
    e.preventDefault();
    if (!confirmTransfer) return setConfirmTransfer(true);
    return run("transfer", "Approve the transfer in your wallet", async () => {
      const m = members!.membership!;
      const tx: WalletTransaction = await kit.prepareTransfer(m.name, account!, receiver);
      const out: any = await signAndSend(network, tx);
      setLastTx(out?.transaction?.hash ?? out?.transaction_outcome?.id ?? null);
      setConfirmTransfer(false);
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
    return run("join", "Approve the rental in your wallet", async () => {
      const q = await kit.rentQuote(config.club!, joinLabel);
      if (!q.available) throw new Error(`${q.name} is taken`);
      await signAndSend(network, q.tx);
      setJoined(q.name);
      setJoinLabel("");
      setNames((await api.names(account!)).names);
      toast("ok", `${q.name} is yours.`);
    });
  };

  const connectButtons = (
    <div className="wallet-grid">
      {WALLETS.map((w) => (
        <button
          type="button"
          key={w.id}
          className="wallet-option"
          disabled={!!busy && !isBusy(`connect:${w.id}`)}
          aria-busy={isBusy(`connect:${w.id}`) || undefined}
          onClick={() => run(`connect:${w.id}`, `Opening ${w.label}`, async () => { setAccount(await connect(network, w.id)); toast("ok", `${w.label} connected.`); })}
        >
          <span className="wo-icon">{isBusy(`connect:${w.id}`) ? <Spinner /> : <WalletIcon />}</span>
          <span className="wo-text"><b>{w.label}</b><span>{w.kind}</span></span>
          <ArrowRightIcon width={16} height={16} className="wo-arrow" />
        </button>
      ))}
    </div>
  );

  /* ---------------- views ---------------- */
  let view: ReactNode;

  if (members === null || !walletChecked) {
    view = (
      <div className="card center-state">
        <Spinner label="Checking your session" />
        <p className="muted">Checking your Clubhouse session on chain…</p>
      </div>
    );
  } else if (refused) {
    view = (
      <motion.div className="card state refused" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
        <span className="state-icon bad"><XIcon /></span>
        <span className="eyebrow no-rule">Members area</span>
        <h3>Access refused</h3>
        <p className="lede">{members!.reason}</p>
        <p className="muted">
          Your sign-in for <span className="mono">{members!.tla}</span> was valid when you made it. Clubhouse checks the current owner on every visit, and this
          membership now belongs to <span className="mono">{members!.currentOwner ?? "someone else"}</span>.
        </p>
        {lastTx && (
          <a className="text-link" href={explorerTx(network, lastTx)} target="_blank" rel="noreferrer">View the transfer on NearBlocks <ExternalIcon /></a>
        )}
        <div className="row-actions">
          <Button onClick={signOut} loading={isBusy("signout")} icon={<LogOutIcon width={18} height={18} />}>Sign out and start again</Button>
        </div>
      </motion.div>
    );
  } else if (signedIn && members?.membership) {
    const m = members.membership;
    const isOwnerWallet = account === members.member;
    view = (
      <div className="member-area">
        <motion.div className="member-hero card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <span className="eyebrow no-rule accent">Members area · access granted</span>
            <h3 className="member-title">Welcome in, <span className="mono">{members.member}</span>.</h3>
            <p className="muted">
              <ShieldCheckIcon width={16} height={16} className="inline-icon" /> Ownership of <span className="mono">{m.name}</span> confirmed on chain at{" "}
              {members.checkedAt ? new Date(members.checkedAt).toLocaleTimeString() : "—"}. This check runs again on every visit.
            </p>
          </div>
          <div className="row-actions">
            <Button variant="secondary" size="sm" onClick={() => run("recheck", "Re-checking ownership", async () => { await refreshMembers(); toast("ok", "Ownership re-checked on chain."); })} loading={isBusy("recheck")} icon={<RefreshIcon width={16} height={16} />}>
              Re-check ownership
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} loading={isBusy("signout")} icon={<LogOutIcon width={16} height={16} />}>Sign out</Button>
          </div>
        </motion.div>

        {!isOwnerWallet && account && (
          <Alert tone="warning" title="A different wallet is connected">
            <p>You're signed in as <span className="mono">{members.member}</span>, but the connected wallet is <span className="mono">{account}</span>. Connect {members.member} to manage this membership.</p>
          </Alert>
        )}

        <div className="member-grid">
          <MembershipDetail m={m} network={network} title="Your membership account" />

          {!account && (
            <div className="card">
              <span className="eyebrow no-rule">Manage this membership</span>
              <h3 className="card-h">Connect the owner's wallet</h3>
              <p className="muted">Signing in doesn't connect a wallet to this page. To transfer the membership or set agent rules, connect the wallet for <span className="mono">{members.member}</span>.</p>
              {connectButtons}
            </div>
          )}

          {isOwnerWallet && (
            <form className="card transfer" onSubmit={transfer}>
              <div className="detail-head">
                <span className="eyebrow no-rule">Hand over your membership</span>
                <SwapIcon />
              </div>
              <p className="muted">
                Your wallet sends a standard NFT transfer (<code>nft_transfer</code>) to House of Stake's registry. The account and its Clubhouse access move to the
                receiver, and you lose access straight away. House of Stake's wallet sends the account's spare NEAR back to you as part of the transfer.
              </p>
              <div className="field">
                <label className="field-label" htmlFor="receiver">Receiver's testnet account</label>
                <div className="field-row">
                  <input id="receiver" className="input mono" placeholder="friend.testnet" autoComplete="off" spellCheck={false} value={receiver} onChange={(e) => { setReceiver(e.target.value.trim()); setConfirmTransfer(false); }} disabled={!!busy} />
                  <Button type="submit" disabled={!receiver || (!!busy && !isBusy("transfer"))} loading={isBusy("transfer")} icon={<ArrowRightIcon width={18} height={18} />}>
                    {confirmTransfer ? "Yes, transfer it" : "Transfer"}
                  </Button>
                </div>
                <p className="field-hint">AccountKit checks the receiver exists before your wallet opens, so a typo can't send the membership to nobody.</p>
              </div>
              <AnimatePresence>
                {confirmTransfer && !isBusy("transfer") && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <Alert tone="warning" title={`Transfer ${m.name} to ${receiver}?`} actions={<Button size="sm" variant="ghost" type="button" onClick={() => setConfirmTransfer(false)}>Cancel</Button>}>
                      <p>This can't be undone from here. Press "Yes, transfer it", then approve in your wallet.</p>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>
              {isBusy("transfer") && <p className="progress-note"><Spinner /> {busy!.label}…</p>}
            </form>
          )}
        </div>

        {isOwnerWallet && config.agent && (
          <AgentPanel network={network} tla={m.name} balanceYocto={m.balanceYocto} onChange={refreshMembers} run={run} busyKey={busy?.key ?? null} />
        )}
      </div>
    );
  } else if (!account) {
    view = (
      <div className="journey-grid">
        <div className="card">
          <span className="eyebrow no-rule">Step 1</span>
          <h3 className="card-h">Connect a NEAR testnet wallet</h3>
          <p className="muted">Clubhouse reads which memberships your account owns. Connecting shares your account name with this page; it doesn't let the page spend anything. Every action asks your wallet first.</p>
          {connectButtons}
        </div>
        <div className="card notes">
          <h4>Before you connect</h4>
          <ul>
            <li><b>Use a testnet account.</b> Its name ends in <span className="mono">.testnet</span>. Test NEAR has no value; the faucet gives it free.</li>
            <li><b>Meteor may ask you to create a passkey</b> when you make a new wallet. That's the wallet securing itself, not Clubhouse.</li>
            <li><b>MyNearWallet no longer connects to apps</b>, so it isn't listed.</li>
            <li><b>No wallet?</b> Watch the live run instead. It needs nothing from you.</li>
          </ul>
        </div>
      </div>
    );
  } else {
    view = (
      <div className="journey-grid">
        <div className="card">
          <div className="detail-head">
            <span className="eyebrow no-rule">Step 2 · Your memberships</span>
            <Button variant="ghost" size="sm" onClick={disconnectWallet} loading={isBusy("disconnect")} icon={<LogOutIcon width={15} height={15} />}>Switch wallet</Button>
          </div>
          <p className="connected-as"><WalletIcon width={16} height={16} /> Connected as <span className="mono">{account}</span></p>

          {wrongNetwork ? (
            <Alert tone="warning" title="Clubhouse runs on NEAR testnet" actions={<Button size="sm" variant="secondary" onClick={disconnectWallet}>Disconnect and switch</Button>}>
              <p><span className="mono">{account}</span> is a mainnet account. Connect one that ends in <span className="mono">.testnet</span>.</p>
            </Alert>
          ) : namesError ? (
            <ErrorAlert raw={namesError} onRetry={loadNames} />
          ) : names === null ? (
            <p className="progress-note"><Spinner /> Looking up {config.club ?? "House of Stake"} memberships owned by your account…</p>
          ) : names.length > 0 ? (
            <ul className="name-list">
              {names.map((n) => (
                <motion.li key={n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div>
                    <span className="mono nl-name">{n}</span>
                    <span className="muted small">Owned by your connected account</span>
                  </div>
                  <Button onClick={() => enter(n)} disabled={!!busy && !isBusy(`enter:${n}`)} loading={isBusy(`enter:${n}`)} icon={<DoorIcon width={18} height={18} />}>
                    Enter the members area
                  </Button>
                </motion.li>
              ))}
            </ul>
          ) : (
            <div className="empty-inline">
              <b>No membership found</b>
              <p className="muted small">We checked House of Stake's registry for names under <span className="mono">{config.club}</span> owned by <span className="mono">{account}</span>. There are none yet. Rent one below.</p>
            </div>
          )}
          {busy?.key.startsWith("enter:") ? (
            <p className="progress-note"><Spinner /> {busy.label}. It's a message, not a transaction: no fee.</p>
          ) : names && names.length > 0 ? (
            <p className="field-hint">Step 3: entering asks your wallet to sign a one-time message. No transaction, no fee.</p>
          ) : null}
          {joined && <Alert tone="success" title={`${joined} is yours`}><p>It's in your list above. Enter the members area with it.</p></Alert>}
        </div>

        {!wrongNetwork && names !== null && config.club && network !== "mainnet" && (
          <form className="card" onSubmit={join}>
            <span className="eyebrow no-rule">{names.length === 0 ? "Get a membership" : "Get another membership"}</span>
            <h3 className="card-h">Rent a name in the club</h3>
            <p className="muted">Rents <span className="mono">yourname.{config.club}</span> from House of Stake's registry with test NEAR (about 1.7 for names of 12+ characters). It becomes a real account you own.</p>
            <div className="field">
              <label className="field-label" htmlFor="join">Name</label>
              <div className="field-row">
                <div className="input-wrap">
                  <input id="join" className="input mono" placeholder="your-name-here" autoComplete="off" spellCheck={false} value={joinLabel} onChange={(e) => setJoinLabel(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} disabled={!!busy} />
                  <span className="input-suffix">.{config.club}</span>
                </div>
                <Button type="submit" variant="secondary" disabled={!joinLabel || (!!busy && !isBusy("join"))} loading={isBusy("join")} icon={<PlusIcon width={18} height={18} />}>
                  Rent with my wallet
                </Button>
              </div>
              <p className="field-hint">Your wallet shows the exact test NEAR amount before you approve.</p>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-journey">
      <Stepper stage={stage} />
      {failure && <ErrorAlert raw={failure.raw} onRetry={failure.retry} onDismiss={() => setFailure(null)} />}
      {busy && !busy.key.startsWith("enter:") && busy.key !== "transfer" && !busy.key.startsWith("connect:") && (
        <p className="progress-note"><Spinner /> {busy.label}…</p>
      )}
      {view}
    </div>
  );
}
