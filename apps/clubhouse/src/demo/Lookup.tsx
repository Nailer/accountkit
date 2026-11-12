import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { api, type Membership } from "../api";
import { Button, ErrorAlert } from "../components/primitives";
import { SearchIcon } from "../icons";
import { MembershipDetail } from "./MembershipDetail";

const EXAMPLES = ["alice-member.akclub.testnet", "shop-membership-01.akclub.testnet"];
/** A real account that is not a House of Stake name: shows what a refusal looks like. */
const REFUSED_EXAMPLE = { testnet: "wrap.testnet", mainnet: "wrap.near" } as Record<string, string>;

export function Lookup({ network }: { network: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Membership | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim().toLowerCase();
  const shapeError = touched && trimmed && !/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/.test(trimmed) ? "Use the full name: a label, a dot, then the club's account, with no spaces." : null;

  const check = async (n = trimmed) => {
    if (!n || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.lookup(n));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!shapeError) check();
  };

  return (
    <div className="lookup">
      <form className="card lookup-form" onSubmit={submit} noValidate aria-labelledby="lookup-title">
        <h3 id="lookup-title">Check a membership account</h3>
        <p className="muted">
          Clubhouse reads the name's NFT record and the account itself, checks they agree, and shows the current owner. Read-only: it doesn't sign anyone in.
        </p>
        <div className="field">
          <label className="field-label" htmlFor="lookup-input">Account name</label>
          <div className="field-row">
            <input
              id="lookup-input"
              className={`input mono ${result?.verified ? "is-ok" : ""}`}
              placeholder="alice-member.akclub.testnet"
              autoComplete="off"
              spellCheck={false}
              value={name}
              aria-invalid={!!(shapeError || error) || undefined}
              aria-describedby="lookup-hint"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onBlur={() => setTouched(true)}
            />
            <Button type="submit" variant="primary" disabled={!trimmed} loading={busy} icon={<SearchIcon width={18} height={18} />}>
              {busy ? "Checking" : "Check this account"}
            </Button>
          </div>
          <p className="field-hint" id="lookup-hint" role={shapeError ? "alert" : undefined}>
            {shapeError ?? (
              <>
                {network === "testnet" ? "Testnet names end in .testnet." : "Mainnet names look like name.bid."} Try{" "}
                {EXAMPLES.map((ex, i) => (
                  <span key={ex}>
                    <button type="button" className="inline-example mono" onClick={() => { setName(ex); setTouched(true); check(ex); }}>{ex}</button>
                    {i < EXAMPLES.length - 1 ? " or " : "."}
                  </span>
                ))}
                {REFUSED_EXAMPLE[network] && (
                  <>
                    {" "}To see a refusal, try{" "}
                    <button type="button" className="inline-example mono" onClick={() => { const ex = REFUSED_EXAMPLE[network]!; setName(ex); setTouched(true); check(ex); }}>
                      {REFUSED_EXAMPLE[network]}
                    </button>
                    , a normal account.
                  </>
                )}
              </>
            )}
          </p>
        </div>
        {error && <ErrorAlert raw={error} onRetry={() => check()} />}
      </form>

      <div className="lookup-result" aria-live="polite">
        <AnimatePresence mode="wait">
          {busy ? (
            <motion.div key="busy" className="card skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="sk sk-1" /><span className="sk sk-2" /><span className="sk sk-3" /><span className="sk sk-3" />
              <p className="muted small">Reading the registry and the account from NEAR {network}…</p>
            </motion.div>
          ) : result ? (
            <motion.div key={result.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <MembershipDetail m={result} network={network} title="Lookup result" />
            </motion.div>
          ) : (
            <motion.div key="empty" className="card empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SearchIcon />
              <p><b>No account checked yet</b></p>
              <p className="muted small">The result appears here: owner, lease, balance, and each check with what it compared.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
