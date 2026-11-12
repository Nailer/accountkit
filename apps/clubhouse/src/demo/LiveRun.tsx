import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, runDemo, type DemoEvent, type DemoStatus, type Membership } from "../api";
import { MembershipPass } from "../components/MembershipPass";
import { Alert, Button, ErrorAlert, Pill, Spinner } from "../components/primitives";
import { useToast } from "../components/toast";
import { BotIcon, CheckIcon, ExternalIcon, PlayIcon, RefreshIcon, SwapIcon, XIcon } from "../icons";

type Kind = "ownership" | "agent";

const EXPECTED: Record<Kind, number> = { ownership: 8, agent: 5 };

const INFO: Record<Kind, { title: string; icon: ReactNode; text: string; sees: string[] }> = {
  ownership: {
    title: "Ownership journey",
    icon: <SwapIcon />,
    text: "Two test accounts. The owner signs in, a stranger is turned away, the membership is transferred, and the old owner is locked out.",
    sees: ["13-check verification", "Sign-in with a signed message", "A real nft_transfer", "The old owner refused"],
  },
  agent: {
    title: "Agent limits",
    icon: <BotIcon />,
    text: "The owner gives a scripted agent 0.5 test NEAR for one approved shop. The agent tries three payments; the account's contract decides.",
    sees: ["Limit stored on chain", "One payment allowed", "Two blocked by the contract", "Limit revoked"],
  },
};

const explorer = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;

function StatusIcon({ s }: { s: DemoEvent["status"] }) {
  if (s === "running") return <Spinner />;
  if (s === "ok") return <CheckIcon width={16} height={16} />;
  if (s === "refused") return <XIcon width={16} height={16} />;
  return <span aria-hidden="true">!</span>;
}

/** Collapses the stream so each step shows once, in its latest state. */
function collapse(events: DemoEvent[]): DemoEvent[] {
  const order: string[] = [];
  const latest = new Map<string, DemoEvent>();
  for (const e of events) {
    if (!latest.has(e.step)) order.push(e.step);
    latest.set(e.step, e);
  }
  return order.map((k) => latest.get(k)!);
}

