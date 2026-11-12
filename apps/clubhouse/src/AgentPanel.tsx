import { addExtensionTx, grantSpendTx, revokeSpendTx } from "@accountkit/sdk";
import { explorerTx } from "./lib/explorer";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { agentApi, formatNear, type AgentAttempt, type AgentInfo } from "./api";
import { BotIcon, CheckIcon, ExternalIcon, PlusIcon, XIcon } from "./icons";
import { Button, Pill } from "./components/primitives";
import { sendNear, signAndSend, signAndSendMany } from "./wallet";

const YOCTO = 10n ** 24n;
const toYocto = (near: string) => {
  const [w = "0", f = ""] = near.split(".");
  return BigInt(w || "0") * YOCTO + BigInt((f + "0".repeat(24)).slice(0, 24));
};

type Run = (key: string, label: string, fn: () => Promise<void>) => Promise<void>;

/**
 * Stretch demo: the owner sets on-chain rules for an agent; a scripted agent
 * proposes payments; the membership account's wallet contract allows or
 * refuses each one.
 */
export function AgentPanel(props: { network: string; tla: string; balanceYocto: string; onChange: () => Promise<void>; run: Run; busyKey: string | null }) {
  const { network, tla, run, busyKey } = props;
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [budget, setBudget] = useState("0.5");
  const [hours, setHours] = useState("24");
  const [results, setResults] = useState<AgentAttempt[]>([]);

  const load = useCallback(async () => setInfo(await agentApi.info()), []);
  useEffect(() => {
    load().catch(() => setInfo(null));
  }, [load]);

  if (!info?.ok) return null;
  const g = info.status.grant;
  const busy = busyKey !== null;
  const is = (k: string) => busyKey === k;
  const explorer = (h: string) => explorerTx(network, h);
  const budgetValid = /^\d+(\.\d{1,6})?$/.test(budget) && Number(budget) > 0;
  const hoursValid = /^\d+$/.test(hours) && Number(hours) > 0;

  const setRules = (e: FormEvent) => {
    e.preventDefault();
    return run("agent:rules", "Waiting for your wallet to approve the rules", async () => {
      const txs = [];
      if (!info.status.extension_enabled) txs.push(addExtensionTx(tla, info.agent));
      if (g) txs.push(revokeSpendTx(tla, info.agent)); // a fresh grant starts from zero spent
      txs.push(
        grantSpendTx(tla, {
          extension: info.agent,
          receivers: [info.approvedRecipient],
          budgetYocto: toYocto(budget),
          expiresAt: new Date(Date.now() + Number(hours) * 3_600_000),
        }),
      );
      await signAndSendMany(network, txs);
      await load();
    });
  };

  return (
    <section className="card agent-card theme-ink" aria-labelledby="agent-title">
      <div className="card-head">
        <div>
          <div className="eyebrow">Optional demo</div>
          <h2 id="agent-title">Let an agent pay, within limits the chain enforces</h2>
        </div>
        <BotIcon />
      </div>
      <p className="muted">
        <span className="mono">{info.agent}</span> is a <strong>scripted demo agent</strong>, not an AI model: each task below is a fixed payment. It can only use your
        membership account through the limits you set, and the account's own contract enforces them.
      </p>

      <div className="agent-grid">
        <div className="agent-rules">
          <div className="sub-title">Your rules</div>
          <dl className="facts">
            <dt>Agent enabled</dt>
            <dd>
              <Pill tone={info.status.extension_enabled ? "ok" : undefined}>{info.status.extension_enabled ? "Yes" : "No"}</Pill>
            </dd>
            <dt>Spending limit</dt>
            <dd>
              {g ? (
                <>
                  {formatNear(g.spent_yocto)} spent of {formatNear(g.budget_yocto)}
                  <div className="meter" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Number((BigInt(g.spent_yocto) * 100n) / (BigInt(g.budget_yocto) || 1n)))}%` }} />
                  </div>
                </>
              ) : (
                "None set"
              )}
            </dd>
            {g && (
              <>
                <dt>May pay</dt>
                <dd className="mono">{g.receivers.join(", ")}</dd>
                <dt>Until</dt>
                <dd>{new Date(Number(BigInt(g.expires_at) / 1_000_000n)).toLocaleString()}</dd>
              </>
            )}
            <dt>Account balance</dt>
            <dd>
              {formatNear(props.balanceYocto)}
              {network !== "mainnet" && <span className="unit-note"> (testnet)</span>}
            </dd>
          </dl>

          <form className="rules-form" onSubmit={setRules}>
            <div className="rule-fields">
              <label>
                <span className="field-label">Budget (NEAR)</span>
                <input className={`input ${budgetValid ? "" : "input-error"}`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.trim())} disabled={busy} />
              </label>
              <label>
                <span className="field-label">For (hours)</span>
                <input className={`input ${hoursValid ? "" : "input-error"}`} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.trim())} disabled={busy} />
              </label>
            </div>
            <p className="hint">
              Only to <span className="mono">{info.approvedRecipient}</span>. Your wallet signs {info.status.extension_enabled ? "" : "enabling the agent and "}the new limit.
            </p>
            <div className="actions">
              <Button type="submit" disabled={!budgetValid || !hoursValid || (busy && !is("agent:rules"))} loading={is("agent:rules")}>
                {g ? "Replace rules" : "Set rules"}
              </Button>
              {g && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy && !is("agent:revoke")}
                  loading={is("agent:revoke")}
                  onClick={() => run("agent:revoke", "Waiting for your wallet to revoke", async () => { await signAndSend(network, revokeSpendTx(tla, info.agent)); await load(); })}
                >
                  Revoke
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={busy && !is("agent:fund")}
                loading={is("agent:fund")}
                icon={<PlusIcon width={16} height={16} />}
                onClick={() => run("agent:fund", "Waiting for your wallet", async () => { await sendNear(network, tla, toYocto("1").toString()); await props.onChange(); })}
              >
                Add 1 test NEAR to the account
              </Button>
            </div>
          </form>
        </div>

        <div className="agent-tasks">
          <div className="sub-title">Give the agent a task</div>
          <ul className="task-list">
            {info.tasks.map((t) => (
              <li key={t.id}>
                <div className="task-main">
                  <div>{t.label}</div>
                  <div className="mono small muted">
                    {t.proposal.amountNear} NEAR → {t.proposal.recipient}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  disabled={busy && !is(`agent:${t.id}`)}
                  loading={is(`agent:${t.id}`)}
                  onClick={() =>
                    run(`agent:${t.id}`, "The agent is trying; the account's contract decides", async () => {
                      const r = await agentApi.attempt(t.id);
                      setResults((prev) => [r, ...prev].slice(0, 6));
                      await load();
                      await props.onChange();
                    })
                  }
                >
                  Let it try
                </Button>
              </li>
            ))}
          </ul>
          <div className="results" aria-live="polite">
            {results.length === 0 && <p className="hint">Results appear here, each with its testnet transaction. Refused attempts are recorded on chain too.</p>}
            {results.map((r, i) => (
              <div key={r.tx.hash === "?" ? `pending-${results.length - i}` : r.tx.hash} className={`result ${r.tx.ok ? "result-ok" : "result-bad"}`}>
                <span className="result-icon">{r.tx.ok ? <CheckIcon width={16} height={16} /> : <XIcon width={16} height={16} />}</span>
                <div>
                  <div className="result-title">{r.tx.ok ? "Allowed by the contract" : "Refused by the contract"}</div>
                  <div className="small">{r.verdict.replace(/^(Allowed|Refused) by the wallet: /, "")}</div>
                </div>
                {r.tx.hash !== "?" && (
                  <a className="ext-link small" href={explorer(r.tx.hash)} target="_blank" rel="noreferrer">
                    Tx <ExternalIcon />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
