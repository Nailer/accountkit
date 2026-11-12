import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowRightIcon, KitMark, MenuIcon, XIcon } from "../icons";
import { Link, useRoute } from "../lib/router";
import { ButtonLink, NetworkBadge } from "./primitives";

const LINKS = [
  { to: "/#product", label: "Product" },
  { to: "/#how", label: "How it works" },
  { to: "/demo", label: "Live demo" },
  { to: "/developers", label: "Developers" },
];

export function Nav({ network }: { network: string }) {
  const { path } = useRoute();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <header className={`nav theme-ink ${scrolled || path !== "/" ? "scrolled" : ""}`} style={{ background: scrolled || path !== "/" ? undefined : "transparent" }}>
        <motion.div className="container nav-inner" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <Link to="/" className="logo" aria-label="AccountKit home">
            <KitMark />
            <span>
              Account<span className="logo-kit">Kit</span>
            </span>
            <span className="logo-sub">for NEAR</span>
          </Link>
          <nav className="nav-links" aria-label="Main">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="nav-link">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="nav-right">
            <NetworkBadge network={network} />
            {path !== "/demo" && (
              <ButtonLink to="/demo" size="sm" trailing={<ArrowRightIcon width={16} height={16} className="arrow" />}>
                Open the demo
              </ButtonLink>
            )}
            <button type="button" className="nav-burger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close menu" : "Open menu"}>
              {open ? <XIcon /> : <MenuIcon />}
            </button>
          </div>
        </motion.div>
      </header>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-menu"
            className="mobile-menu theme-ink"
            aria-label="Mobile"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <ButtonLink to="/demo" trailing={<ArrowRightIcon width={16} height={16} className="arrow" />}>
              Open the demo
            </ButtonLink>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}

export function Footer({ network, club }: { network: string; club: string | null }) {
  return (
    <footer className="footer theme-ink">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link to="/" className="logo">
              <KitMark /> <span>Account<span className="logo-kit">Kit</span></span>
            </Link>
            <p>A TypeScript toolkit for House of Stake's Top Level Accounts on NEAR, with Clubhouse as its live demo. Built at NEAR HACKATHON, November 2026.</p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link to="/#product">What it is</Link></li>
              <li><Link to="/#how">How it works</Link></li>
              <li><Link to="/#truth">What's live</Link></li>
            </ul>
          </div>
          <div>
            <h4>Try it</h4>
            <ul>
              <li><Link to="/demo#live">Watch the live run</Link></li>
              <li><Link to="/demo#wallet">Use your wallet</Link></li>
              <li><Link to="/demo#lookup">Look up a name</Link></li>
            </ul>
          </div>
          <div>
            <h4>Build</h4>
            <ul>
              <li><Link to="/developers">SDK reference</Link></li>
              <li><Link to="/developers#contracts">Network &amp; contracts</Link></li>
              <li><Link to="/developers#errors">Error codes</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-base">
          <span>
            {network === "testnet" ? "Runs on NEAR testnet. Test tokens only; they have no value." : `Network: ${network}`}
            {club ? ` · Demo club: ${club}` : ""}
          </span>
          <span>Uses House of Stake's TLA contracts (unmodified). MIT licensed.</span>
        </div>
      </div>
    </footer>
  );
}
