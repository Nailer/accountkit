import Lenis from "lenis";
import { AnimatePresence, motion } from "motion/react";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, type Config } from "./api";
import { Footer, Nav } from "./components/Chrome";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorAlert, Spinner } from "./components/primitives";
import { ToastProvider } from "./components/toast";
import { RouterProvider, useRoute } from "./lib/router";
import { Demo } from "./pages/Demo";
import { Developers } from "./pages/Developers";
import { Landing } from "./pages/Landing";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/landing.css";
import "./styles/demo.css";
import "./styles/dev.css";

/** Smooth, inertial scrolling (off for reduced motion). Hash links still jump to their section. */
function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95 });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
}

function NotFound() {
  return (
    <section className="theme-ink notfound">
      <div className="container">
        <span className="eyebrow">404</span>
        <h1>This page doesn't exist.</h1>
        <p className="lede">Try the home page or the live demo.</p>
      </div>
    </section>
  );
}

function Shell() {
  const { path, hash } = useRoute();
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  useSmoothScroll();

  const boot = useCallback(() => {
    setError(null);
    api.config().then(setConfig, (e) => setError(`API unreachable: ${e.message}`));
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: boot is stable (useCallback with no deps); run it once
  useEffect(boot, [boot]);

  // A distinct title per page, for tabs, history and screen readers.
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "AccountKit · NEAR accounts you can hand over",
      "/demo": "Live demo · AccountKit",
      "/developers": "Developers · AccountKit",
    };
    document.title = titles[path] ?? "Page not found · AccountKit";
  }, [path]);

  // New page: start at the top, or at the requested section.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on page changes; same-page hash links scroll in the router
  useEffect(() => {
    if (hash && path === "/") {
      const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 450);
      return () => clearTimeout(t);
    }
    if (hash && path === "/developers") {
      const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 450);
      return () => clearTimeout(t);
    }
    window.scrollTo({ top: 0 });
  }, [path]);

  if (!config) {
    return (
      <div className="app-root theme-ink boot">
        <div className="container boot-inner">
          {error ? <ErrorAlert raw={error} onRetry={boot} /> : <p className="muted"><Spinner /> Loading AccountKit…</p>}
        </div>
      </div>
    );
  }

  const page = path === "/" ? <Landing config={config} /> : path === "/demo" ? <Demo config={config} /> : path === "/developers" ? <Developers config={config} /> : <NotFound />;

  return (
    <div className="app-root">
      <a className="skip-link" href="#main">Skip to content</a>
      <Nav network={config.network} />
      <AnimatePresence mode="wait">
        <motion.main
          id="main"
          key={path}
          className="app-main"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <ErrorBoundary resetKey={path}>{page}</ErrorBoundary>
        </motion.main>
      </AnimatePresence>
      <Footer network={config.network} club={config.club} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </RouterProvider>
  </StrictMode>,
);
