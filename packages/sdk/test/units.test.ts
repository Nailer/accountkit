import { describe, expect, it } from "vitest";
import { formatNear, parseNear } from "../src/units.js";

describe("parseNear", () => {
  it.each([
    ["1", 10n ** 24n],
    ["0.5", 5n * 10n ** 23n],
    ["0.000000000000000000000001", 1n],
    ["12.25", 1225n * 10n ** 22n],
    [" 3 ", 3n * 10n ** 24n],
  ])("parses %s", (input, expected) => {
    expect(parseNear(input)).toBe(expected);
  });

  it.each(["", "-1", "1e3", "0.0000000000000000000000001", "1.", ".5", "abc", "1,5"])("refuses %j", (input) => {
    expect(() => parseNear(input)).toThrow(/not a NEAR amount/);
  });
});

describe("formatNear", () => {
  it("drops trailing zeros", () => {
    expect(formatNear(5n * 10n ** 23n)).toBe("0.5");
    expect(formatNear(10n ** 24n)).toBe("1");
  });

  it("rounds down, never up", () => {
    expect(formatNear(1999999n * 10n ** 18n, 2)).toBe("1.99");
  });

  it("accepts strings and keeps tiny amounts visible with more decimals", () => {
    expect(formatNear("10000000000000000000000", 4)).toBe("0.01");
    expect(formatNear("1", 24)).toBe("0.000000000000000000000001");
    expect(formatNear("1")).toBe("0");
  });

  it("round-trips with parseNear", () => {
    for (const s of ["0.2", "1.591", "10", "0.0001"]) expect(formatNear(parseNear(s), 24)).toBe(s);
  });
});
