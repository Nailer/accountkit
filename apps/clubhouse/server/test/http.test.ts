import { describe, expect, it } from "vitest";
import { HttpError, originAllowed, rateLimiter, readJsonBody } from "../http.js";

describe("originAllowed", () => {
  it("allows requests without an Origin (scripts, curl)", () => {
    expect(originAllowed(undefined)).toBe(true);
  });

  it.each(["http://localhost:5173", "http://127.0.0.1:8787", "http://[::1]:5173", "https://localhost"])("allows %s", (o) => {
    expect(originAllowed(o)).toBe(true);
  });

  it.each(["https://evil.example", "http://localhost.evil.example", "http://127.0.0.1.nip.io", "null", "not a url"])("refuses %s", (o) => {
    expect(originAllowed(o)).toBe(false);
  });

  it("allows an origin listed in ALLOWED_ORIGINS", () => {
    expect(originAllowed("https://clubhouse.example", new Set(["https://clubhouse.example"]))).toBe(true);
  });
});

describe("readJsonBody", () => {
  const body = async function* (...parts: string[]) {
    for (const p of parts) yield Buffer.from(p);
  };

  it("parses a JSON object sent in pieces", async () => {
    expect(await readJsonBody(body('{"tla":"a.b', '.testnet"}'))).toEqual({ tla: "a.b.testnet" });
  });

  it("treats an empty body as an empty object", async () => {
    expect(await readJsonBody(body())).toEqual({});
  });

  it.each(["{not json", "[1,2]", "null", "42"])("refuses %s with a 400", async (raw) => {
    const err = await readJsonBody(body(raw)).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(400);
  });

  it("refuses an oversized body with a 413", async () => {
    const err = await readJsonBody(body("x".repeat(20)), 10).catch((e) => e);
    expect(err.status).toBe(413);
  });
});

describe("rateLimiter", () => {
  it("allows up to the limit per window, per key", () => {
    const allow = rateLimiter(2, 1000);
    expect([allow("a", 0), allow("a", 10), allow("a", 20)]).toEqual([true, true, false]);
    expect(allow("b", 20)).toBe(true);
  });

  it("starts a new window after windowMs", () => {
    const allow = rateLimiter(1, 1000);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 999)).toBe(false);
    expect(allow("a", 1000)).toBe(true);
  });
});
