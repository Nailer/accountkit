/**
 * pnpm demo:status: read-only check of the demo setup. Signs nothing.
 *
 * Shows which accounts the live run and the e2e scripts will use (from
 * apps/clubhouse/.env), whether their keys are on this machine, their test
 * NEAR balances, and whether the demo membership verifies and who owns it.
 */
import { AccountKit, formatNear, verifyItem } from "@accountkit/sdk";
import { loadKey } from "../server/signer.js";
import { DEMO, RPC } from "./demo-env.js";

const kit = new AccountKit({ network: "testnet", rpcUrls: [RPC] });
const LOW = 10n ** 24n; // 1 test NEAR: below this, runs may start failing for gas or funding

let problems = 0;
const line = (ok: boolean, text: string) => {
  console.log(`${ok ? "ok  " : "WARN"}  ${text}`);
  if (!ok) problems++;
};

console.log(`membership ${DEMO.name}\n`);
try {
  const v = verifyItem(await kit.resolve(DEMO.name));
  const passed = v.checks.filter((c) => c.ok).length;
  line(v.ok && v.active, `verifies ${passed}/${v.checks.length}, owner ${v.owner}`);
  line(v.owner === DEMO.a || v.owner === DEMO.b, `owned by one of the two demo members (${DEMO.a}, ${DEMO.b})`);
} catch (e) {
  line(false, `could not read the membership: ${(e as Error).message}`);
}

console.log("");
const roles: [string, string][] = [
  ["member A", DEMO.a],
  ["member B", DEMO.b],
  ["agent", DEMO.agent],
  ["approved receiver", DEMO.approved],
];
for (const [role, id] of roles) {
  let hasKey = true;
  try {
    loadKey("testnet", id);
  } catch {
    hasKey = false;
  }
  try {
    const bal = BigInt((await kit.rpc.viewAccount(id)).amount);
    const needsKey = role !== "approved receiver";
    line((hasKey || !needsKey) && bal >= LOW, `${role.padEnd(17)} ${id}  ${formatNear(bal, 3)} test NEAR  ${needsKey ? (hasKey ? "key present" : "NO KEY on this machine") : ""}`);
  } catch {
    line(false, `${role.padEnd(17)} ${id}  does not exist on testnet`);
  }
}

console.log(problems ? `\n${problems} warning(s). Run pnpm demo:bootstrap for a fresh set of accounts.` : "\nready: pnpm e2e:transfer, pnpm e2e:agent, pnpm e2e:attack and the live run will work");
process.exit(problems ? 1 : 0);
