/**
 * Exercises the Clubhouse API the way the browser does, with test keys
 * standing in for the wallet. Proves the gate re-checks the chain:
 * after the transfer the SAME session cookie is refused.
 * Needs the API running: NETWORK=testnet CLUB_TLA=akclub.testnet pnpm server
 */
import { AccountKit, buildAuthorization, verifyItem } from "@accountkit/sdk";
import { sendTx, testAccount } from "../server/signer.js";

const API = process.env.API ?? "http://localhost:8787";
const RPC = process.env.RPC_URL ?? "https://rpc.testnet.fastnear.com";
const NAME = process.env.NAME ?? "alice-member.akclub.testnet";
const A = "ak-alice.testnet";
const B = "ak-bob.testnet";
const kit = new AccountKit({ network: "testnet", rpcUrls: [RPC] });
let fails = 0;
const check = (l: string, c: boolean, x = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${l}${x ? `  (${x})` : ""}`); if (!c) fails++; };

async function login(accountId: string): Promise<{ cookie: string | null; body: any }> {
  const ch = await (await fetch(`${API}/api/challenge`, { method: "POST", body: JSON.stringify({ tla: NAME, owner: accountId }) })).json();
  const nonce = Uint8Array.from(Buffer.from(ch.nep413.nonce, "base64"));
  const s = await testAccount("testnet", RPC, accountId).signNep413Message({ message: ch.nep413.message, recipient: ch.nep413.recipient, nonce });
  const authorization = buildAuthorization(
    { tla: NAME, owner: accountId, payload: ch.nep413.message, offchainMessage: ch.offchainMessage, nep413: { ...ch.nep413, nonce } },
    { publicKey: s.publicKey.toString(), signature: s.signature },
  );
  const r = await fetch(`${API}/api/login`, { method: "POST", body: JSON.stringify({ id: ch.id, authorization }) });
  return { cookie: r.headers.get("set-cookie")?.split(";")[0] ?? null, body: await r.json() };
}
const members = async (cookie: string | null) => {
  const r = await fetch(`${API}/api/members`, { headers: cookie ? { cookie } : {} });
  return { status: r.status, body: await r.json() };
};

const owner = verifyItem(await kit.resolve(NAME)).owner!;
const other = owner === A ? B : A;
console.log(`${owner} holds ${NAME}\n`);

check("anonymous visitor is refused", (await members(null)).status === 401);
const intruder = await login(other);
check(`${other} cannot sign in`, !intruder.body.ok && !intruder.cookie, intruder.body.reason);
const me = await login(owner);
check(`${owner} signs in`, me.body.ok && !!me.cookie);
const m1 = await members(me.cookie);
check("members page opens", m1.status === 200 && m1.body.member === owner);

const tx = await kit.prepareTransfer(NAME, owner, other);
const sent = await sendTx(testAccount("testnet", RPC, owner), tx);
check(`transfer ${owner} -> ${other}`, sent.ok, sent.hash);
await new Promise((r) => setTimeout(r, 3000));

const m2 = await members(me.cookie);
check("the old session is now refused", m2.status === 403, m2.body.reason);
const them = await login(other);
const m3 = await members(them.cookie);
check(`${other} signs in and the page opens`, them.body.ok && m3.status === 200 && m3.body.member === other);
console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
