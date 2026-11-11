/** Agent demo through the HTTP API, as the browser uses it. Needs the API running with AGENT_ACCOUNT set. */
import { AccountKit, addExtensionTx, buildAuthorization, grantSpendTx, revokeSpendTx, verifyItem } from "@accountkit/sdk";
import { toYocto } from "../server/agent.js";
import { sendTx, testAccount } from "../server/signer.js";

const API = process.env.API ?? "http://localhost:8787";
const RPC = "https://rpc.testnet.fastnear.com";
const NAME = process.env.NAME ?? "alice-member.akclub.testnet";
const kit = new AccountKit({ network: "testnet", rpcUrls: [RPC] });
const owner = verifyItem(await kit.resolve(NAME)).owner!;

const ch = await (await fetch(`${API}/api/challenge`, { method: "POST", body: JSON.stringify({ tla: NAME, owner }) })).json();
const nonce = Uint8Array.from(Buffer.from(ch.nep413.nonce, "base64"));
const s = await testAccount("testnet", RPC, owner).signNep413Message({ message: ch.nep413.message, recipient: ch.nep413.recipient, nonce });
const authorization = buildAuthorization({ tla: NAME, owner, payload: ch.nep413.message, offchainMessage: ch.offchainMessage, nep413: { ...ch.nep413, nonce } }, { publicKey: s.publicKey.toString(), signature: s.signature });
const login = await fetch(`${API}/api/login`, { method: "POST", body: JSON.stringify({ id: ch.id, authorization }) });
const cookie = login.headers.get("set-cookie")!.split(";")[0]!;

// owner sets fresh rules (what the browser does through the wallet)
const ownerAcct = testAccount("testnet", RPC, owner);
const st = await kit.agentStatus(NAME, "ak-agent.testnet");
if (!st.extension_enabled) await sendTx(ownerAcct, addExtensionTx(NAME, "ak-agent.testnet"));
await sendTx(ownerAcct, revokeSpendTx(NAME, "ak-agent.testnet"));
await sendTx(ownerAcct, grantSpendTx(NAME, { extension: "ak-agent.testnet", receivers: ["ak-shop.testnet"], budgetYocto: toYocto("0.5"), expiresAt: new Date(Date.now() + 3_600_000) }));

const info = await (await fetch(`${API}/api/agent`, { headers: { cookie } })).json();
console.log("agent:", info.agent, "|", info.kind, "| grant:", info.status.grant?.budget_yocto, "spent", info.status.grant?.spent_yocto);
for (const t of ["bill", "overspend", "stranger"]) {
  const r = await (await fetch(`${API}/api/agent/attempt`, { method: "POST", headers: { cookie }, body: JSON.stringify({ task: t }) })).json();
  console.log(`${t.padEnd(10)} ${r.tx.ok ? "ALLOWED" : "REFUSED"}  ${r.verdict}  tx=${r.tx.hash}`);
}
const anon = await fetch(`${API}/api/agent/attempt`, { method: "POST", body: JSON.stringify({ task: "bill" }) });
console.log("anonymous attempt status:", anon.status);
