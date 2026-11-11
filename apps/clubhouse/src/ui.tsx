import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertIcon, CheckIcon } from "./icons";

export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role={label ? "status" : undefined} aria-label={label} />;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: ReactNode }) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      <span>{children}</span>
    </button>
  );
}

type Tone = "info" | "error" | "success" | "warning";

export function Alert({ tone = "info", title, children, action }: { tone?: Tone; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" || tone === "warning" ? "alert" : "status"}>
      <span className="alert-icon">{tone === "success" ? <CheckIcon /> : <AlertIcon />}</span>
      <div className="alert-body">
        <div className="alert-title">{title}</div>
        {children && <div className="alert-text">{children}</div>}
        {action && <div className="alert-action">{action}</div>}
      </div>
    </div>
  );
}

export function StatusPill({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return (
    <span className={`pill ${ok === null ? "pill-neutral" : ok ? "pill-ok" : "pill-bad"}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

/**
 * Turns SDK / wallet / API errors into plain language. The raw message is
 * kept and shown on demand, so nothing is hidden from a developer.
 */
export function explainError(raw: string): { title: string; text: string } {
  const m = raw.toLowerCase();
  if (m.includes("user rejected") || m.includes("user cancel") || m.includes("closed") || m.includes("rejected"))
    return { title: "Request cancelled in your wallet", text: "Nothing was signed or sent. You can try again." };
  if (m.includes("api unreachable") || m.includes("failed to fetch"))
    return { title: "Clubhouse server is not reachable", text: "Start the API (pnpm --filter clubhouse dev) and reload this page." };
  if (m.includes("no rpc endpoint answered") || m.includes("rpc_unavailable"))
    return { title: "NEAR testnet RPC did not answer", text: "The network endpoint may be busy. Wait a moment and retry." };
  if (m.includes("is not a leased name") || m.includes("not a valid near account"))
    return { title: "That isn't a valid name", text: "Enter a full account name such as alice-member.akclub.testnet (label, then the club's name)." };
  if (m.includes("does not exist on"))
    return { title: "No account with that name", text: "No NEAR account with this exact name exists on this network. Check the spelling and the network." };
  if (m.includes("does not run a house of stake registrar") || m.includes("does not answer the house of stake wallet views"))
    return { title: "Not a House of Stake leased name", text: "The account exists, but it is not a Top Level Account issued by a House of Stake registrar." };
  if (m.includes("is not the owner") || m.includes("not an owner"))
    return { title: "This wallet doesn't own that membership", text: "Only the current owner of the membership account can sign in or transfer it." };
  if (m.includes("is taken"))
    return { title: "That name is already rented", text: "Pick a different name." };
  if (m.includes("challenge expired"))
    return { title: "Sign-in request expired", text: "The one-time sign-in request is valid for five minutes. Start again." };
  if (m.includes("not active"))
    return { title: "Membership is not active", text: "The lease has expired, or the account is frozen or parked." };
  return { title: "Something went wrong", text: "Try again. If it keeps happening, the details below say what the network or wallet reported." };
}

export function ErrorAlert({ raw, onRetry, onDismiss }: { raw: string; onRetry?: () => void; onDismiss?: () => void }) {
  const e = explainError(raw);
  return (
    <Alert
      tone="error"
      title={e.title}
      action={
        <>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
          {onDismiss && (
            <Button variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </>
      }
    >
      <p>{e.text}</p>
      <details className="raw">
        <summary>Technical details</summary>
        <code>{raw}</code>
      </details>
    </Alert>
  );
}
