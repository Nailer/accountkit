/**
 * pnpm demo:bootstrap
 *
 * Sets up your OWN demo accounts on NEAR testnet, so the live run and the e2e
 * scripts work on any machine, without the original team's keys:
 *
 *   1. creates three fresh testnet accounts (two members and an agent),
 *      funded by the public NEAR testnet faucet;
 *   2. member A rents a Clubhouse membership under akclub.testnet with the
 *      SDK's rentQuote() transaction (about 1.7 test NEAR);
 *   3. checks the membership verifies (13 checks) with A as its owner;
 *   4. writes the account names and the key folder to apps/clubhouse/.env.
 *
 * Testnet only. Test NEAR has no value. The keys are written to
 * apps/clubhouse/.demo-keys/ (git-ignored) and are never printed.
 *
 * Env (all optional):
 *   DEMO_KEYS_DIR   where to write keys        (default apps/clubhouse/.demo-keys)
 *   ENV_FILE        which .env file to update  (default apps/clubhouse/.env)
 *   PREFIX          account name prefix        (default "akd-" + 6 random characters)
 *   FUNDER          if the faucet refuses (rate limit), an existing testnet account of
 *                   yours that pays for the new accounts instead (~3 NEAR each). Its key is
 *                   read from FUNDER_CREDENTIALS_DIR (default ~/.near-credentials).
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AccountKit, verifyItem } from "@accountkit/sdk";
import { Account, KeyPair, actions } from "near-api-js-v7";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NETWORK = "testnet";
const CLUB_TLA = "akclub.testnet";
const RPC = process.env.RPC_URL ?? "https://rpc.testnet.fastnear.com";
const FAUCET = "https://helper.nearprotocol.com/account";
const KEYS_DIR = resolve(process.env.DEMO_KEYS_DIR ?? join(APP_DIR, ".demo-keys"));
const ENV_FILE = resolve(process.env.ENV_FILE ?? join(APP_DIR, ".env"));
const PREFIX = process.env.PREFIX ?? `akd-${randomBytes(4).toString("hex").slice(0, 6)}`;
const FUNDER = process.env.FUNDER?.trim() || null;
const FUNDER_DIR = process.env.FUNDER_CREDENTIALS_DIR ?? join(homedir(), ".near-credentials");

const kit = new AccountKit({ network: NETWORK, rpcUrls: [RPC] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (s: string) => console.log(`\n▸ ${s}`);

async function exists(accountId: string): Promise<boolean> {
  try {
    await kit.rpc.viewAccount(accountId);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(accountId: string): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    if (await exists(accountId)) return true;
    await sleep(1500);
  }
  return false;
}

/** Saves a key in the NEAR CLI's legacy keychain format, which server/signer.ts reads. */
function saveKey(accountId: string, kp: KeyPair) {
  const dir = join(KEYS_DIR, NETWORK);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `${accountId}.json`);
  const body = { account_id: accountId, public_key: kp.getPublicKey().toString(), private_key: kp.toString() };
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
}

async function viaFaucet(accountId: string, publicKey: string): Promise<string | null> {
  try {
    const res = await fetch(FAUCET, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
    });
    if (res.ok) return null;
    return `faucet answered ${res.status} ${(await res.text()).slice(0, 120)}`;
  } catch (e) {
    return `faucet unreachable: ${(e as Error).message}`;
  }
}

/** Fallback: an existing account creates the new one through the `testnet` registrar contract. */
async function viaFunder(accountId: string, publicKey: string): Promise<string | null> {
  if (!FUNDER) return "no FUNDER set";
  const file = join(FUNDER_DIR, NETWORK, `${FUNDER}.json`);
  if (!existsSync(file)) return `FUNDER key not found at ${file}`;
  const key = JSON.parse(readFileSync(file, "utf8")).private_key;
  const funder = new Account(FUNDER, RPC, key);
  try {
    await funder.signAndSendTransaction({
      receiverId: "testnet",
      actions: [
        actions.functionCall(
          "create_account",
          new TextEncoder().encode(JSON.stringify({ new_account_id: accountId, new_public_key: publicKey })),
          30_000_000_000_000n,
          3_000_000_000_000_000_000_000_000n, // 3 test NEAR
        ),
      ],
      waitUntil: "FINAL",
    } as any);
    return null;
  } catch (e) {
    return `FUNDER could not create it: ${(e as Error).message}`;
  }
}

