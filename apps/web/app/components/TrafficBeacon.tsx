import { useEffect } from "react";
import { useLocation } from "react-router";
/**
 * Reports one page view per navigation and one event per outbound purchase click to the site's
 * own counter. No cookie, no identifier in the browser; the server keeps a daily salted hash.
 */
function send(payload: Record<string, string>) {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) navigator.sendBeacon("/api/site/hit", new Blob([body], { type: "text/plain" }));
    else void fetch("/api/site/hit", { method: "POST", body, headers: { "content-type": "text/plain" }, keepalive: true });
  } catch {}
}
export function TrafficBeacon() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    send({ t: "view", p: pathname, r: document.referrer || "" });
  }, [pathname]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a.db-buy, a.db-action-buy, a.db-ending-card");
      if (!(a instanceof HTMLAnchorElement) || !/^https?:/.test(a.href) || a.host === location.host) return;
      send({ t: "click", p: location.pathname, h: a.href });
    };
    document.addEventListener("click", onClick, { capture: true, passive: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
