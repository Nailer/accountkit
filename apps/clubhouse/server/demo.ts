/**
 * The live testnet run: the same journey a member takes, driven by the
 * demo server with two TEST accounts whose keys live in the server's local
 * NEAR CLI keychain. Every step is a real testnet read or transaction; the
 * UI shows each one as it happens, with its transaction link.
 *
 * Nothing here is simulated. If the keys are missing, the run reports itself
 * unavailable instead of pretending.
 */
import {
  type AccountKit,
  addExtensionTx,
  buildAuthorization,
  createSignInRequest,
  grantSpendTx,
  revokeSpendTx,
  verifyItem,
  verifySignIn,
} from "@accountkit/sdk";
import { attempt, propose, toYocto } from "./agent.js";
import { loadKey, sendTx, testAccount } from "./signer.js";

export interface DemoConfig {
  network: string;
  rpcUrl: string;
  name: string;
  people: [string, string];
  agent: string | null;
  approved: string;
  stranger: string;
}

export type StepStatus = "running" | "ok" | "refused" | "error";

export interface DemoEvent {
  step: string;
  status: StepStatus;
  title: string;
  detail?: string;
  tx?: string;
  data?: Record<string, unknown>;
}

type Emit = (e: DemoEvent) => void;

export function demoAvailability(c: DemoConfig): { ownership: boolean; agent: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const id of [...c.people, ...(c.agent ? [c.agent] : [])]) {
    try {
      loadKey(c.network, id);
    } catch {
      missing.push(id);
    }
  }
  const ownership = !c.people.some((p) => missing.includes(p));
  const agent = ownership && !!c.agent && !missing.includes(c.agent);
  return { ownership, agent, missing };
}

async function signIn(kit: AccountKit, c: DemoConfig, accountId: string) {
  const acct = testAccount(c.network, c.rpcUrl, accountId);
  const payload = { domain: "Clubhouse", action: "Login", msg: JSON.stringify({ tla: c.name, run: crypto.randomUUID() }) };
  const req = createSignInRequest({ tla: c.name, owner: accountId, chainId: kit.chainId, payload });
  const signed = await acct.signNep413Message({ message: req.nep413.message, recipient: req.nep413.recipient, nonce: req.nep413.nonce });
  const authorization = buildAuthorization(req, { publicKey: signed.publicKey.toString(), signature: signed.signature });
  return verifySignIn(kit, { tla: c.name, authorization, expectedPayload: req.payload });
}

async function waitForOwner(kit: AccountKit, name: string, expected: string) {
  for (let i = 0; i < 20; i++) {
    const info = await kit.resolve(name);
    const v = verifyItem(info);
    if (v.owner === expected) return { info, v };
    await new Promise((r) => setTimeout(r, 1500));
  }
  const info = await kit.resolve(name);
  return { info, v: verifyItem(info) };
}

