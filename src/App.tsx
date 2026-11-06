import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { api, isSignedIn, must, setSignedOutHandler } from "./api/client";
import { Agents } from "./views/Agents";
import { Approvals } from "./views/Approvals";
import { Brain } from "./views/Brain";
import { Log } from "./views/Log";
import { Login } from "./views/Login";
import { Sessions } from "./views/Sessions";
import { Settings } from "./views/Settings";
import { Today } from "./views/Today";
import { Weekly } from "./views/Weekly";

const VIEWS = {
  today: ["Today", Today],
  approvals: ["Approvals", Approvals],
  sessions: ["Sessions", Sessions],
  agents: ["Agents", Agents],
  brain: ["Brain", Brain],
  weekly: ["Weekly report", Weekly],
  log: ["Log", Log],
  settings: ["Settings", Settings],
} as const satisfies Record<string, readonly [string, () => ReactNode]>;

type View = keyof typeof VIEWS;

// Hash routes, because paths like /agents belong to the API on the same origin.
function currentView(): View {
  const hash = location.hash.slice(1);
  return hash in VIEWS ? (hash as View) : "today";
}

export function usePendingCount() {
  const approvals = useQuery({
    queryKey: ["approvals", "pending"],
    queryFn: () => must(api.GET("/approvals", { params: { query: { status: "pending" } } })),
  });
  const permissions = useQuery({
    queryKey: ["permissions", "pending"],
    queryFn: () => must(api.GET("/permissions", { params: { query: { status: "pending" } } })),
    refetchInterval: 5_000,
  });
  return (approvals.data?.length ?? 0) + (permissions.data?.length ?? 0);
}

function Shell() {
  const [view, setView] = useState(currentView);
  const pending = usePendingCount();
  useEffect(() => {
    const follow = () => setView(currentView());
    addEventListener("hashchange", follow);
    return () => removeEventListener("hashchange", follow);
  }, []);
  const Content = VIEWS[view][1];
  return (
    <div className="layout">
      <nav className="nav" aria-label="Main">
        <div className="brand">Lighthouse</div>
        {(Object.keys(VIEWS) as View[]).map((key) => (
          <button
            key={key}
            aria-current={key === view ? "page" : undefined}
            onClick={() => (location.hash = key)}
          >
            {VIEWS[key][0]}
            {key === "approvals" && pending > 0 && <span className="count">{pending}</span>}
          </button>
        ))}
      </nav>
      <main>
        <Content />
      </main>
    </div>
  );
}

export function App() {
  const [signedIn, setSignedIn] = useState(isSignedIn);
  useEffect(() => setSignedOutHandler(() => setSignedIn(false)), []);
  return signedIn ? <Shell /> : <Login onDone={() => setSignedIn(true)} />;
}
