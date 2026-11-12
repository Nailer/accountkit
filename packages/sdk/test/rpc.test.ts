import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountKitError } from "../src/errors.js";
import { NearRpc } from "../src/rpc.js";

type Reply = { status?: number; body?: unknown; throws?: string };

/** Replaces fetch with a queue of canned replies and records which URLs were hit. */
function mockFetch(replies: Reply[]) {
  const hits: string[] = [];
  const fn = vi.fn(async (url: string) => {
    hits.push(url);
    const r = replies.shift();
    if (!r) throw new Error("no more canned replies");
    if (r.throws) throw new Error(r.throws);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  });
  vi.stubGlobal("fetch", fn);
  return hits;
}

const ok = (result: unknown): Reply => ({ body: { jsonrpc: "2.0", id: "accountkit", result } });
const rpcError = (name: string, info: unknown = {}): Reply => ({ body: { jsonrpc: "2.0", id: "accountkit", error: { cause: { name, info } } } });
const bytes = (v: unknown) => Array.from(new TextEncoder().encode(JSON.stringify(v)));

afterEach(() => vi.unstubAllGlobals());

describe("NearRpc", () => {
  it("falls back to the next endpoint on a 5xx or 429", async () => {
    const hits = mockFetch([{ status: 503 }, { status: 429 }, ok({ header: { hash: "h", height: 7, timestamp_nanosec: "5" } })]);
    const rpc = new NearRpc(["https://a", "https://b", "https://c"]);
    const b = await rpc.block();
    expect(b).toEqual({ hash: "h", height: 7, timestampNs: 5n });
    expect(hits).toEqual(["https://a", "https://b", "https://c"]);
  });

  it("falls back on a network error", async () => {
    const hits = mockFetch([{ throws: "ECONNRESET" }, ok({ header: { hash: "h", height: 1, timestamp: "1" } })]);
    await new NearRpc(["https://a", "https://b"]).block();
    expect(hits).toEqual(["https://a", "https://b"]);
  });

  it("reports RPC_UNAVAILABLE with every failure when no endpoint answers", async () => {
    mockFetch([{ status: 502 }, { throws: "timeout" }]);
    const err = await new NearRpc(["https://a", "https://b"]).block().catch((e) => e);
    expect(err).toBeInstanceOf(AccountKitError);
    expect(err.code).toBe("RPC_UNAVAILABLE");
    expect(err.message).toContain("https://a: HTTP 502");
    expect(err.message).toContain("https://b: timeout");
  });

  it("maps an unknown account to NOT_FOUND without trying other endpoints", async () => {
    const hits = mockFetch([rpcError("UNKNOWN_ACCOUNT", { requested_account_id: "nobody.testnet" })]);
    const err = await new NearRpc(["https://a", "https://b"]).viewAccount("nobody.testnet").catch((e) => e);
    expect(err.code).toBe("NOT_FOUND");
    expect(hits).toHaveLength(1);
  });

  it("retries a stale block on the next endpoint", async () => {
    const hits = mockFetch([rpcError("UNKNOWN_BLOCK"), ok({ result: bytes({ ok: true }), logs: [] })]);
    const r = await new NearRpc(["https://a", "https://b"]).view("c.testnet", "m", {}, { blockId: "x" });
    expect(r).toEqual({ ok: true });
    expect(hits).toHaveLength(2);
  });

  it("decodes a view call's JSON result", async () => {
    mockFetch([ok({ result: bytes(["alice.testnet", "ext.testnet"]), logs: [] })]);
    expect(await new NearRpc(["https://a"]).view("x.testnet", "w_extensions")).toEqual(["alice.testnet", "ext.testnet"]);
  });

  it("turns a contract panic into CONTRACT_PANIC with the panic message", async () => {
    mockFetch([ok({ error: 'wasm execution failed with error: FunctionCallError(ExecutionError("Smart contract panicked: named account is not an owner"))', logs: [] })]);
    const err = await new NearRpc(["https://a"]).view("x.testnet", "w_resolve_auth").catch((e) => e);
    expect(err.code).toBe("CONTRACT_PANIC");
    expect(err.message).toContain("x.testnet.w_resolve_auth");
  });

  it("treats a missing method as NOT_FOUND", async () => {
    mockFetch([ok({ error: "wasm execution failed with error: MethodResolveError(MethodNotFound)", logs: [] })]);
    const err = await new NearRpc(["https://a"]).view("wrap.testnet", "hos_lease").catch((e) => e);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("refuses to start without an endpoint", () => {
    expect(() => new NearRpc([])).toThrow(/no RPC url/);
  });
});
