/**
 * Clubhouse API. A deliberately small Node server (no framework):
 *  - issues one-time sign-in challenges,
 *  - verifies NEP-641 sign-ins with @accountkit/sdk,
 *  - re-checks on-chain ownership on EVERY members-only request, so the
 *    moment a membership NFT is transferred the old owner is locked out.
 *
 * Config (env):
 *   NETWORK     mainnet | testnet | sandbox   (default testnet)
 *   RPC_URLS    comma-separated RPC endpoints (optional)
 *   CHAIN_ID    chain id inside NEP-641 messages (default = network; sandbox = testnet)
 *   CLUB_TLA    only names under this TLA count as memberships (optional)
 *   PORT        default 8787
 *   HOST        interface to listen on (default 127.0.0.1: this machine only)
 *   ALLOWED_ORIGINS  extra browser origins allowed to POST, comma-separated
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  AccountKit,
  AccountKitError,
  createSignInRequest,
  verifyItem,
  verifySignIn,
  type TlaInfo,
} from "@accountkit/sdk";
import { DEMO_TASKS, attempt, propose, type TaskId } from "./agent.js";
import { demoAvailability, runAgent, runOwnership, type DemoConfig, type DemoEvent } from "./demo.js";

// Load apps/clubhouse/.env when present (Node 20.12+). Real env vars win.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* no .env file: use the environment as is */
}

const NETWORK = process.env.NETWORK ?? "testnet";
const kit = new AccountKit({
  network: NETWORK,
  rpcUrls: process.env.RPC_URLS ? process.env.RPC_URLS.split(",").map((s) => s.trim()) : undefined,
  chainId: process.env.CHAIN_ID,
  registry: process.env.REGISTRY,
});
const CLUB_TLA = process.env.CLUB_TLA?.trim().toLowerCase() || null;
// Agent demo: a test account whose key is in the local NEAR CLI keychain.
const AGENT = process.env.AGENT_ACCOUNT?.trim() || null;
const AGENT_APPROVED = process.env.AGENT_APPROVED?.trim() || "ak-shop.testnet";
const AGENT_STRANGER = process.env.AGENT_STRANGER?.trim() || "akclub.testnet";
const PORT = Number(process.env.PORT ?? 8787);
// Listen on this machine only unless HOST says otherwise: the live run signs testnet transactions.
const HOST = process.env.HOST?.trim() || "127.0.0.1";
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
// Live testnet run (server-signed test accounts). Available only where their keys exist.
const DEMO: DemoConfig = {
  network: NETWORK,
  rpcUrl: process.env.RPC_URLS?.split(",")[0]?.trim() || "https://rpc.testnet.fastnear.com",
  name: process.env.DEMO_NAME?.trim() || "alice-member.akclub.testnet",
  people: [process.env.DEMO_A?.trim() || "ak-alice.testnet", process.env.DEMO_B?.trim() || "ak-bob.testnet"],
  agent: AGENT,
  approved: AGENT_APPROVED,
  stranger: AGENT_STRANGER,
};
let demoRunning: string | null = null;
const SECRET = randomBytes(32);
const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 60 * 60_000;

/* ---------- one-time challenges ---------- */

interface Challenge {
  tla: string;
  owner: string;
  payload: string;
  expiresAt: number;
}
const challenges = new Map<string, Challenge>();

function sweep() {
  const now = Date.now();
  for (const [id, c] of challenges) if (c.expiresAt < now) challenges.delete(id);
}

/* ---------- sessions: HMAC-signed cookie ---------- */

interface Session {
  tla: string;
  owner: string;
  exp: number;
}

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

function encodeSession(s: Session): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function readSession(req: IncomingMessage): Session | null {
  const raw = /(?:^|;\s*)ck_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
  return s.exp > Date.now() ? s : null;
}

/* ---------- helpers ---------- */

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

/**
 * Blocks cross-site POSTs: a web page on another site must not be able to make this
 * server sign or log anyone in. Requests with no Origin (scripts, curl) are allowed.
 */
function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function inClub(name: string): boolean {
  return CLUB_TLA === null || name.endsWith(`.${CLUB_TLA}`);
}

function summary(info: TlaInfo) {
  const v = verifyItem(info);
  return {
    name: info.name,
    tla: info.tlaId,
    owner: v.owner,
    verified: v.ok,
    active: v.active,
    checks: v.checks,
    balanceYocto: info.account.balanceYocto,
    leaseUntilNs: info.lease.lease_until_ns,
    payoutAccount: info.lease.payout_account,
    registry: info.registry,
    extensions: info.extensions,
    block: info.block,
  };
}

