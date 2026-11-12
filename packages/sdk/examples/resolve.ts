/** Usage: pnpm --filter @accountkit/sdk example:resolve <name> [mainnet|testnet] */
import { AccountKit, formatNear, verifyItem } from "../src/index.js";

const name = process.argv[2] ?? "ibuiltthisshit.bid";
const network = process.argv[3] ?? (name.endsWith(".testnet") ? "testnet" : "mainnet");
const kit = new AccountKit({ network });
const info = await kit.resolve(name);
const r = verifyItem(info);
console.log(`${info.name} on ${network}: ${r.ok ? "VERIFIED" : "NOT VERIFIED"}${r.active ? ", active" : ", not active"}`);
console.log(`owner ${r.owner}  balance ${formatNear(info.account.balanceYocto)} NEAR  registry ${info.registry}  block ${info.block.height}`);
for (const c of r.checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.id}: ${c.detail}`);
