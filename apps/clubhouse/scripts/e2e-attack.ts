/**
 * pnpm e2e:attack: a compromised agent, and a sale in the middle of a payout, on testnet.
 *
 * The owner gives the agent a 0.5 test NEAR budget for one approved receiver.
 * Then the agent behaves as if its prompt or key were hijacked, and tries to:
 *   1. pay its own account                         -> refused by the wallet contract
 *   2. add an accomplice as a second agent         -> refused (only the owner edits agents)
 *   3. remove the owner, to lock them out          -> refused (only the owner edits agents)
 *   4. sign in to Clubhouse as the membership      -> refused (a grantee is not the owner)
 * Then a legitimate payout starts, the owner sells the membership half-way through,
 * and the agent tries to keep paying:
 *   5. one approved payment                        -> allowed
 *   6. the owner transfers the NFT (the sale)      -> on chain
 *   7. the agent's next payment                    -> refused: the sale ended the grant
 *   and the account's spare NEAR is swept back to the seller by House of Stake's wallet.
 *
 * Every allowed or refused payment is a real testnet transaction, printed with a link.
 * Accounts come from apps/clubhouse/.env (see `pnpm demo:bootstrap`).
 */
import {
  AccountKit,
  addExtensionTx,
  buildAuthorization,
  createSignInRequest,
  executeTx,
  grantSpendTx,
  nearTransfer,
  removeExtensionTx,
  revokeSpendTx,
  verifyItem,
  verifySignIn,
} from "@accountkit/sdk";
import { toYocto } from "../server/agent.js";
import { sendTx, testAccount, type SentTx } from "../server/signer.js";
import { DEMO, RPC } from "./demo-env.js";

const NETWORK = "testnet";
const NAME = DEMO.name;
const AGENT = DEMO.agent;
const SHOP = DEMO.approved;
const ACCOMPLICE = process.env.AGENT_STRANGER?.trim() || "akclub.testnet";
const kit = new AccountKit({ network: NETWORK, rpcUrls: [RPC] });

