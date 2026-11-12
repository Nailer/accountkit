/**
 * Agent spend-grant check on testnet, against the real TLA wallet:
 *   owner funds the membership account, enables the agent, grants
 *   0.5 NEAR to one recipient for 1 day; then the agent tries three payments.
 *   Only the first may succeed. Finally the owner revokes and the agent is refused.
 */
import { AccountKit, addExtensionTx, grantSpendTx, revokeSpendTx, verifyItem } from "@accountkit/sdk";
import { attempt, propose, toYocto } from "../server/agent.js";
import { sendTx, testAccount } from "../server/signer.js";
import { DEMO, RPC } from "./demo-env.js";

const NAME = DEMO.name;
const AGENT = DEMO.agent;
const SHOP = DEMO.approved;
const kit = new AccountKit({ network: "testnet", rpcUrls: [RPC] });
let fails = 0;
const check = (l: string, c: boolean, x = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${l}${x ? `  (${x})` : ""}`); if (!c) fails++; };
const bal = async (id: string) => BigInt((await kit.rpc.viewAccount(id)).amount);

const owner = verifyItem(await kit.resolve(NAME)).owner!;
// Any existing account outside the grant; the same default the server uses.
const stranger = process.env.AGENT_STRANGER?.trim() || "akclub.testnet";
const ownerAcct = testAccount("testnet", RPC, owner);
console.log(`owner ${owner}, agent ${AGENT}, approved recipient ${SHOP}\n`);

// 1. fund the membership account so there is something to spend
if ((await bal(NAME)) < toYocto("0.7")) {
  await ownerAcct.transfer({ receiverId: NAME, amount: toYocto("0.8") } as any);
  console.log("owner funded the membership account with 0.8 NEAR");
}

// 2. enable the agent as an extension
let status = await kit.agentStatus(NAME, AGENT);
if (!status.extension_enabled) {
  const r = await sendTx(ownerAcct, addExtensionTx(NAME, AGENT));
  check("owner enabled the agent as an extension", r.ok, r.failure);
}
// a fresh grant starts from zero spent
await sendTx(ownerAcct, revokeSpendTx(NAME, AGENT));
const g = await sendTx(
  ownerAcct,
  grantSpendTx(NAME, { extension: AGENT, receivers: [SHOP], budgetYocto: toYocto("0.5"), expiresAt: new Date(Date.now() + 86_400_000) }),
);
check("owner granted 0.5 NEAR to one recipient for 24h", g.ok, g.failure);
status = await kit.agentStatus(NAME, AGENT);
check("grant is readable on chain", status.grant?.budget_yocto === toYocto("0.5").toString(), JSON.stringify(status.grant?.receivers));

const ctx = { agent: AGENT, account: NAME, approved: SHOP, stranger };
const shopBefore = await bal(SHOP);
const a1 = await attempt("testnet", RPC, propose("bill", ctx));
check("agent pays the approved 0.2 NEAR bill", a1.tx.ok, a1.verdict);
check("shop received 0.2 NEAR", (await bal(SHOP)) - shopBefore === toYocto("0.2"));

const a2 = await attempt("testnet", RPC, propose("overspend", ctx));
check("agent's 0.4 NEAR payment (0.6 total > 0.5) is refused on chain", !a2.tx.ok, a2.verdict);

const a3 = await attempt("testnet", RPC, propose("stranger", ctx));
check(`agent's payment to unapproved ${stranger} is refused on chain`, !a3.tx.ok, a3.verdict);

const rv = await sendTx(ownerAcct, revokeSpendTx(NAME, AGENT));
check("owner revoked the grant", rv.ok, rv.failure);
const a4 = await attempt("testnet", RPC, { ...propose("bill", ctx), amountNear: "0.1" });
check("after revoke, even an approved-recipient payment is refused", !a4.tx.ok, a4.verdict);

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
