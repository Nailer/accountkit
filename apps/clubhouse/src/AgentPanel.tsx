import { addExtensionTx, grantSpendTx, revokeSpendTx } from "@accountkit/sdk";
import { useCallback, useEffect, useState } from "react";
import { agentApi, formatNear, type AgentAttempt, type AgentInfo } from "./api";
import { sendNear, signAndSend, signAndSendMany } from "./wallet";

const YOCTO = 10n ** 24n;
const toYocto = (near: string) => {
  const [w = "0", f = ""] = near.split(".");
  return BigInt(w) * YOCTO + BigInt((f + "0".repeat(24)).slice(0, 24));
};

/**
 * Stretch demo: the owner sets on-chain rules for an agent; a scripted agent
 * proposes payments; the TLA wallet's spend grant allows or refuses each one.
 */
export function AgentPanel(props: { network: string; tla: string; balanceYocto: string; onChange: () => Promise<void>; run: (label: string, fn: () => Promise<void>) => Promise<void> }) {
  const { network, tla, run } = props;
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
  const explorer = (h: string) => `https://${network === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${h}`;

  return (
    <div className="card agent">
      <div className="label">Agent spending rules · on chain</div>
      <p className="muted small">
        Agent <code>{info.agent}</code> is a {info.kind}. It can only reach this account through the wallet's extension path, and the TLA wallet enforces your
        grant. The agent's own judgement is not the safety boundary.
      </p>

      <dl>
        <dt>Agent enabled</dt>
        <dd>{info.status.extension_enabled ? "yes" : "no"}</dd>
        <dt>Grant</dt>
        <dd>
          {g
            ? `${formatNear(g.spent_yocto)} of ${formatNear(g.budget_yocto)} spent · to ${g.receivers.join(", ")} · until ${new Date(Number(BigInt(g.expires_at) / 1_000_000n)).toISOString().slice(0, 16)}Z`
            : "none"}
        </dd>
        <dt>Account balance</dt>
        <dd>{formatNear(props.balanceYocto)}</dd>
      </dl>

      <div className="row">
        <input value={budget} onChange={(e) => setBudget(e.target.value)} aria-label="budget in NEAR" style={{ flex: "0 1 90px" }} />
        <span className="muted small">NEAR to {info.approvedRecipient} for</span>
        <input value={hours} onChange={(e) => setHours(e.target.value)} aria-label="hours" style={{ flex: "0 1 70px" }} />
        <span className="muted small">hours</span>
        <button
          onClick={() =>
            run("Waiting for your wallet", async () => {
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
            })
          }
        >
          Set rules
        </button>
        {g && (
          <button className="link" onClick={() => run("Waiting for your wallet", async () => { await signAndSend(network, revokeSpendTx(tla, info.agent)); await load(); })}>
            Revoke
          </button>
        )}
        <button className="link" onClick={() => run("Waiting for your wallet", async () => { await sendNear(network, tla, toYocto("1").toString()); await props.onChange(); })}>
          Add 1 NEAR to the account
        </button>
      </div>

      <div className="label" style={{ marginTop: 16 }}>Give the agent a task</div>
      <ul className="tasks">
        {info.tasks.map((t) => (
          <li key={t.id}>
            <div>
              <div>{t.label}</div>
              <code className="small">{JSON.stringify({ recipient: t.proposal.recipient, asset: t.proposal.asset, amount: t.proposal.amountNear })}</code>
            </div>
            <button
              onClick={() =>
                run("Agent is trying; the wallet contract decides", async () => {
                  const r = await agentApi.attempt(t.id);
                  setResults((prev) => [r, ...prev]);
                  await load();
                  await props.onChange();
                })
              }
            >
              Let the agent try
            </button>
          </li>
        ))}
      </ul>

      {results.map((r, i) => (
        <div key={i} className={`attempt ${r.tx.ok ? "ok" : "fail"}`}>
          <b>{r.tx.ok ? "Allowed" : "Refused"}</b> · {r.verdict}{" "}
          {r.tx.hash !== "?" && (
            <a href={explorer(r.tx.hash)} target="_blank" rel="noreferrer">
              tx
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