/** Ownership journey: verify → owner in → stranger out → transfer → new owner in → old session out. */
export async function runOwnership(kit: AccountKit, c: DemoConfig, emit: Emit) {
  emit({ step: "verify", status: "running", title: "Reading the membership from testnet" });
  const before = verifyItem(await kit.resolve(c.name));
  if (!before.ok || !before.active || !before.owner) {
    emit({ step: "verify", status: "error", title: "The membership did not verify", detail: before.checks.filter((x) => !x.ok).map((x) => x.id).join(", ") });
    return;
  }
  const from = before.owner;
  const to = from === c.people[0] ? c.people[1] : c.people[0];
  emit({
    step: "verify",
    status: "ok",
    title: `${c.name} verified`,
    detail: `${before.checks.length}/${before.checks.length} checks passed. Current owner: ${from}.`,
    data: { owner: from, receiver: to },
  });

  emit({ step: "owner-in", status: "running", title: `${from} signs in` });
  const s1 = await signIn(kit, c, from);
  emit({
    step: "owner-in",
    status: s1.ok ? "ok" : "error",
    title: s1.ok ? `${from} is let in` : `${from} was not let in`,
    detail: s1.ok ? "Signed a one-time message. The membership account confirmed its owner (NEP-641). No transaction." : s1.reason,
  });

  emit({ step: "stranger-out", status: "running", title: `${to} tries to sign in` });
  const s2 = await signIn(kit, c, to);
  emit({
    step: "stranger-out",
    status: s2.ok ? "error" : "refused",
    title: s2.ok ? `${to} was let in (unexpected)` : `${to} is turned away`,
    detail: s2.ok ? undefined : "The membership account refused: this account is not its owner.",
  });

  emit({ step: "transfer", status: "running", title: `${from} hands the membership to ${to}` });
  const tx = await kit.prepareTransfer(c.name, from, to);
  const sent = await sendTx(testAccount(c.network, c.rpcUrl, from), tx);
  if (!sent.ok) {
    emit({ step: "transfer", status: "error", title: "The transfer failed", detail: sent.failure, tx: sent.hash });
    return;
  }
  emit({ step: "transfer", status: "ok", title: "Transfer confirmed on testnet", detail: "A standard NFT transfer on House of Stake's registry.", tx: sent.hash });

  emit({ step: "moved", status: "running", title: "Checking where the account went" });
  const after = await waitForOwner(kit, c.name, to);
  const leftover = after.info.extensions.filter((e) => e !== to && e !== after.info.registrar.hos_extension);
  emit({
    step: "moved",
    status: after.v.owner === to ? "ok" : "error",
    title: after.v.owner === to ? `The account now belongs to ${to}` : "Ownership did not move",
    detail: `Registry and account agree. Keys on the account: ${after.info.accessKeyCount}. Old owner's helpers left: ${leftover.length}.`,
  });

  emit({ step: "new-owner-in", status: "running", title: `${to} signs in` });
  const s3 = await signIn(kit, c, to);
  emit({ step: "new-owner-in", status: s3.ok ? "ok" : "error", title: s3.ok ? `${to} is let in` : `${to} was not let in`, detail: s3.ok ? undefined : s3.reason });

  emit({ step: "old-owner-out", status: "running", title: `${from} comes back with their old sign-in` });
  // The members area runs this exact check on every request (server/index.ts, currentMember).
  const now = verifyItem(await kit.resolve(c.name));
  const stillMember = now.ok && now.active && now.owner === from;
  emit({
    step: "old-owner-out",
    status: stillMember ? "error" : "refused",
    title: stillMember ? `${from} still got in (unexpected)` : `${from} is refused`,
    detail: stillMember ? undefined : `Their sign-in was valid, but the chain now says ${now.owner} owns the membership.`,
  });

  emit({ step: "done", status: "ok", title: "Journey complete", data: { from, to } });
}

/** Agent journey: set an on-chain budget, then let a scripted agent try three payments. */
export async function runAgent(kit: AccountKit, c: DemoConfig, emit: Emit) {
  if (!c.agent) return emit({ step: "setup", status: "error", title: "No demo agent is configured" });
  const owner = verifyItem(await kit.resolve(c.name)).owner!;
  const ownerAcct = testAccount(c.network, c.rpcUrl, owner);

  emit({ step: "setup", status: "running", title: `${owner} sets a 0.5 NEAR limit for the agent` });
  const bal = BigInt((await kit.rpc.viewAccount(c.name)).amount);
  if (bal < toYocto("0.7")) await ownerAcct.transfer({ receiverId: c.name, amount: toYocto("0.8") } as any);
  const status = await kit.agentStatus(c.name, c.agent);
  if (!status.extension_enabled) {
    const r = await sendTx(ownerAcct, addExtensionTx(c.name, c.agent));
    if (!r.ok) return emit({ step: "setup", status: "error", title: "Could not enable the agent", detail: r.failure });
  }
  await sendTx(ownerAcct, revokeSpendTx(c.name, c.agent));
  const g = await sendTx(
    ownerAcct,
    grantSpendTx(c.name, { extension: c.agent, receivers: [c.approved], budgetYocto: toYocto("0.5"), expiresAt: new Date(Date.now() + 3_600_000) }),
  );
  if (!g.ok) return emit({ step: "setup", status: "error", title: "Could not set the limit", detail: g.failure });
  emit({
    step: "setup",
    status: "ok",
    title: "Limit stored on the membership account",
    detail: `${c.agent} may send up to 0.5 NEAR (testnet), only to ${c.approved}, for one hour.`,
    tx: g.hash,
  });

  const ctx = { agent: c.agent, account: c.name, approved: c.approved, stranger: c.stranger };
  for (const task of ["bill", "overspend", "stranger"] as const) {
    const p = propose(task, ctx);
    emit({ step: task, status: "running", title: `Agent tries: ${p.reason}` });
    const r = await attempt(c.network, c.rpcUrl, p);
    emit({
      step: task,
      status: r.tx.ok ? "ok" : "refused",
      title: r.tx.ok ? `Allowed: ${p.amountNear} NEAR to ${p.recipient}` : `Blocked: ${p.amountNear} NEAR to ${p.recipient}`,
      detail: r.verdict.replace(/^(Allowed|Refused) by the wallet: /, r.tx.ok ? "" : "The contract said: "),
      tx: r.tx.hash !== "?" ? r.tx.hash : undefined,
    });
  }

  await sendTx(ownerAcct, revokeSpendTx(c.name, c.agent));
  emit({ step: "done", status: "ok", title: "Limit revoked. Agent demo complete." });
}
