import type { HistoryEvent, TlaHistory } from "@accountkit/sdk";
import { useState } from "react";
import { api, formatNear } from "../api";
import { ExternalIcon } from "../icons";
import { explorerTx } from "../lib/explorer";

const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

function line(e: HistoryEvent): { label: string; detail: string; tone: "own" | "out" | "in" | "bad" | "muted" } {
  switch (e.kind) {
    case "created":
      return { label: "Created", detail: `rented through ${e.by}`, tone: "own" };
    case "ownership":
      return { label: "Changed hands", detail: e.to ? `${e.from ?? "previous owner"} → ${e.to}` : "new owner recorded on chain", tone: "own" };
    case "sweep":
      return { label: "Spare NEAR returned to the seller", detail: `${formatNear(e.amountYocto)} to ${e.to}`, tone: "muted" };
    case "payout":
      return { label: "Paid out", detail: `${formatNear(e.amountYocto)} to ${e.to}`, tone: "out" };
    case "received":
      return { label: "Received", detail: `${formatNear(e.amountYocto)} from ${e.from}`, tone: "in" };
    case "call":
      return e.ok ? { label: "Instruction carried out", detail: `asked by ${e.by}`, tone: "muted" } : { label: "Instruction refused by the wallet", detail: `asked by ${e.by}`, tone: "bad" };
  }
}

/**
 * The membership's history, read on demand: who held it, what it paid out and
 * what it received. Built by AccountKit's `kit.history()` from public receipts.
 */
export function History({ name, network }: { name: string; network: string }) {
  const [h, setH] = useState<TlaHistory | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const load = async () => {
    if (h || state === "loading") return;
    setState("loading");
    try {
      setH(await api.history(name));
      setState("idle");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  // Sales of an account with nothing spare still sweep a few yoctoNEAR: not worth a line.
  const shown = (h?.events ?? []).filter((e) => !(e.kind === "sweep" && BigInt(e.amountYocto) < 100_000_000_000_000_000_000n));

  return (
    <details className="checks history" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
      <summary>
        <span>History: who held it, what it paid out, what it received</span>
        {h && <span className="muted tnum">{h.events.length} events</span>}
      </summary>
      {state === "loading" && <p className="muted small" aria-live="polite">Reading this account's receipts…</p>}
      {state === "error" && (
        <p className="small history-error" role="alert">
          Couldn't read the history: {error}{" "}
          <button type="button" className="inline-example" onClick={() => { setState("idle"); load(); }}>Try again</button>
        </p>
      )}
      {h && (
        <>
          <dl className="history-totals">
            <div><dt>Changed hands</dt><dd className="tnum">{h.totals.ownershipChanges}×</dd></div>
            <div><dt>Paid out</dt><dd className="tnum">{formatNear(h.totals.paidOutYocto)}</dd></div>
            <div><dt>Received</dt><dd className="tnum">{formatNear(h.totals.receivedYocto)}</dd></div>
            <div><dt>Returned to sellers</dt><dd className="tnum">{formatNear(h.totals.sweptYocto)}</dd></div>
            <div><dt>Refused instructions</dt><dd className="tnum">{h.totals.refusedCalls}</dd></div>
          </dl>
          {h.holders.length > 0 && (
            <p className="small history-holders">
              <b>Held by</b>{" "}
              {h.holders.slice(0, 6).map((x, i) => (
                <span key={x.txHash}>
                  {i > 0 && " ← "}
                  <span className="mono">{x.owner}</span>
                </span>
              ))}
              {h.holders.length > 6 && ` ← ${h.holders.length - 6} earlier`}
            </p>
          )}
          {h.events.length === 0 ? (
            <p className="muted small">No transfers, payments or instructions yet.</p>
          ) : (
            <ol className="history-list">
              {shown.slice(0, 40).map((e) => {
                const l = line(e);
                return (
                  <li key={e.receiptId} className={`tone-${l.tone}`}>
                    <span className="history-when tnum">{when(e.at)}</span>
                    <span>
                      <b>{l.label}</b> <span className="mono">{l.detail}</span>
                    </span>
                    <a className="text-link" href={explorerTx(network, e.txHash)} target="_blank" rel="noreferrer" aria-label={`Transaction ${e.txHash}`}>
                      <ExternalIcon />
                    </a>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="muted small">
            Times are UTC. {h.complete ? "This is the account's full history." : `Showing the latest ${h.events.length} events; older ones exist.`} Source: public receipts via{" "}
            {new URL(h.source).host}, read by <code>kit.history()</code>.
          </p>
        </>
      )}
    </details>
  );
}
