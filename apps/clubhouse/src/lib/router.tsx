/** A tiny History-API router: three routes don't need a routing library. */
import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

interface RouteState {
  path: string;
  hash: string;
  navigate: (to: string) => void;
}

const RouteCtx = createContext<RouteState>({ path: "/", hash: "", navigate: () => {} });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(() => ({ path: window.location.pathname, hash: window.location.hash }));

  useEffect(() => {
    const onPop = () => setLoc({ path: window.location.pathname, hash: window.location.hash });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.origin);
    if (url.pathname === window.location.pathname && url.hash) {
      window.history.pushState(null, "", url.pathname + url.hash);
      setLoc({ path: url.pathname, hash: url.hash });
      document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.history.pushState(null, "", url.pathname + url.hash);
    setLoc({ path: url.pathname, hash: url.hash });
  }, []);

  return <RouteCtx.Provider value={{ ...loc, navigate }}>{children}</RouteCtx.Provider>;
}

export const useRoute = () => useContext(RouteCtx);

export function Link({ to, children, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { navigate, path } = useRoute();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  const current = new URL(to, window.location.origin).pathname === path && !to.includes("#");
  return (
    <a href={to} onClick={handle} aria-current={current ? "page" : undefined} {...rest}>
      {children}
    </a>
  );
}
