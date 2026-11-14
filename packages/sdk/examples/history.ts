/** Usage: pnpm --filter @accountkit/sdk example:history <name> [mainnet|testnet]   (read-only) */
import { AccountKit, formatNear } from "../src/index.js";

const name = process.argv[2] ?? "alice-member.akclub.testnet";
const network = process.argv[3] ?? (name.endsWith(".testnet") ? "testnet" : "mainnet");
const kit = new AccountKit({ network });
const h = await kit.history(name);
const day = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

console.log(`${h.name} on ${network}: ${h.events.length} events${h.complete ? "" : " (latest window; older ones exist)"}`);
console.log(`changed hands ${h.totals.ownershipChanges}x  paid out ${formatNear(h.totals.paidOutYocto)} NEAR  received ${formatNear(h.totals.receivedYocto)} NEAR  returned to sellers ${formatNear(h.totals.sweptYocto)} NEAR  refused instructions ${h.totals.refusedCalls}`);
console.log("\nowners, newest first:");
for (const x of h.holders.slice(0, 8)) console.log(`  ${day(x.since)}  ${x.owner}  tx ${x.txHash}`);
console.log("\nlatest events:");
for (const e of h.events.slice(0, 12)) {
  const what =
    e.kind === "ownership" ? `changed hands ${e.from ?? "?"} -> ${e.to ?? "?"}`
    : e.kind === "sweep" ? `spare NEAR returned to the seller: ${formatNear(e.amountYocto)} to ${e.to}`
    : e.kind === "payout" ? `paid out ${formatNear(e.amountYocto)} NEAR to ${e.to}`
    : e.kind === "received" ? `received ${formatNear(e.amountYocto)} NEAR from ${e.from}`
    : e.kind === "created" ? `created through ${e.by}`
    : `instruction from ${e.by} ${e.ok ? "carried out" : "REFUSED by the wallet"}`;
  console.log(`  ${day(e.at)}  ${what}`);
}
