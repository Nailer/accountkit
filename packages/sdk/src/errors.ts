/** Every failure AccountKit raises carries one of these codes, so apps can branch on it. */
export type AccountKitErrorCode =
  | "INVALID_NAME" // the string is not a valid NEAR account id of the form label.tla
  | "NOT_FOUND" // the account, registrar or NFT record does not exist
  | "NOT_A_TLA" // the account exists but is not a House of Stake leased name
  | "LEASE_EXPIRED" // the lease ran out, or the account is parked / frozen
  | "WRONG_OWNER" // the caller is not the current owner
  | "RPC_UNAVAILABLE" // no RPC endpoint answered
  | "CONTRACT_PANIC" // a view or call reached the contract and the contract refused it
  | "AUTH_INVALID" // an NEP-641 authorization did not resolve
  | "INVALID_INPUT"; // an argument would be refused on chain (caught before anything is signed)

export class AccountKitError extends Error {
  readonly code: AccountKitErrorCode;
  readonly details?: unknown;

  constructor(code: AccountKitErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AccountKitError";
    this.code = code;
    this.details = details;
  }
}

export function isAccountKitError(e: unknown, code?: AccountKitErrorCode): e is AccountKitError {
  return e instanceof AccountKitError && (code === undefined || e.code === code);
}