export function LiveRun({ status, onStatus }: { status: DemoStatus | null; onStatus: () => void }) {
  const [kind, setKind] = useState<Kind>("ownership");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pass, setPass] = useState<Membership | null>(null);
  const [passLoading, setPassLoading] = useState(true);
  const toast = useToast();

  const loadPass = useCallback(async () => {
    if (!status) return;
    setPassLoading(true);
    try {
      setPass(await api.lookup(status.name));
    } catch {
      /* the pass shows its own waiting state */
    } finally {
      setPassLoading(false);
    }
  }, [status]);
  useEffect(() => {
    loadPass();
  }, [loadPass]);

  const steps = collapse(events);
  const finished = steps.some((s) => s.step === "done") || steps.some((s) => s.status === "error" && !running);
  const doneCount = steps.filter((s) => s.status !== "running").length;
  const available = status ? (kind === "agent" ? status.agent : status.ownership) : false;

  const start = async () => {
    setEvents([]);
    setError(null);
    setRunning(true);
    try {
      await runDemo(kind, (e) => {
        setEvents((prev) => [...prev, e]);
        if (e.step === "transfer" && e.status === "ok") loadPass();
      });
      toast("ok", kind === "ownership" ? "Live run finished. The membership changed hands on testnet." : "Agent run finished.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      loadPass();
      onStatus();
    }
  };

  return (
    <div className="live">
      <div className="live-main">
        <div className="run-picker" role="radiogroup" aria-label="Choose a live run">
          {(Object.keys(INFO) as Kind[]).map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={kind === k}
              className={`run-option ${kind === k ? "selected" : ""}`}
              onClick={() => {
                if (running) return;
                setKind(k);
                setEvents([]);
                setError(null);
              }}
              disabled={running}
            >
              <span className="run-icon">{INFO[k].icon}</span>
              <span className="run-text">
                <b>{INFO[k].title}</b>
                <span>{INFO[k].text}</span>
              </span>
            </button>
          ))}
        </div>

        {status && !available && (
          <Alert tone="warning" title="The live run isn't available on this server">
            <p>
              It needs the testnet keys of the demo accounts ({kind === "agent" ? [...status.people, status.agentAccount].join(", ") : status.people.join(", ")}), and
              this server doesn't have them. You can still use your own wallet or look up a name.
            </p>
          </Alert>
        )}

        <div className="run-console card">
          <div className="console-head">
            <div>
              <span className="eyebrow no-rule">{running ? "Running on NEAR testnet" : finished ? "Run complete" : "Ready"}</span>
              <h3>{INFO[kind].title}</h3>
            </div>
            <div className="console-actions">
              {!running && (
                <Button onClick={start} disabled={!available} icon={finished ? <RefreshIcon width={18} height={18} /> : <PlayIcon width={18} height={18} />}>
                  {finished ? "Run it again" : "Start the live run"}
                </Button>
              )}
              {running && <Pill tone="warn">Live · {doneCount}/{EXPECTED[kind]} steps</Pill>}
            </div>
          </div>
          <div className="console-progress" aria-hidden="true">
            <motion.span initial={{ width: "0%" }} animate={{ width: `${Math.min(100, (doneCount / EXPECTED[kind]) * 100)}%` }} transition={{ duration: 0.5 }} />
          </div>

          {error && <ErrorAlert raw={error} onRetry={start} />}

          {steps.length === 0 && !error ? (
            <div className="console-empty">
              <p className="muted">What you'll see, step by step, each with a link to the testnet transaction or read:</p>
              <ul>
                {INFO[kind].sees.map((s) => (
                  <li key={s}><span className="dot-line" aria-hidden="true" />{s}</li>
                ))}
              </ul>
              {status && (
                <p className="muted small">
                  Accounts used: <span className="mono">{status.name}</span>, <span className="mono">{status.people.join(", ")}</span>
                  {kind === "agent" && status.agentAccount ? <>, <span className="mono">{status.agentAccount}</span></> : null}. The demo server signs for these
                  test accounts. Test NEAR only.
                </p>
              )}
            </div>
          ) : (
            <ol className="timeline" aria-live="polite">
              <AnimatePresence initial={false}>
                {steps.filter((s) => s.step !== "done").map((s) => (
                  <motion.li
                    key={s.step}
                    className={`tl tl-${s.status}`}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="tl-icon"><StatusIcon s={s.status} /></span>
                    <div className="tl-body">
                      <div className="tl-title">{s.title}</div>
                      {s.detail && <div className="tl-detail">{s.detail}</div>}
                    </div>
                    {s.tx && (
                      <a className="tl-tx" href={explorer(s.tx)} target="_blank" rel="noreferrer" aria-label={`View transaction ${s.tx} on NearBlocks`}>
                        <span className="mono">{s.tx.slice(0, 8)}…</span> <ExternalIcon />
                      </a>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}

          {finished && !running && steps.some((s) => s.step === "done") && (
            <motion.div className="run-summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div>
                <h4>What NEAR did</h4>
                <p>
                  {kind === "ownership"
                    ? "Moved the NFT and the account together in one standard transfer, cleared the old owner's agents, and returned the account's spare NEAR to the old owner. The account still holds no keys."
                    : "Stored the limit on the membership account and refused every payment outside it, with its own error message."}
                </p>
              </div>
              <div>
                <h4>What AccountKit did</h4>
                <p>
                  {kind === "ownership"
                    ? "Verified the membership, resolved each sign-in to the current owner, built a safe transfer, and re-checked ownership afterwards."
                    : "Built the grant and revoke transactions and read the agent's status back from chain."}
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <aside className="live-side" aria-label="Demo membership">
        <MembershipPass m={pass} loading={passLoading} />
        <div className="side-note">
          <Button variant="ghost" size="sm" onClick={loadPass} loading={passLoading} icon={<RefreshIcon width={15} height={15} />}>
            Refresh from chain
          </Button>
          <p className="muted small">This pass is read live from testnet. After a transfer, the owner changes here too.</p>
        </div>
      </aside>
    </div>
  );
}
