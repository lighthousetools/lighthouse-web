import { useEffect, useState } from "react";

/** Views in the order of their number shortcuts. */
export const VIEWS = [
  "today", "approvals", "weekly", "sessions", "brain", "agents", "log", "connections", "settings",
] as const;

export type View = (typeof VIEWS)[number];
export type Route = { view: View; param?: string };

// Hash routes, because paths like /agents belong to the API on the same origin.
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const slash = raw.indexOf("/");
  const view = slash === -1 ? raw : raw.slice(0, slash);
  const param = slash === -1 ? undefined : decodeURIComponent(raw.slice(slash + 1)) || undefined;
  return VIEWS.includes(view as View) ? { view: view as View, param } : { view: "today" };
}

export function href(view: View, param?: string) {
  return param ? `#${view}/${encodeURIComponent(param)}` : `#${view}`;
}

export function go(view: View, param?: string) {
  location.hash = href(view, param);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const follow = () => setRoute(parseRoute(location.hash));
    addEventListener("hashchange", follow);
    return () => removeEventListener("hashchange", follow);
  }, []);
  return route;
}
