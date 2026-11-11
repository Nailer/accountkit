import { motion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api, type Config, type DemoStatus } from "../api";
import { WaveField } from "../components/motion";
import { LiveRun } from "../demo/LiveRun";
import { Lookup } from "../demo/Lookup";
import { Spinner } from "../components/primitives";

// Wallet SDKs are large; load them only when someone opens the wallet path.
const WalletJourney = lazy(() => import("../demo/WalletJourney").then((m) => ({ default: m.WalletJourney })));
import { PlayIcon, SearchIcon, WalletIcon } from "../icons";
import { useRoute } from "../lib/router";

const TABS = [
  { id: "live", label: "Watch the live run", hint: "No wallet needed", icon: <PlayIcon width={18} height={18} /> },
  { id: "wallet", label: "Use your wallet", hint: "Testnet wallet", icon: <WalletIcon width={18} height={18} /> },
  { id: "lookup", label: "Look up a name", hint: "Read-only", icon: <SearchIcon width={18} height={18} /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Demo({ config }: { config: Config }) {
  const { hash, navigate } = useRoute();
  const tab: TabId = (TABS.find((t) => `#${t.id}` === hash)?.id ?? "live") as TabId;
  const [status, setStatus] = useState<DemoStatus | null>(null);

  const loadStatus = useCallback(() => {
    api.demoStatus().then(setStatus, () => setStatus(null));
  }, []);
  useEffect(loadStatus, [loadStatus]);

  return (
    <div className="demo theme-ink">
      <section className="demo-head" aria-labelledby="demo-title">
        <WaveField className="demo-waves" lines={7} height={200} />
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="eyebrow">Clubhouse · live demo on NEAR testnet</span>
            <h1 id="demo-title" className="demo-title">A club where membership is an account.</h1>
            <p className="lede">
              Each Clubhouse membership is a House of Stake NFT that is also a real NEAR account. Whoever owns it right now gets in. Pick how you want to see that
              happen.
            </p>
          </motion.div>
          <div className="tabs" role="tablist" aria-label="Ways to try Clubhouse">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                className={`tab ${tab === t.id ? "active" : ""}`}
                onClick={() => navigate(`/demo#${t.id}`)}
              >
                {tab === t.id && <motion.span layoutId="tab-bg" className="tab-bg" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                <span className="tab-icon">{t.icon}</span>
                <span className="tab-text">
                  <b>{t.label}</b>
                  <span>{t.id === "live" && status && !status.ownership ? "Unavailable here" : t.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="demo-body" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <div className="container">
          <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            {tab === "live" && <LiveRun status={status} onStatus={loadStatus} />}
            {tab === "wallet" && (
              <Suspense fallback={<p className="progress-note"><Spinner /> Loading wallet connectors…</p>}>
                <WalletJourney config={config} />
              </Suspense>
            )}
            {tab === "lookup" && <Lookup network={config.network} />}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
