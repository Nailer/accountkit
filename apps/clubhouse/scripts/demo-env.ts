/**
 * The demo accounts the e2e scripts use. Reads apps/clubhouse/.env (written by
 * `pnpm demo:bootstrap`), so the scripts and the server always agree.
 * Real environment variables win over .env.
 */
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* no .env file: use the environment as is */
}

const env = (k: string) => process.env[k]?.trim() || undefined;

export const RPC = env("RPC_URL") ?? env("RPC_URLS")?.split(",")[0]?.trim() ?? "https://rpc.testnet.fastnear.com";
export const DEMO = {
  name: env("NAME") ?? env("DEMO_NAME") ?? "alice-member.akclub.testnet",
  a: env("A") ?? env("DEMO_A") ?? "ak-alice.testnet",
  b: env("B") ?? env("DEMO_B") ?? "ak-bob.testnet",
  agent: env("AGENT") ?? env("AGENT_ACCOUNT") ?? "ak-agent.testnet",
  approved: env("SHOP") ?? env("AGENT_APPROVED") ?? "ak-shop.testnet",
};