let fails = 0;
const link = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `\n      ${extra}` : ""}`);
  if (!ok) fails++;
};
const reason = (t: SentTx) => {
  const m = /Smart contract panicked: ([^\n"\\]+)/.exec(t.failure ?? "");
  return m?.[1] ?? (t.failure ?? "").slice(0, 160);
};
const refused = (t: SentTx) => `refused on chain: "${reason(t)}"  ${link(t.hash)}`;
const bal = async (id: string) => BigInt((await kit.rpc.viewAccount(id)).amount);
const near = (y: bigint) => (Number(y / 10n ** 21n) / 1000).toFixed(3);

const owner = verifyItem(await kit.resolve(NAME)).owner!;
const buyer = owner === DEMO.a ? DEMO.b : DEMO.a;
const ownerAcct = testAccount(NETWORK, RPC, owner);
const agentAcct = testAccount(NETWORK, RPC, AGENT);
console.log(`membership ${NAME}\nowner ${owner} · agent ${AGENT} · approved receiver ${SHOP} · buyer ${buyer}\n`);

/* ---------- setup: the owner gives the agent a budget ---------- */
if ((await bal(NAME)) < toYocto("0.7")) {
  await ownerAcct.transfer({ receiverId: NAME, amount: toYocto("0.8") } as any);
  console.log("setup: owner funded the membership account with 0.8 test NEAR");
}
if (!(await kit.agentStatus(NAME, AGENT)).extension_enabled) {
  const r = await sendTx(ownerAcct, addExtensionTx(NAME, AGENT));
  check("setup: owner enabled the agent", r.ok, r.failure);
}
await sendTx(ownerAcct, revokeSpendTx(NAME, AGENT)); // start from a clean grant
const g = await sendTx(
  ownerAcct,
  grantSpendTx(NAME, { extension: AGENT, receivers: [SHOP], budgetYocto: toYocto("0.5"), expiresAt: new Date(Date.now() + 3_600_000) }),
);
check(`setup: owner grants the agent 0.5 NEAR, only to ${SHOP}, for 1 hour`, g.ok, g.ok ? link(g.hash) : g.failure);

/* ---------- a hijacked agent ---------- */
console.log("\n— the agent is compromised and tries to escape its limits —");

const a1 = await sendTx(agentAcct, executeTx(NAME, { external: [nearTransfer(AGENT, toYocto("0.3"))] }, 60n));
check("1. agent tries to pay 0.3 NEAR to its own account", !a1.ok, a1.ok ? `ALLOWED ${link(a1.hash)}` : refused(a1));

const a2 = await sendTx(agentAcct, addExtensionTx(NAME, ACCOMPLICE));
check(`2. agent tries to add ${ACCOMPLICE} as another agent`, !a2.ok, a2.ok ? `ALLOWED ${link(a2.hash)}` : refused(a2));

const a3 = await sendTx(agentAcct, removeExtensionTx(NAME, owner));
check("3. agent tries to remove the owner and lock them out", !a3.ok, a3.ok ? `ALLOWED ${link(a3.hash)}` : refused(a3));

const req = createSignInRequest({
  tla: NAME,
  owner: AGENT,
  chainId: kit.chainId,
  payload: { domain: "Clubhouse", action: "Login", msg: JSON.stringify({ tla: NAME, challenge: crypto.randomUUID() }) },
});
const signed = await agentAcct.signNep413Message({ message: req.nep413.message, recipient: req.nep413.recipient, nonce: req.nep413.nonce });
const login = await verifySignIn(kit, {
  tla: NAME,
  authorization: buildAuthorization(req, { publicKey: signed.publicKey.toString(), signature: signed.signature }),
  expectedPayload: req.payload,
});
check("4. agent tries to sign in to Clubhouse as the membership", !login.ok, login.ok ? "ACCEPTED" : `refused: ${login.reason}`);

const still = await kit.agentStatus(NAME, AGENT);
check(
  "   after the attempts: owner still in control, budget untouched",
  still.extension_enabled && still.grant?.spent_yocto === "0" && (await kit.resolve(NAME)).extensions.includes(owner),
  `grant spent: ${still.grant?.spent_yocto ?? "?"} yocto`,
);

/* ---------- a sale in the middle of a payout ---------- */
console.log("\n— a payout is running when the owner sells the membership —");

const before = await bal(NAME);
const p1 = await sendTx(agentAcct, executeTx(NAME, { external: [nearTransfer(SHOP, toYocto("0.2"))] }, 60n));
check(`5. agent pays the approved 0.2 NEAR to ${SHOP}`, p1.ok, p1.ok ? `allowed  ${link(p1.hash)}` : p1.failure);

const memberBeforeSale = await bal(NAME);
const sellerBeforeSale = await bal(owner);
const sale = await sendTx(ownerAcct, await kit.prepareTransfer(NAME, owner, buyer));
check(`6. owner sells: nft_transfer ${owner} -> ${buyer}`, sale.ok, sale.ok ? link(sale.hash) : sale.failure);
let v = verifyItem(await kit.resolve(NAME));
for (let i = 0; i < 20 && v.owner !== buyer; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  v = verifyItem(await kit.resolve(NAME));
}

const p2 = await sendTx(agentAcct, executeTx(NAME, { external: [nearTransfer(SHOP, toYocto("0.1"))] }, 60n));
check("7. agent tries the next approved payment after the sale", !p2.ok, p2.ok ? `ALLOWED ${link(p2.hash)}` : refused(p2));

const after = await kit.agentStatus(NAME, AGENT);
const info = await kit.resolve(NAME);
check(
  `   ${buyer} now controls the account; the seller's agent and grant are gone`,
  v.owner === buyer && !after.extension_enabled && !after.grant && info.accessKeyCount === 0,
  `owner ${v.owner} · w_extensions = [${info.extensions.join(", ")}] · access keys: ${info.accessKeyCount}`,
);
// House of Stake's wallet sweeps the account's spare NEAR (above its storage reserve)
// to the outgoing payout account on every sale or transfer: the seller gets it back.
const memberAfterSale = await bal(NAME);
const sellerGain = (await bal(owner)) - sellerBeforeSale;
const swept = memberBeforeSale - memberAfterSale;
check(
  "   the account's spare NEAR went back to the seller, not to the buyer",
  swept > 0n && sellerGain > swept - toYocto("0.01"),
  `membership balance ${near(before)} -> ${near(memberBeforeSale)} after the payout -> ${near(memberAfterSale)} after the sale (storage reserve); seller +${near(sellerGain)}`,
);

console.log(fails ? `\n${fails} check(s) failed` : "\nall checks passed: the agent could not escape its budget, and the sale ended its access");
process.exit(fails ? 1 : 0);
