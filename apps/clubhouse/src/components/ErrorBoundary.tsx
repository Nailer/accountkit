import { Component, useEffect, useState, type ReactNode } from "react";
import { ErrorAlert, Spinner } from "./primitives";

/**
 * Keeps one failing part (for example a wallet module that fails to load) from
 * blanking the whole page. Shows the error with a retry button instead.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const retry = () => {
      // A failed lazy import is cached by the browser module loader; a reload fetches it again.
      if (/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(this.state.error?.message ?? "")) window.location.reload();
      else this.setState({ error: null });
    };
    return (
      <div className="container" style={{ paddingBlock: "2rem" }}>
        <ErrorAlert raw={`This part of the page failed to load: ${this.state.error.message}`} onRetry={retry} />
      </div>
    );
  }
}

/** A loading line that offers a reload if loading takes longer than expected. */
export function SlowLoading({ label, afterMs = 10_000 }: { label: string; afterMs?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(t);
  }, [afterMs]);
  return (
    <output className="progress-note">
      <Spinner /> {label}
      {slow && (
        <>
          {" "}Still loading.{" "}
          <button type="button" className="text-link" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </>
      )}
    </output>
  );
}
