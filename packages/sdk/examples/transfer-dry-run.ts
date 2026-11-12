/**
 * Usage: pnpm --filter @accountkit/sdk example:transfer <name> <from> <to> [mainnet|testnet]
 *
 * Builds the transfer a wallet would sign, without signing anything, and shows
 * what AccountKit refuses first. Read-only: safe to run against mainnet.
 */
import { AccountKit, isAccountKitError } from "../src/index.js";

const [name = "ibuiltthisshit.bid", from = "dizzy123.near", to = "near", net] = process.argv.slice(2);
const network = net ?? (name.endsWith(".testnet") ? "testnet" : "mainnet");
const kit = new AccountKit({ network });

try {
  const tx = await kit.prepareTransfer(name, from, to);
  console.log(`${from} could transfer ${name} to ${to}. The owner's wallet would sign:`);
  console.log(JSON.stringify(tx, null, 2));
} catch (e) {
  if (!isAccountKitError(e)) throw e;
  console.log(`Refused before signing (${e.code}): ${e.message}`);
  process.exitCode = 1;
}
