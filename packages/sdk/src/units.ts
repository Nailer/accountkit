import { AccountKitError } from "./errors.js";

/** 1 NEAR = 10^24 yoctoNEAR. */
export const YOCTO_PER_NEAR = 10n ** 24n;

/**
 * "0.5" -> 500000000000000000000000n. Accepts up to 24 decimals, no sign,
 * no exponent: amounts that will be signed should never be guessed.
 */
export function parseNear(amount: string | number): bigint {
  const s = String(amount).trim();
  if (!/^\d+(\.\d{1,24})?$/.test(s)) {
    throw new AccountKitError("INVALID_INPUT", `"${amount}" is not a NEAR amount (use digits, with up to 24 decimals)`);
  }
  const [whole = "0", frac = ""] = s.split(".");
  return BigInt(whole) * YOCTO_PER_NEAR + BigInt(frac.padEnd(24, "0"));
}

/**
 * 500000000000000000000000n -> "0.5". Rounds down to `decimals` places and
 * drops trailing zeros, so a balance is never shown as more than it is.
 */
export function formatNear(yocto: string | bigint, decimals = 4): string {
  const n = BigInt(yocto);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / YOCTO_PER_NEAR;
  const frac = (abs % YOCTO_PER_NEAR).toString().padStart(24, "0").slice(0, Math.max(0, Math.min(24, decimals))).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
