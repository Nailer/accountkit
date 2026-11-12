/**
 * The demo "agent". It is a DETERMINISTIC SCRIPT, not an AI model: it turns a
 * task into a structured payment proposal with fixed rules. The point of the
 * demo is not the agent's judgement; it is that the TLA wallet's on-chain
 * spend grant decides, whatever the agent proposes.
 *
 * The agent signs with its own testnet key (ak-agent.testnet by default) and
 * can only reach the membership account through `w_execute_extension`, which
 * the wallet checks against the owner's grant. It never sees the owner's key.
 */
import { executeTx, nearTransfer, parseNear, type AccountKit } from "@accountkit/sdk";
import { sendTx, testAccount, type SentTx } from "./signer.js";

export interface Proposal {
  agent: string;
  account: string;
  recipient: string;
  asset: "NEAR";
  amountNear: string;
  reason: string;
  kind: "scripted";
}

export interface AttemptResult {
  proposal: Proposal;
  tx: SentTx;
  /** What the chain said, in plain words. */
  verdict: string;
}

export const DEMO_TASKS = [
  { id: "bill", label: "Pay the approved 0.2 NEAR bill", recipientKey: "approved", amountNear: "0.2" },
  { id: "overspend", label: "Pay a 0.4 NEAR bill (over the remaining budget)", recipientKey: "approved", amountNear: "0.4" },
  { id: "stranger", label: "Pay 0.1 NEAR to an unapproved account", recipientKey: "stranger", amountNear: "0.1" },
] as const;

export type TaskId = (typeof DEMO_TASKS)[number]["id"];

/** "0.2" -> yoctoNEAR. Delegates to the SDK's strict parser. */
export function toYocto(near: string): bigint {
  return parseNear(near);
}

/** Deterministic proposal: the task fixes recipient and amount. No model involved. */
export function propose(task: TaskId, opts: { agent: string; account: string; approved: string; stranger: string }): Proposal {
  const t = DEMO_TASKS.find((x) => x.id === task);
  if (!t) throw new Error(`unknown task ${task}`);
  return {
    agent: opts.agent,
    account: opts.account,
    recipient: t.recipientKey === "approved" ? opts.approved : opts.stranger,
    asset: "NEAR",
    amountNear: t.amountNear,
    reason: t.label,
    kind: "scripted",
  };
}

function explain(failure: string): string {
  const m = /Smart contract panicked: ([^\n"]+)/.exec(failure) ?? /"?(?:ExecutionError|panic_msg)"?:\s*\\?"([^"\\]+)/.exec(failure);
  return m?.[1] ?? failure.slice(0, 240);
}

/** The agent attempts the proposal through the wallet's extension path. The contract decides. */
export async function attempt(network: string, rpcUrl: string, p: Proposal): Promise<AttemptResult> {
  const tx = executeTx(p.account, { external: [nearTransfer(p.recipient, toYocto(p.amountNear))] }, 60n);
  const sent = await sendTx(testAccount(network, rpcUrl, p.agent), tx);
  return {
    proposal: p,
    tx: sent,
    verdict: sent.ok ? `Allowed by the wallet: ${p.amountNear} NEAR sent to ${p.recipient}.` : `Refused by the wallet: ${explain(sent.failure ?? "")}`,
  };
}

export async function agentStatus(kit: AccountKit, account: string, agent: string) {
  return kit.agentStatus(account, agent);
}
