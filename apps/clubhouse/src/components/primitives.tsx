import { useRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { AlertIcon, CheckIcon } from "../icons";
import { explainError } from "../lib/errors";
import { Link } from "../lib/router";

export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role={label ? "status" : undefined} aria-label={label} />;
}

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

/** Pointer position drives a soft highlight on primary buttons (cursor feedback). */
function trackPointer(e: MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  trailing,
  block,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode; trailing?: ReactNode; block?: boolean }) {
  return (
    <button
      className={`btn btn-${variant} ${size !== "md" ? `btn-${size}` : ""} ${block ? "btn-block" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onMouseMove={trackPointer}
      {...rest}
    >
      <span className="shine" aria-hidden="true" />
      {loading ? <Spinner /> : icon}
      <span>{children}</span>
      {!loading && trailing}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = "primary",
  size = "md",
  icon,
  trailing,
  children,
  className = "",
}: { to: string; variant?: Variant; size?: Size; icon?: ReactNode; trailing?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`btn btn-${variant} ${size !== "md" ? `btn-${size}` : ""} ${className}`} onMouseMove={trackPointer}>
      <span className="shine" aria-hidden="true" />
      {icon}
      <span>{children}</span>
      {trailing}
    </Link>
  );
}

/** Magnetic wrapper: the child drifts a few pixels toward the cursor. Disabled for reduced motion. */
export function Magnetic({ children, strength = 0.18 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <span
      ref={ref}
      style={{ display: "inline-flex", transition: "transform 0.4s cubic-bezier(0.22,1,0.36,1)" }}
      onMouseMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * strength;
        const y = (e.clientY - (r.top + r.height / 2)) * strength;
        ref.current.style.transform = `translate(${x}px, ${y}px)`;
      }}
      onMouseLeave={() => {
        if (ref.current) ref.current.style.transform = "translate(0,0)";
      }}
    >
      {children}
    </span>
  );
}

export function NetworkBadge({ network }: { network: string }) {
  const label = network === "mainnet" ? "NEAR mainnet · read-only" : network === "testnet" ? "NEAR testnet" : network;
  return (
    <span className="net-badge" title={network === "testnet" ? "Everything here runs on NEAR testnet. Test tokens have no value." : undefined}>
      <span className="pulse" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Pill({ tone, children }: { tone?: "ok" | "bad" | "warn"; children: ReactNode }) {
  return (
    <span className={`pill ${tone ? `pill-${tone}` : ""}`}>
      <span className="dot" aria-hidden="true" />
      {children}
    </span>
  );
}

type Tone = "info" | "error" | "success" | "warning";

export function Alert({ tone = "info", title, children, actions }: { tone?: Tone; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" || tone === "warning" ? "alert" : "status"}>
      <span className="alert-icon">{tone === "success" ? <CheckIcon /> : <AlertIcon />}</span>
      <div>
        <div className="alert-title">{title}</div>
        {children && <div className="alert-text">{children}</div>}
        {actions && <div className="alert-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function ErrorAlert({ raw, onRetry, onDismiss }: { raw: string; onRetry?: () => void; onDismiss?: () => void }) {
  const e = explainError(raw);
  return (
    <Alert
      tone="error"
      title={e.title}
      actions={
        onRetry || onDismiss ? (
          <>
            {onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            )}
            {onDismiss && (
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                Dismiss
              </Button>
            )}
          </>
        ) : undefined
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
