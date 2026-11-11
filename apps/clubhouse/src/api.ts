export interface Check {
  id: string;
  ok: boolean;
  detail: string;
}

export interface Membership {
  name: string;
  tla: string;
  owner: string | null;
  verified: boolean;
  active: boolean;
  checks: Check[];
  balanceYocto: string;
  leaseUntilNs: string;
  payoutAccount: string;
  registry: string;
  extensions: string[];
  block: { hash: string; height: number };
}

export interface Config {
  network: string;
  chainId: string;
  club: string | null;
  agent: string | null;
}

export interface MembersResponse {
  ok: boolean;
  member?: string;
  membership?: Membership;
  checkedAt?: string;
  notes?: string[];
  reason?: string;
  signedInAs?: string | null;
  tla?: string | null;
  currentOwner?: string | null;
}

async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !("ok" in body) && !("reason" in body)) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  config: () => fetch("/api/config").then((r) => j<Config>(r)),
  names: (owner: string) => fetch(`/api/names?owner=${encodeURIComponent(owner)}`).then((r) => j<{ names: string[] }>(r)),
  lookup: (name: string) => fetch(`/api/tla?name=${encodeURIComponent(name)}`).then((r) => j<Membership>(r)),
  challenge: (tla: string, owner: string) =>
    fetch("/api/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tla, owner }) }).then((r) =>
      j<{ id: string; offchainMessage: any; nep413: { message: string; recipient: string; nonce: string }; error?: string }>(r),
    ),
  login: (id: string, authorization: string) =>
    fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, authorization }) }).then((r) =>
      j<{ ok: boolean; owner?: string; reason?: string }>(r),
    ),
  members: () => fetch("/api/members").then((r) => j<MembersResponse>(r)),
  logout: () => fetch("/api/logout", { method: "POST" }).then((r) => j<{ ok: boolean }>(r)),
  demoStatus: () => demoStatus(),
};

export function formatNear(yocto: string): string {
  const n = BigInt(yocto);
  const whole = n / 10n ** 24n;
  const frac = ((n % 10n ** 24n) / 10n ** 20n).toString().padStart(4, "0");
  return `${whole}.${frac} NEAR`;
}

export function formatNs(ns: string): string {
  return new Date(Number(BigInt(ns) / 1_000_000n)).toISOString().slice(0, 10);
}

export interface AgentProposal {
  agent: string;
  account: string;
  recipient: string;
  asset: "NEAR";
  amountNear: string;
  reason: string;
  kind: "scripted";
}

export interface AgentInfo {
  ok: boolean;
  agent: string;
  kind: string;
  approvedRecipient: string;
  status: {
    extension_enabled: boolean;
    grant: { receivers: string[]; budget_yocto: string; spent_yocto: string; expires_at: string } | null;
    reserve_yocto: string;
  };
  tasks: { id: string; label: string; proposal: AgentProposal }[];
  reason?: string;
}

export interface AgentAttempt {
  proposal: AgentProposal;
  tx: { hash: string; ok: boolean; failure?: string };
  verdict: string;
}

export const agentApi = {
  info: () => fetch("/api/agent").then((r) => j<AgentInfo>(r)),
  attempt: (task: string) =>
    fetch("/api/agent/attempt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task }) }).then((r) =>
      j<AgentAttempt>(r),
    ),
};

/* ---------- live testnet run (server-signed demo accounts) ---------- */

export interface DemoStatus {
  ownership: boolean;
  agent: boolean;
  missing: string[];
  running: string | null;
  name: string;
  people: [string, string];
  agentAccount: string | null;
  approved: string;
  network: string;
}

export interface DemoEvent {
  step: string;
  status: "running" | "ok" | "refused" | "error";
  title: string;
  detail?: string;
  tx?: string;
  data?: Record<string, unknown>;
  at: string;
}

export async function demoStatus(): Promise<DemoStatus> {
  return j<DemoStatus>(await fetch("/api/demo/status"));
}

/** Starts a live run and calls onEvent for each step as the server streams it. */
export async function runDemo(kind: "ownership" | "agent", onEvent: (e: DemoEvent) => void): Promise<void> {
  const res = await fetch(`/api/demo/${kind}`, { method: "POST" });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)));
    }
  }
}
