import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronRight, Search } from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState, type JSX } from "react";
import { api, followEvents, isSignedIn, setSignedOutHandler, storeToken, type LiveState } from "../api/client";
import { queriesFor, sessionKey, useAlertCounts, useMe, useNeedsYou, useReady, useTasks } from "../data";
import { language, t, useLanguage } from "../i18n";
import { VIEWS, go, useRoute, type View } from "../router";
import { Dot, Kbd, Logo, Menu, Seg, ServiceIcon, Skeleton, initials, type MenuItem } from "../ui";
import { useNow } from "../ui/live";
import { Agents } from "../views/Agents";
import { Alerts } from "../views/Alerts";
import { Automations } from "../views/Automations";
import { Brief } from "../views/Brief";
import { Center } from "../views/Center";
import { Contracts } from "../views/Contracts";
import { Finance } from "../views/Finance";
import { Invoices } from "../views/Invoices";
import { Numbers } from "../views/Numbers";
import { Pipeline } from "../views/Pipeline";
import { Rooms } from "../views/Rooms";
import { Stocks } from "../views/Stocks";
import { Calendar } from "../views/Calendar";
import { Code } from "../views/Code";
import { Inbox } from "../views/Inbox";
import { Issues } from "../views/Issues";
import { Mail } from "../views/Mail";
import { Me } from "../views/Me";
import { Ready } from "../views/Ready";
import { Recap } from "../views/Recap";
import { Rules } from "../views/Rules";
import { Tasks } from "../views/Tasks";
import { Connections } from "../views/Connections";
import { Log } from "../views/Log";
import { Login } from "../views/Login";
import { Sessions } from "../views/Sessions";
import { Settings } from "../views/Settings";
import { inNativeShell, listenForCommands, newIds, post } from "./bridge";
import { Inspector } from "./Inspector";
import { Light } from "./Light";
import { lookChoice, setLook, watchLook, type LookChoice } from "./look";
import { NAV, groupOf, visibleNav } from "./nav";
import { useDomains, useOrganizations } from "../views/connected";
import { orgStore, setOrg } from "./org";
import { Palette } from "./Palette";
import { closeInspector, inspector, palette, toasts } from "./state";

// The editor is large, so it loads with the view that needs it.
const Brain = lazy(() => import("../views/Brain").then((module) => ({ default: module.Brain })));

const VIEW_COMPONENTS: Record<View, (() => JSX.Element) | typeof Brain> = {
  ready: Ready, tasks: Tasks, brief: Brief, recap: Recap, inbox: Inbox, mail: Mail, calendar: Calendar, issues: Issues, code: Code, sessions: Sessions, pipeline: Pipeline, numbers: Numbers, rooms: Rooms, contracts: Contracts,
  invoices: Invoices, finance: Finance, stocks: Stocks, center: Center, alerts: Alerts, brain: Brain,
  automations: Automations, rules: Rules, me: Me,
  agents: Agents, log: Log, connections: Connections, settings: Settings,
};

/** Reloads data whenever the server reports a change. */
function useLiveUpdates() {
  const client = useQueryClient();
  const [state, setState] = useState<LiveState>("reconnecting");
  useEffect(() => {
    const stop = new AbortController();
    const reload = (event: string) => {
      const keys = queriesFor(event);
      if (keys === "all") void client.invalidateQueries({ refetchType: "active" });
      else for (const queryKey of keys) void client.invalidateQueries({ queryKey });
    };
    void followEvents(reload, setState, stop.signal);
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
      <OrgSwitch />
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

/** All organizations, or one, with its color. Every list and number follows it. */
function OrgSwitch() {
  const orgs = useOrganizations();
  const org = orgStore.use();
  const list = orgs.data ?? [];
  if (!list.length) return null;
  return (
    <div className="firm">
      <Seg
        label={t("org.label")}
        value={list.some((item) => item.id === org) ? org : ""}
        onChange={setOrg}
        options={[
          ["", t("org.all")],
          ...list.map((item) => [item.id, <span key={item.id} className="firm-o"><i style={{ background: item.color ?? "var(--ink3)" }} />{item.name}</span>] as [string, JSX.Element]),
        ]}
      />
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

/** Open alerts, all severities. */
function useAlertTotal() {
  const counts = useAlertCounts();
  return counts.data ? counts.data.critical + counts.data.warning + counts.data.info : 0;
}

function Rail({ view }: { view: View }) {
  const ready = useReady();
  const alerts = useAlertTotal();
  const me = useMe();
  const current = groupOf(view);
  const nav = visibleNav(useDomains()).filter((group) => group.items.length);
  const badge = (id: string) => (id === "today" ? ready.data?.total ?? 0 : id === "work" ? alerts : 0);
  return (
    <nav className="rail" aria-label={t("nav.main")}>
      <span className="rl" title={t("app.name")}>
        <Logo size={22} />
      </span>
      {nav.map((group) => {
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
            {count > 0 && <b className={group.id === "work" ? "red" : ""}>{count}</b>}
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
  const ready = useReady();
  const tasks = useTasks("today");
  const alerts = useAlertTotal();
  const domains = useDomains();
  const group = visibleNav(domains).find((entry) => entry.id === groupOf(view).id) ?? groupOf(view);
  if (group.items.length < 2) return null;
  const counts: Partial<Record<View, number>> = { ready: ready.data?.total, tasks: tasks.data?.length, alerts };
  const tone: Partial<Record<View, string>> = { ready: "count hot", alerts: "count red" };
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
            {count > 0 && <em className={tone[item.view] ?? "count"}>{count}</em>}
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
  const ready = useReady();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!inNativeShell()) return;
    post({ type: "ready", v: 1 });
    return listenForCommands({ palette: () => palette.set(true), newNote: () => go("brain", "new") });
  }, []);
  useEffect(() => {
    if (!inNativeShell() || !ready.data || needs.loading) return;
    post({ type: "badge", count: ready.data.total });
    const items = [
      ...ready.data.items.map((item) => ({
        id: `${item.kind}:${item.id}`,
        title: item.title,
        body: item.summary ?? undefined,
        route: `#ready/${item.kind}:${item.id}`,
      })),
      ...needs.waiting.map((item) => ({ id: sessionKey(item), title: t("island.waitingOne"), body: item.project, route: `#sessions/${encodeURIComponent(sessionKey(item))}` })),
    ];
    const fresh = new Set(newIds(seen.current, items.map((item) => item.id)));
    for (const item of items) if (fresh.has(item.id)) post({ type: "notify", ...item });
    seen.current = new Set(items.map((item) => item.id));
  }, [ready.data, needs.loading, needs.waiting]);
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
  const domains = useDomains();
  const solo = (visibleNav(domains).find((entry) => entry.id === groupOf(route.view).id)?.items.length ?? 0) < 2;
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