async function createAccount(accountId: string): Promise<void> {
  if (await exists(accountId)) throw new Error(`${accountId} already exists; pick another PREFIX`);
  const kp = KeyPair.fromRandom("ed25519");
  const pub = kp.getPublicKey().toString();
  // Save the key first, so an account the faucet creates is never left without its key.
  saveKey(accountId, kp);
  let why = await viaFaucet(accountId, pub);
  if (why) {
    console.log(`  ${why}`);
    if (FUNDER) {
      console.log(`  trying FUNDER ${FUNDER} instead`);
      why = await viaFunder(accountId, pub);
    }
  }
  if (why && !(await exists(accountId))) {
    throw new Error(
      `${accountId} could not be created (${why}).\n  The faucet rate-limits by IP; wait a few minutes and run again, or set FUNDER=<your testnet account>.`,
    );
  }
  if (!(await waitFor(accountId))) throw new Error(`${accountId} did not appear on testnet`);
  const bal = (await kit.rpc.viewAccount(accountId)).amount;
  console.log(`  ✓ ${accountId}  (${(Number(BigInt(bal) / 10n ** 21n) / 1000).toFixed(2)} test NEAR)`);
}

/** Sets KEY=value lines in the .env file, keeping every other line. */
function writeEnv(values: Record<string, string>) {
  const source = existsSync(ENV_FILE) ? ENV_FILE : join(APP_DIR, ".env.example");
  const lines = existsSync(source) ? readFileSync(source, "utf8").split("\n") : [];
  const left = new Map(Object.entries(values));
  const out = lines.map((line) => {
    const m = /^#?\s*([A-Z_]+)=/.exec(line);
    if (m && left.has(m[1]!)) {
      const v = left.get(m[1]!)!;
      left.delete(m[1]!);
      return `${m[1]}=${v}`;
    }
    return line;
  });
  if (left.size) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push("# Demo accounts written by pnpm demo:bootstrap");
    for (const [k, v] of left) out.push(`${k}=${v}`);
  }
  writeFileSync(ENV_FILE, out.join("\n").replace(/\n*$/, "\n"));
}

/* ---------------- run ---------------- */

const A = `${PREFIX}-a.testnet`;
const B = `${PREFIX}-b.testnet`;
const AGENT = `${PREFIX}-agent.testnet`;
const label = `${PREFIX.replace(/[^a-z0-9]/g, "")}-member`;

console.log("Clubhouse demo bootstrap (NEAR testnet only, test NEAR only)");
console.log(`  keys  → ${KEYS_DIR}/${NETWORK}/`);
console.log(`  .env  → ${ENV_FILE}`);

step("Creating three testnet accounts from the faucet");
await createAccount(A);
await createAccount(B);
let agent: string | null = AGENT;
try {
  await createAccount(AGENT);
} catch (e) {
  console.log(`  ! agent account skipped: ${(e as Error).message.split("\n")[0]}`);
  console.log("    The ownership run still works; run bootstrap again later for the agent run.");
  agent = null;
}

step(`${A} rents a Clubhouse membership with the SDK's rentQuote()`);
const q = await kit.rentQuote(CLUB_TLA, label);
if (!q.available) throw new Error(`${q.name} is taken; run again with another PREFIX`);
console.log(`  ${q.name}: ${(Number(BigInt(q.totalYocto) / 10n ** 21n) / 1000).toFixed(3)} test NEAR`);
const renter = new Account(A, RPC, JSON.parse(readFileSync(join(KEYS_DIR, NETWORK, `${A}.json`), "utf8")).private_key);
const tx = q.tx.actions[0]!;
const sent: any = await renter.signAndSendTransaction({
  receiverId: q.tx.receiverId,
  actions: [
    actions.functionCall(
      tx.params.methodName,
      new TextEncoder().encode(JSON.stringify(tx.params.args)),
      BigInt(tx.params.gas),
      BigInt(tx.params.deposit),
    ),
  ],
  waitUntil: "FINAL",
} as any);
console.log(`  ✓ rented  https://testnet.nearblocks.io/txns/${sent?.transaction?.hash ?? "?"}`);

step("Verifying the membership on chain");
let v = verifyItem(await kit.resolve(q.name));
for (let i = 0; i < 10 && v.owner !== A; i++) {
  await sleep(1500);
  v = verifyItem(await kit.resolve(q.name));
}
const passed = v.checks.filter((c) => c.ok).length;
console.log(`  ${v.ok && v.owner === A ? "✓" : "✗"} ${q.name}: ${passed}/${v.checks.length} checks, owner ${v.owner}`);
if (!v.ok || v.owner !== A) throw new Error("the membership did not verify; see the checks above");

step("Writing the demo accounts to .env");
writeEnv({
  NETWORK,
  CLUB_TLA,
  NEAR_CREDENTIALS_DIR: KEYS_DIR,
  DEMO_NAME: q.name,
  DEMO_A: A,
  DEMO_B: B,
  ...(agent ? { AGENT_ACCOUNT: agent, AGENT_APPROVED: B } : {}),
});
console.log(`  ✓ ${ENV_FILE}`);

console.log(`
Done. Your demo membership is ${q.name}, owned by ${A}.

Next:
  pnpm e2e:transfer      # hand it to the other member: 10 checks on testnet
  pnpm dev               # then open http://localhost:5173/demo#live and press "Start the live run"
`);
