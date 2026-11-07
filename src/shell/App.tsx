import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronRight, Search } from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState, type JSX } from "react";
import { api, followEvents, isSignedIn, setSignedOutHandler, storeToken, type LiveState } from "../api/client";
import { sessionKey, useAgentNames, useMe, useNeedsYou } from "../data";
import { agentName, toolName } from "../format";
import { language, t, useLanguage } from "../i18n";
import { VIEWS, go, useRoute, type View } from "../router";
import { Dot, Kbd, Logo, Menu, ServiceIcon, Skeleton, initials, type MenuItem } from "../ui";
import { useNow } from "../ui/live";
import { Agents } from "../views/Agents";
import { Approvals } from "../views/Approvals";
import { Connections } from "../views/Connections";
import { Log } from "../views/Log";
import { Login } from "../views/Login";
import { Sessions } from "../views/Sessions";
import { Settings } from "../views/Settings";
import { Today } from "../views/Today";
import { Weekly } from "../views/Weekly";
import { inNativeShell, listenForCommands, newIds, post } from "./bridge";
import { Inspector } from "./Inspector";
import { Light } from "./Light";
import { lookChoice, setLook, watchLook, type LookChoice } from "./look";
import { NAV, groupOf } from "./nav";
import { Palette } from "./Palette";
import { closeInspector, inspector, palette, toasts } from "./state";

// The editor is large, so it loads with the view that needs it.
const Brain = lazy(() => import("../views/Brain").then((module) => ({ default: module.Brain })));

const VIEW_COMPONENTS: Record<View, (() => JSX.Element) | typeof Brain> = {
  today: Today, approvals: Approvals, weekly: Weekly, sessions: Sessions, brain: Brain,
  agents: Agents, log: Log, connections: Connections, settings: Settings,
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
  return !!element?.closest?.("input, textarea, select, [contenteditable='true'], .cm-editor");
}

function useShortcuts() {
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        palette.set(!palette.get());
        return;
      }
      if (event.key === "Escape" && !palette.get() && inspector.get().length && !document.querySelector(".modalbg, .popv, .menu")) {
        closeInspector();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector(".modalbg, .palbg")) return;
      const view = VIEWS[Number(event.key) - 1];
      if (view && /^[1-9]$/.test(event.key)) go(view);
    };
    addEventListener("keydown", press);
    return () => removeEventListener("keydown", press);
  }, []);
}

async function signOut() {
  await api.POST("/auth/logout").catch(() => undefined);
  storeToken(null);
  location.hash = "";
  location.reload();
}

const Tick = ({ on }: { on: boolean }) => <span className="mb-tick">{on && <Check size={13} />}</span>;

function MenuButton({ label, items, strong, optional }: { label: string; items: MenuItem[]; strong?: boolean; optional?: boolean }) {
  return (
    <Menu
      label={label}
      items={items}
      trigger={(open, isOpen) => (
        <button type="button" className={`mb ${strong ? "b" : ""} ${optional ? "opt" : ""}`} aria-expanded={isOpen} onClick={open}>
          {label}
        </button>
      )}
    />
  );
}

