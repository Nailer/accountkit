import { describe, expect, it } from "vitest";
import { originAllowed } from "../http.js";

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
