import { useEffect, useState } from "react";

export const VIEWS = [
  "today", "approvals", "sessions", "agents", "brain", "weekly", "log", "settings",
] as const;

export type View = (typeof VIEWS)[number];
export type Route = { view: View; param?: string };

// Hash routes, because paths like /agents belong to the API on the same origin.
export function parseRoute(hash: string): Route {
  const [view, param] = hash.replace(/^#/, "").split("/");
  return VIEWS.includes(view as View) ? { view: view as View, param } : { view: "today" };
}

export function go(view: View, param?: string) {
  location.hash = param ? `${view}/${param}` : view;
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
