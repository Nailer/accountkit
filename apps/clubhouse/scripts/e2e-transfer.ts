/**
 * End-to-end check of the core Clubhouse journey on testnet, using the real
 * House of Stake contracts we deployed (see DEPLOYMENT.md):
 *
 *   1. resolve + verify the membership name
 *   2. the current owner signs in (NEP-641 via an NEP-413 signature)  -> accepted
 *   3. the other account tries to sign in                              -> refused
 *   4. the owner transfers the name with NEP-171 nft_transfer          -> on chain
 *   5. the new owner signs in -> accepted; the old owner -> refused
 *
 * Runs in either direction: whoever holds the name now hands it to the other.
 * Env: NAME (default alice-member.akclub.testnet), A / B (default ak-alice / ak-bob .testnet)
 */
import { AccountKit, buildAuthorization, createSignInRequest, verifyItem, verifySignIn } from "@accountkit/sdk";
import { sendTx, testAccount } from "../server/signer.js";

const NETWORK = "testnet";
const RPC = process.env.RPC_URL ?? "https://rpc.testnet.fastnear.com";
const NAME = process.env.NAME ?? "alice-member.akclub.testnet";
const A = process.env.A ?? "ak-alice.testnet";
const B = process.env.B ?? "ak-bob.testnet";
const kit = new AccountKit({ network: NETWORK, rpcUrls: [RPC] });

let failures = 0;
function check(label: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!cond) failures++;
}

async function signIn(accountId: string) {
  const acct = testAccount(NETWORK, RPC, accountId);
  const payload = { domain: "Clubhouse", action: "Login", msg: JSON.stringify({ tla: NAME, challenge: crypto.randomUUID() }) };
  const req = createSignInRequest({ tla: NAME, owner: accountId, chainId: kit.chainId, payload });
  // near-api-js's own NEP-413 signer: an independent implementation of what wallets do.
  const signed = await acct.signNep413Message({ message: req.nep413.message, recipient: req.nep413.recipient, nonce: req.nep413.nonce });
  const authorization = buildAuthorization(req, { publicKey: signed.publicKey.toString(), signature: signed.signature });
  return verifySignIn(kit, { tla: NAME, authorization, expectedPayload: req.payload });
}

async function waitForOwner(expected: string) {
  for (let i = 0; i < 20; i++) {
    const v = verifyItem(await kit.resolve(NAME));
    if (v.owner === expected) return v;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return verifyItem(await kit.resolve(NAME));
}

const before = verifyItem(await kit.resolve(NAME));
check(`${NAME} verifies`, before.ok && before.active, `owner ${before.owner}`);
const from = before.owner!;
const to = from === A ? B : A;
console.log(`\n${from} holds the membership; it will move to ${to}\n`);

const s1 = await signIn(from);
check(`owner ${from} signs in`, s1.ok, s1.reason);
const s2 = await signIn(to);
check(`non-owner ${to} is refused`, !s2.ok, s2.reason);

let refused = "";
try {
  await kit.prepareTransfer(NAME, from, "no-such-account-ak-e2e.testnet");
} catch (e) {
  refused = (e as Error).message;
}
check("transfer to a non-existent account is refused before signing", refused.includes("does not exist"), refused);

const tx = await kit.prepareTransfer(NAME, from, to);
const sent = await sendTx(testAccount(NETWORK, RPC, from), tx);
check(`nft_transfer ${from} -> ${to} succeeds`, sent.ok, sent.ok ? `https://testnet.nearblocks.io/txns/${sent.hash}` : sent.failure);

const after = await waitForOwner(to);
check(`registry and account now both say ${to}`, after.ok && after.owner === to, `owner ${after.owner}`);
const afterInfo = await kit.resolve(NAME);
check("the account still holds no keys", afterInfo.accessKeyCount === 0);
const leftover = afterInfo.extensions.filter((e) => e !== to && e !== afterInfo.registrar.hos_extension);
check("no extension of the old owner survives (agents and co-owners are cleared)", leftover.length === 0, `w_extensions = [${afterInfo.extensions.join(", ")}]`);

const s3 = await signIn(to);
check(`new owner ${to} signs in`, s3.ok, s3.reason);
const s4 = await signIn(from);
check(`old owner ${from} is refused`, !s4.ok, s4.reason);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
