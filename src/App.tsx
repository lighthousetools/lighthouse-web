import { useQueryClient } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useState, type JSX, type ReactNode } from "react";
import {
  followEvents, isSignedIn, setSignedOutHandler, type LiveState,
} from "./api/client";
import { useMe, useNeedsYou } from "./data";
import { t, useLanguage, type Key } from "./i18n";
import { Palette } from "./Palette";
import { VIEWS, go, useRoute, type View } from "./router";
import { Dot, Logo, Skeleton } from "./ui";
import { Agents } from "./views/Agents";
import { Approvals } from "./views/Approvals";
import { Log } from "./views/Log";
import { Login } from "./views/Login";
import { Sessions } from "./views/Sessions";
import { Settings } from "./views/Settings";
import { Today } from "./views/Today";
import { Weekly } from "./views/Weekly";

// The editor is large, so it loads with the view that needs it.
const Brain = lazy(() => import("./views/Brain").then((module) => ({ default: module.Brain })));

function icon(path: ReactNode) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

const ICONS: Record<View, JSX.Element> = {
  today: icon(<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>),
  approvals: icon(<><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>),
  sessions: icon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10l3 2-3 2M13 14h4" /></>),
  agents: icon(<><rect x="4" y="4" width="16" height="7" rx="2" /><rect x="4" y="13" width="16" height="7" rx="2" /><path d="M8 7.5h.01M8 16.5h.01" /></>),
  brain: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18" /></>),
  weekly: icon(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 16v-3M12 16V9M16 16v-5" /></>),
  log: icon(<path d="M5 7h14M5 12h14M5 17h9" />),
  settings: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></>),
};

const VIEW_COMPONENTS: Record<View, (() => JSX.Element) | typeof Brain> = {
  today: Today, approvals: Approvals, sessions: Sessions, agents: Agents,
  brain: Brain, weekly: Weekly, log: Log, settings: Settings,
};

/** Reloads data whenever the server reports a change. */
function useLiveUpdates() {
  const client = useQueryClient();
  const [state, setState] = useState<LiveState>("reconnecting");
  useEffect(() => {
    const stop = new AbortController();
    void followEvents(() => void client.invalidateQueries({ refetchType: "active" }), setState, stop.signal);
    return () => stop.abort();
  }, [client]);
  return state;
}

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return !!element?.closest?.("input, textarea, select, [contenteditable='true']");
}

function useShortcuts(openPalette: () => void) {
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const view = VIEWS[Number(event.key) - 1];
      if (view) go(view);
    };
    addEventListener("keydown", press);
    return () => removeEventListener("keydown", press);
  }, [openPalette]);
}

function NavItem({ view, active, badge }: { view: View; active: boolean; badge?: number }) {
  return (
    <button className="nav-item" aria-current={active ? "page" : undefined} onClick={() => go(view)}>
      {ICONS[view]}
      {t(`nav.${view}` as Key)}
      {!!badge && <span className="count">{badge}</span>}
    </button>
  );
}

function Shell() {
  useLanguage();
  const route = useRoute();
  const live = useLiveUpdates();
  const needs = useNeedsYou();
  const me = useMe();
  const [palette, setPalette] = useState(false);
  useShortcuts(() => setPalette(true));
  const Content = VIEW_COMPONENTS[route.view];
  const badge = (view: View) =>
    view === "approvals" ? needs.decisions : view === "sessions" ? needs.waiting.length : 0;
  return (
    <div className="layout">
      <nav className="sidebar" aria-label={t("nav.main")}>
        <div className="brand">
          <Logo /> {t("app.name")}
        </div>
        <div className="server" role="status">
          <Dot tone={live === "live" ? "ok" : "attn"} />
          <span>{live === "live" ? location.host : t("status.reconnecting")}</span>
        </div>
        <button className="jump" onClick={() => setPalette(true)}>
          {t("nav.search")} <kbd>⌘K</kbd>
        </button>
        {VIEWS.slice(0, 5).map((view) => (
          <NavItem key={view} view={view} active={route.view === view} badge={badge(view)} />
        ))}
        <div className="nav-label">{t("nav.more")}</div>
        {VIEWS.slice(5).map((view) => (
          <NavItem key={view} view={view} active={route.view === view} />
        ))}
        {me.data && <div className="sidebar-foot">{me.data.name}</div>}
      </nav>
      <main>
        <Suspense fallback={<div className="content"><Skeleton /></div>}>
          <Content />
        </Suspense>
      </main>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  );
}

export function App() {
  const [signedIn, setSignedIn] = useState(isSignedIn);
  useEffect(() => setSignedOutHandler(() => setSignedIn(false)), []);
  return signedIn ? <Shell /> : <Login onDone={() => setSignedIn(true)} />;
}