/**
 * The gate. Runs on every members-only request: the session only says who
 * signed in; whether they are STILL the owner is read from chain each time.
 */
async function currentMember(req: IncomingMessage): Promise<{ ok: true; session: Session; info: TlaInfo } | { ok: false; status: number; reason: string; session?: Session; owner?: string | null }> {
  const session = readSession(req);
  if (!session) return { ok: false, status: 401, reason: "not signed in" };
  const info = await kit.resolve(session.tla);
  const v = verifyItem(info);
  if (!v.ok) return { ok: false, status: 403, reason: `${session.tla} no longer verifies`, session, owner: null };
  if (!v.active) return { ok: false, status: 403, reason: `${session.tla} is not active`, session, owner: v.owner };
  if (v.owner !== session.owner) {
    return { ok: false, status: 403, reason: `${session.tla} now belongs to ${v.owner}. ${session.owner} is no longer a member.`, session, owner: v.owner };
  }
  return { ok: true, session, info };
}

/* ---------- routes ---------- */

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (req.method === "POST" && !originAllowed(req)) {
    return send(res, 403, { error: "cross-site request refused", code: "FORBIDDEN_ORIGIN" });
  }

  if (req.method === "GET" && path === "/api/config") {
    return send(res, 200, { network: kit.network, chainId: kit.chainId, club: CLUB_TLA, agent: AGENT });
  }

  // Public lookup: resolve + verify any leased name.
  if (req.method === "GET" && path === "/api/tla") {
    const name = url.searchParams.get("name") ?? "";
    return send(res, 200, summary(await kit.resolve(name)));
  }

  // Which club memberships does this account hold?
  if (req.method === "GET" && path === "/api/names") {
    const owner = url.searchParams.get("owner")?.trim() ?? "";
    if (!owner) return send(res, 400, { error: "owner is required, e.g. /api/names?owner=alice.testnet", code: "INVALID_NAME" });
    const registry = url.searchParams.get("registry") ?? undefined;
    let names: string[] = [];
    if (registry || CLUB_TLA || kit.network === "mainnet") {
      const reg = registry ?? (CLUB_TLA ? (await kit.registrarConfig(CLUB_TLA)).registry : undefined);
      names = (await kit.namesOwnedBy(owner, reg)).filter(inClub);
    }
    return send(res, 200, { owner, names });
  }

  if (req.method === "POST" && path === "/api/challenge") {
    const { tla, owner } = await readJson(req);
    if (typeof tla !== "string" || typeof owner !== "string") return send(res, 400, { error: "tla and owner are required" });
    if (!inClub(tla.toLowerCase())) return send(res, 403, { error: `${tla} is not a ${CLUB_TLA} membership` });
    sweep();
    const id = randomBytes(16).toString("hex");
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    const request = createSignInRequest({
      tla: tla.toLowerCase(),
      owner,
      chainId: kit.chainId,
      payload: {
        domain: "Clubhouse",
        action: "Login",
        msg: JSON.stringify({ tla: tla.toLowerCase(), challenge: id, expires: new Date(expiresAt).toISOString() }),
      },
    });
    challenges.set(id, { tla: request.tla, owner, payload: request.payload, expiresAt });
    return send(res, 200, {
      id,
      offchainMessage: request.offchainMessage,
      nep413: {
        message: request.nep413.message,
        recipient: request.nep413.recipient,
        nonce: Buffer.from(request.nep413.nonce).toString("base64"),
      },
    });
  }

  if (req.method === "POST" && path === "/api/login") {
    const { id, authorization } = await readJson(req);
    const ch = typeof id === "string" ? challenges.get(id) : undefined;
    if (!ch || ch.expiresAt < Date.now()) return send(res, 400, { ok: false, reason: "challenge expired or unknown; start again" });
    challenges.delete(id); // one use only
    const result = await verifySignIn(kit, { tla: ch.tla, authorization: String(authorization), expectedPayload: ch.payload });
    if (!result.ok) return send(res, 403, result);
    const cookie = encodeSession({ tla: ch.tla, owner: result.owner!, exp: Date.now() + SESSION_TTL_MS });
    return send(res, 200, result, {
      "set-cookie": `ck_session=${cookie}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
    });
  }

  if (req.method === "POST" && path === "/api/logout") {
    return send(res, 200, { ok: true }, { "set-cookie": "ck_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  // The members-only page's data.
  if (req.method === "GET" && path === "/api/members") {
    const m = await currentMember(req);
    if (!m.ok) return send(res, m.status, { ok: false, reason: m.reason, signedInAs: m.session?.owner ?? null, tla: m.session?.tla ?? null, currentOwner: m.owner ?? null });
    return send(res, 200, {
      ok: true,
      member: m.session.owner,
      membership: summary(m.info),
      checkedAt: new Date().toISOString(),
      notes: [
        "You are reading this because the chain says you own this membership right now.",
        "This check runs on every request. Transfer the NFT and the next request is refused.",
      ],
    });
  }

  /* ---------- live testnet run (server-signed demo accounts) ---------- */

  if (req.method === "GET" && path === "/api/demo/status") {
    const a = NETWORK === "mainnet" ? { ownership: false, agent: false, missing: [] } : demoAvailability(DEMO);
    return send(res, 200, { ...a, running: demoRunning, name: DEMO.name, people: DEMO.people, agentAccount: DEMO.agent, approved: DEMO.approved, network: NETWORK });
  }

  if (req.method === "POST" && (path === "/api/demo/ownership" || path === "/api/demo/agent")) {
    if (NETWORK === "mainnet") return send(res, 403, { error: "the live run is testnet-only" });
    const a = demoAvailability(DEMO);
    const which = path.endsWith("agent") ? "agent" : "ownership";
    if (!(which === "agent" ? a.agent : a.ownership)) return send(res, 503, { error: "the demo accounts' testnet keys are not on this server", missing: a.missing });
    if (demoRunning) return send(res, 409, { error: `a ${demoRunning} run is already in progress; wait for it to finish` });
    demoRunning = which;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    const emit = (e: DemoEvent) => res.write(`data: ${JSON.stringify({ ...e, at: new Date().toISOString() })}\n\n`);
    try {
      await (which === "agent" ? runAgent(kit, DEMO, emit) : runOwnership(kit, DEMO, emit));
    } catch (e) {
      emit({ step: "error", status: "error", title: "The run stopped", detail: (e as Error).message });
    } finally {
      demoRunning = null;
      res.end();
    }
    return;
  }

  /* ---------- agent demo (stretch). Only for the signed-in current owner. ---------- */

  if (path === "/api/agent" || path === "/api/agent/attempt") {
    if (!AGENT) return send(res, 404, { error: "agent demo is disabled (set AGENT_ACCOUNT and its testnet key)" });
    const m = await currentMember(req);
    if (!m.ok) return send(res, m.status, { ok: false, reason: m.reason });
    const ctx = { agent: AGENT, account: m.session.tla, approved: AGENT_APPROVED, stranger: AGENT_STRANGER };

    if (req.method === "GET" && path === "/api/agent") {
      const status = await kit.agentStatus(m.session.tla, AGENT);
      return send(res, 200, {
        ok: true,
        agent: AGENT,
        kind: "scripted demo agent (deterministic, no AI model)",
        approvedRecipient: AGENT_APPROVED,
        status,
        tasks: DEMO_TASKS.map((t) => ({ id: t.id, label: t.label, proposal: propose(t.id, ctx) })),
      });
    }
    if (req.method === "POST" && path === "/api/agent/attempt") {
      const { task } = await readJson(req);
      if (!DEMO_TASKS.some((t) => t.id === task)) return send(res, 400, { error: "unknown task" });
      return send(res, 200, await attempt(kit.network, kit.rpc.urls[0]!, propose(task as TaskId, ctx)));
    }
  }

  return send(res, 404, { error: "not found" });
}

createServer((req, res) => {
  route(req, res).catch((e) => {
    if (e instanceof AccountKitError) {
      const status =
        e.code === "RPC_UNAVAILABLE" ? 502 : e.code === "INVALID_NAME" || e.code === "INVALID_INPUT" ? 400 : e.code === "WRONG_OWNER" ? 403 : 404;
      return send(res, status, { error: e.message, code: e.code });
    }
    console.error(e);
    send(res, 500, { error: "internal error" });
  });
}).listen(PORT, HOST, () => {
  console.log(`Clubhouse API on http://${HOST}:${PORT}  network=${kit.network} chainId=${kit.chainId} club=${CLUB_TLA ?? "(any HoS name)"}`);
});
