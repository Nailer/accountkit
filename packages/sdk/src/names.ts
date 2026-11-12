import { AccountKitError } from "./errors.js";

/** NEAR's account id rule (the same pattern the hackathon API and nearcore use). */
const ACCOUNT_ID_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function isValidAccountId(id: string): boolean {
  return id.length >= 2 && id.length <= 64 && ACCOUNT_ID_RE.test(id);
}

/** Splits `alice.club.testnet` into the label `alice` and the TLA `club.testnet`. */
export function parseTlaName(name: string): { label: string; tlaId: string } {
  const trimmed = name.trim().toLowerCase();
  const dot = trimmed.indexOf(".");
  if (!isValidAccountId(trimmed) || dot <= 0 || dot === trimmed.length - 1) {
    throw new AccountKitError("INVALID_NAME", `"${name}" is not a leased name of the form label.tla`);
  }
  return { label: trimmed.slice(0, dot), tlaId: trimmed.slice(dot + 1) };
}
