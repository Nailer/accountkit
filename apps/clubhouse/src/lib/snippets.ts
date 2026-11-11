/** Code shown in the UI. Function names and arguments match @accountkit/sdk exactly. */
export const SDK_SNIPPETS = [
  {
    id: "verify",
    label: "Verify",
    code: `import { AccountKit, verifyItem } from "@accountkit/sdk";

const kit = new AccountKit({ network: "testnet" });

// Registrar, registry, account, lease, keys: read at one block.
const info = await kit.resolve("alice-member.akclub.testnet");
const { ok, active, owner, checks } = verifyItem(info);

if (ok && active) console.log("owned by", owner); // 13 checks passed`,
  },
  {
    id: "signin",
    label: "Sign in",
    code: `import { createSignInRequest, buildAuthorization, verifySignIn } from "@accountkit/sdk";

// Browser: the owner's wallet signs a message (NEP-413). No transaction.
const req = createSignInRequest({ tla, owner, chainId: "testnet", payload });
const signed = await wallet.signMessage({ ...req.nep413, nonce: Buffer.from(req.nep413.nonce) });
const authorization = buildAuthorization(req, signed);

// Server: accept only the CURRENT, verified owner (NEP-641 resolution).
const result = await verifySignIn(kit, { tla, authorization, expectedPayload: req.payload });
if (result.ok) startSession(result.owner);`,
    note: "wallet is your NEAR Wallet Selector instance; startSession is your app's own code.",
  },
  {
    id: "transfer",
    label: "Transfer",
    code: `// Checks the name verifies, \`from\` owns it, and the receiver exists.
const tx = await kit.prepareTransfer(name, currentOwner, "friend.testnet");

// NEP-171 nft_transfer on the registry, signed by the owner's wallet.
await wallet.signAndSendTransaction(tx);`,
  },
  {
    id: "agent",
    label: "Agent limits",
    code: `import { addExtensionTx, grantSpendTx } from "@accountkit/sdk";

await wallet.signAndSendTransactions({
  transactions: [
    addExtensionTx(name, "agent.testnet"),
    grantSpendTx(name, {
      extension: "agent.testnet",
      receivers: ["shop.testnet"],          // anywhere else: refused
      budgetYocto: 500_000_000_000_000_000_000_000n, // 0.5 NEAR in total
      expiresAt: new Date(Date.now() + 3_600_000),   // one hour
    }),
  ],
});`,
    note: "The membership account's contract (hos_grant_spend) enforces the budget, receivers and expiry.",
  },
];
