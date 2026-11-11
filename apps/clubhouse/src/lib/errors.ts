/**
 * Turns SDK / wallet / API errors into plain language. The raw message is
 * always kept and shown on demand, so nothing is hidden from a developer.
 */
export function explainError(raw: string): { title: string; text: string } {
  const m = raw.toLowerCase();
  if (m.includes("user rejected") || m.includes("user cancel") || m.includes("user closed") || m.includes("closed the window"))
    return { title: "Request cancelled in your wallet", text: "Nothing was signed or sent. You can try again." };
  if (m.includes("api unreachable") || m.includes("failed to fetch") || m.includes("networkerror"))
    return { title: "The Clubhouse server is not reachable", text: "Start it with pnpm --filter clubhouse dev, then reload this page." };
  if (m.includes("no rpc endpoint answered") || m.includes("rpc_unavailable"))
    return { title: "NEAR testnet did not answer", text: "The public RPC endpoints may be busy. Wait a moment and try again." };
  if (m.includes("is not a leased name") || m.includes("not a valid near account"))
    return { title: "That isn't a valid account name", text: "Enter a full name such as alice-member.akclub.testnet: a label, a dot, then the club's account." };
  if (m.includes("does not exist on"))
    return { title: "No account with that name", text: "No NEAR account with this exact name exists on this network. Check the spelling and the network." };
  if (m.includes("does not run a house of stake registrar") || m.includes("does not answer the house of stake wallet views"))
    return { title: "Not a House of Stake account", text: "The account exists, but it isn't a Top Level Account issued by a House of Stake registrar." };
  if (m.includes("is not the owner") || m.includes("not an owner"))
    return { title: "This wallet doesn't own that membership", text: "Only the current owner of a membership account can sign in with it or transfer it." };
  if (m.includes("is taken")) return { title: "That name is already rented", text: "Pick a different name." };
  if (m.includes("challenge expired")) return { title: "The sign-in request expired", text: "A sign-in request is valid for five minutes. Start again." };
  if (m.includes("not active")) return { title: "The membership is not active", text: "Its lease has expired, or the account is frozen or parked." };
  if (m.includes("already in progress")) return { title: "A run is already in progress", text: "Someone else started the live run. Wait for it to finish, then try again." };
  if (m.includes("keys are not on this server"))
    return { title: "The live run isn't available here", text: "This server doesn't hold the demo accounts' testnet keys. Use your own wallet or look up a name instead." };
  if (m.includes("cannot sign messages")) return { title: "This wallet can't sign messages", text: "Signing in needs NEP-413 message signing. Try another wallet." };
  return { title: "Something went wrong", text: "Try again. If it keeps happening, the technical details say what the network or wallet reported." };
}