function Clock() {
  const now = useNow(15_000);
  const date = new Date(now);
  const locale = language() === "de" ? "de-DE" : "en-GB";
  return (
    <span className="mb tn">
      {date.toLocaleDateString(locale, { weekday: "short" })} {date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

function Menubar({ live }: { live: LiveState }) {
  const choice = lookChoice.use();
  const look = (value: LookChoice, label: string): MenuItem => ({ label, icon: <Tick on={choice === value} />, run: () => setLook(value) });
  return (
    <div className="menubar">
      <MenuButton
        strong
        label={t("app.name")}
        items={[
          { label: t("nav.settings"), run: () => go("settings") },
          { label: t("nav.connections"), run: () => go("connections") },
          "sep",
          { label: t("settings.signOut"), run: () => void signOut() },
        ]}
      />
      <MenuButton
        label={t("menu.file")}
        items={[
          { label: t("brain.newNote"), run: () => go("brain", "new") },
          { label: t("agents.new"), run: () => go("agents", "new") },
          "sep",
          { label: t("menu.searchEverywhere"), run: () => palette.set(true) },
        ]}
      />
      <MenuButton
        label={t("menu.view")}
        items={[look("system", t("look.system")), look("glass", t("look.glass")), look("light", t("look.light"))]}
      />
      <MenuButton
        optional
        label={t("menu.go")}
        items={VIEWS.map((view, index) => ({
          label: (
            <>
              <span className="grow">{t(NAV.flatMap((group) => group.items).find((item) => item.view === view)!.label)}</span>
              <Kbd>{index + 1}</Kbd>
            </>
          ),
          run: () => go(view),
        }))}
      />
      <span className="grow" />
      <button type="button" className="mb ic" aria-label={t("nav.search")} onClick={() => palette.set(true)}>
        <Search size={14} />
      </button>
      <span className="mb" role="status" title={live === "live" ? t("status.live") : t("status.reconnecting")}>
        <Dot tone={live === "live" ? "ok" : "warn"} />
        {live === "live" ? location.host : t("status.reconnecting")}
      </span>
      <Clock />
    </div>
  );
}

/** One line that says what runs and what waits. It opens into the list. */
function Island({ live }: { live: LiveState }) {
  const needs = useNeedsYou();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    addEventListener("mousedown", outside);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("mousedown", outside);
      removeEventListener("keydown", key);
    };
  }, [open]);
  const waiting = needs.waiting.length;
  const running = needs.running.length;
  const label =
    live !== "live" ? t("status.reconnecting")
    : waiting ? (waiting === 1 ? t("island.waitingOne") : t("island.waiting", { count: waiting }))
    : running ? t("island.working", { count: running })
    : t("island.ready");
  const state = live !== "live" ? "off" : waiting ? "ask" : running ? "" : "idle";
  const list = [...needs.waiting, ...needs.running].slice(0, 5);
  return (
    <div ref={ref} className={`island ${state} ${open ? "open" : ""}`}>
      <button type="button" className="ih1" aria-expanded={open} onClick={() => setOpen(!open)}>
        <i />
        {label}
      </button>
      {open && (
        <div className="she-il">
          {list.map((session) => (
            <button
              type="button"
              key={sessionKey(session)}
              className="ir"
              onClick={() => {
                go("sessions", sessionKey(session));
                setOpen(false);
              }}
            >
              <ServiceIcon name="claude" size={20} />
              <span className="grow">
                <b className="clip">{session.project}</b>
                <small className="clip">{session.status === "waiting" ? t("status.waiting") : session.summary ?? session.node_name}</small>
              </span>
              <ChevronRight size={14} />
            </button>
          ))}
          {!list.length && (
            <p>{needs.decisions ? t("island.decisions", { count: needs.decisions }) : t("island.nothing")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Rail({ view }: { view: View }) {
  const needs = useNeedsYou();
  const me = useMe();
  const current = groupOf(view);
  const badge = (id: string) => (id === "today" ? needs.decisions : id === "work" ? needs.waiting.length : 0);
  return (
    <nav className="rail" aria-label={t("nav.main")}>
      <span className="rl" title={t("app.name")}>
        <Logo size={22} />
      </span>
      {NAV.map((group) => {
        const on = current.id === group.id;
        const count = badge(group.id);
        return (
          <button
            type="button"
            key={group.id}
            className={on ? "on" : ""}
            aria-current={on ? "page" : undefined}
            aria-label={t(group.label)}
            data-tip={t(group.label)}
            onClick={() => go(group.items[0]!.view)}
          >
            <group.icon size={18} strokeWidth={1.75} />
            {count > 0 && <b>{count}</b>}
          </button>
        );
      })}
      <div className="rme">
        <Menu
          label={t("menu.profile")}
          items={[
            { label: t("nav.settings"), run: () => go("settings") },
            { label: t("settings.signOut"), run: () => void signOut() },
          ]}
          trigger={(open, isOpen) => (
            <button type="button" aria-label={t("menu.profile")} aria-expanded={isOpen} onClick={open}>
              {initials(me.data?.name ?? "") || "·"}
            </button>
          )}
        />
      </div>
    </nav>
  );
}

function Sidebar({ view, live }: { view: View; live: LiveState }) {
  const needs = useNeedsYou();
  const group = groupOf(view);
  if (group.items.length < 2) return null;
  const counts: Partial<Record<View, number>> = { approvals: needs.decisions };
  return (
    <aside className="sidebar" aria-label={t(group.label)}>
      <h2>{t(group.label)}</h2>
      <button type="button" className="sq" onClick={() => palette.set(true)}>
        <Search size={14} />
        <span className="grow">{t("nav.search")}</span>
        <Kbd>⌘K</Kbd>
      </button>
      {group.items.map((item) => {
        const count = counts[item.view] ?? 0;
        return (
          <button
            type="button"
            key={item.view}
            className={view === item.view ? "on" : ""}
            aria-current={view === item.view ? "page" : undefined}
            onClick={() => go(item.view)}
          >
            <item.icon size={15} strokeWidth={1.75} />
            <span className="grow">{t(item.label)}</span>
            {count > 0 && <em className="count hot">{count}</em>}
          </button>
        );
      })}
      <div className="sp" role="status">
        <div className="sp-h">
          <Dot tone={live === "live" ? "ok" : "warn"} />
          <b className="grow">{live === "live" ? t("status.live") : t("status.reconnecting")}</b>
        </div>
        <small className="clip">{location.host}</small>
      </div>
    </aside>
  );
}

function Toasts() {
  const list = toasts.use();
  return (
    <div className="toasts" aria-live="polite">
      {list.map((item) => (
        <div key={item.id} className={`toast ${item.tone ?? ""}`}>
          {item.tone === "bad" ? <AlertCircle size={14} /> : <Check size={14} />}
          {item.text}
        </div>
      ))}
    </div>
  );
}

/** Keeps the Mac app informed: the Dock badge, notifications for new requests, and its menu commands. */
function BridgeSync() {
  const needs = useNeedsYou();
  const names = useAgentNames();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!inNativeShell()) return;
    post({ type: "ready", v: 1 });
    return listenForCommands({ palette: () => palette.set(true), newNote: () => go("brain", "new") });
  }, []);
  useEffect(() => {
    if (!inNativeShell() || needs.loading) return;
    post({ type: "badge", count: needs.total });
    const items = [
      ...needs.approvals.map((item) => ({ id: item.id, title: toolName(item.tool), body: t("approvals.proposes", { agent: agentName(item.agent_id, names) }), route: `#approvals/${item.id}` })),
      ...needs.permissions.map((item) => ({ id: item.id, title: t("approvals.claudeWants", { tool: item.tool }), body: item.project, route: `#approvals/${item.id}` })),
      ...needs.waiting.map((item) => ({ id: sessionKey(item), title: t("island.waitingOne"), body: item.project, route: `#sessions/${encodeURIComponent(sessionKey(item))}` })),
    ];
    const fresh = new Set(newIds(seen.current, items.map((item) => item.id)));
    for (const item of items) if (fresh.has(item.id)) post({ type: "notify", ...item });
    seen.current = new Set(items.map((item) => item.id));
  }, [needs.loading, needs.total, needs.approvals, needs.permissions, needs.waiting, names]);
  return null;
}

function Shell() {
  useLanguage();
  const route = useRoute();
  const live = useLiveUpdates();
  const open = palette.use();
  useShortcuts();
  const lastView = useRef(route.view);
  useEffect(() => {
    // The inspector belongs to the view that opened it.
    if (lastView.current !== route.view) closeInspector();
    lastView.current = route.view;
  }, [route.view]);
  const Content = VIEW_COMPONENTS[route.view];
  const solo = groupOf(route.view).items.length < 2;
  return (
    <div className="os">
      <Light />
      <Menubar live={live} />
      <Island live={live} />
      <main className={`window ${solo ? "solo" : ""}`} aria-label={t("app.name")}>
        <Rail view={route.view} />
        <Sidebar view={route.view} live={live} />
        <section className="content">
          <Suspense fallback={<div className="page"><Skeleton /></div>}>
            <Content />
          </Suspense>
          <Inspector />
        </section>
      </main>
      <Toasts />
      <BridgeSync />
      {open && <Palette />}
      <div id="overlays" />
    </div>
  );
}

export function App() {
  const [signedIn, setSignedIn] = useState(isSignedIn);
  useEffect(() => setSignedOutHandler(() => setSignedIn(false)), []);
  useEffect(() => watchLook(), []);
  return signedIn ? <Shell /> : <Login onDone={() => setSignedIn(true)} />;
}
