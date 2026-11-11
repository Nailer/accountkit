/** Rents a name with the SDK's rentQuote() transaction, as the "Join the club" button does. Usage: tsx scripts/check-rent.ts <label> <renter> */
import { AccountKit, verifyItem } from "@accountkit/sdk";
import { sendTx, testAccount } from "../server/signer.js";

const [label = "shop-membership-01", renter = "ak-shop.testnet"] = process.argv.slice(2);
const kit = new AccountKit({ network: "testnet" });
const q = await kit.rentQuote("akclub.testnet", label);
console.log(q.name, "available:", q.available, "price:", q.totalYocto);
if (!q.available) process.exit(0);
const r = await sendTx(testAccount("testnet", kit.rpc.urls[0]!, renter), q.tx);
console.log("rent", r.ok ? "OK" : "FAILED", r.hash, r.failure ?? "");
await new Promise((res) => setTimeout(res, 3000));
const v = verifyItem(await kit.resolve(q.name));
console.log(q.name, v.ok ? "VERIFIED" : "NOT VERIFIED", "owner", v.owner);
