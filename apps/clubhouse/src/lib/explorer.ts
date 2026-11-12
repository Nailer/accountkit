/** NearBlocks links: the public explorer used everywhere Clubhouse shows on-chain evidence. */
const base = (network: string) => `https://${network === "mainnet" ? "" : "testnet."}nearblocks.io`;

export const explorerTx = (network: string, hash: string) => `${base(network)}/txns/${hash}`;
export const explorerAccount = (network: string, accountId: string) => `${base(network)}/address/${accountId}`;
