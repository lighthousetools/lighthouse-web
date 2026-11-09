import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AlertCircle, Bell as BellIcon, Check, Search } from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState, type ComponentType, type JSX } from "react";
import { followEvents, useSignedIn, type LiveState } from "../api/client";
import { queriesFor, sessionKey, useAlertCounts, useAlerts, useMe, useNeedsYou, useReady, useTasks } from "../data";
import { Popover, type Anchor } from "../ui/popover";
import { t, useLanguage } from "../i18n";
import { VIEWS, go, useRoute, type View } from "../router";
import { Dot, Kbd, Logo, Progress, Seg, ServiceIcon, Skeleton } from "../ui";
import { Ready, decidedStore } from "../views/Ready";
import { Login } from "../views/Login";
import { LinkPage, useLink } from "../views/Links";
import { epoch, signOut as endSession, useTenants } from "../session";
import { Profile } from "./Profile";
import { inNativeShell, listenForCommands, newIds, post } from "./bridge";
import { Inspector } from "./Inspector";
import { Light } from "./Light";
import { watchLook } from "./look";
import { groupOf, visibleNav } from "./nav";
import { useDomains, useOrganizations } from "../views/connected";
import { orgStore, setOrg } from "./org";
import { Palette } from "./Palette";
import { closeInspector, inspector, palette, toasts } from "./state";

// Every page but the start page loads when it is first opened, so the first load stays small.
const Brain = lazy(() => import("../views/Brain").then((module) => ({ default: module.Brain })));
const Talk = lazy(() => import("../views/Talk").then((module) => ({ default: module.Talk })));
const Agents = lazy(() => import("../views/Agents").then((module) => ({ default: module.Agents })));
const Alerts = lazy(() => import("../views/Alerts").then((module) => ({ default: module.Alerts })));
const Automations = lazy(() => import("../views/Automations").then((module) => ({ default: module.Automations })));
const Brief = lazy(() => import("../views/Brief").then((module) => ({ default: module.Brief })));
const Center = lazy(() => import("../views/Center").then((module) => ({ default: module.Center })));
const Contracts = lazy(() => import("../views/Contracts").then((module) => ({ default: module.Contracts })));
const Finance = lazy(() => import("../views/Finance").then((module) => ({ default: module.Finance })));
const Invoices = lazy(() => import("../views/Invoices").then((module) => ({ default: module.Invoices })));
const Numbers = lazy(() => import("../views/Numbers").then((module) => ({ default: module.Numbers })));
const Pipeline = lazy(() => import("../views/Pipeline").then((module) => ({ default: module.Pipeline })));
const Rooms = lazy(() => import("../views/Rooms").then((module) => ({ default: module.Rooms })));
const Stocks = lazy(() => import("../views/Stocks").then((module) => ({ default: module.Stocks })));
const Posts = lazy(() => import("../views/Posts"));
const Branding = lazy(() => import("../views/Branding"));
const Decks = lazy(() => import("../views/Decks"));
const Calendar = lazy(() => import("../views/Calendar").then((module) => ({ default: module.Calendar })));
const Code = lazy(() => import("../views/Code").then((module) => ({ default: module.Code })));
const Inbox = lazy(() => import("../views/Inbox").then((module) => ({ default: module.Inbox })));
const Issues = lazy(() => import("../views/Issues").then((module) => ({ default: module.Issues })));
const Mail = lazy(() => import("../views/Mail").then((module) => ({ default: module.Mail })));
const Me = lazy(() => import("../views/Me").then((module) => ({ default: module.Me })));
const Recap = lazy(() => import("../views/Recap").then((module) => ({ default: module.Recap })));
const Rules = lazy(() => import("../views/Rules").then((module) => ({ default: module.Rules })));
const Tasks = lazy(() => import("../views/Tasks").then((module) => ({ default: module.Tasks })));
const Connections = lazy(() => import("../views/Connections").then((module) => ({ default: module.Connections })));
const Log = lazy(() => import("../views/Log").then((module) => ({ default: module.Log })));
const Sessions = lazy(() => import("../views/Sessions").then((module) => ({ default: module.Sessions })));
const Settings = lazy(() => import("../views/Settings").then((module) => ({ default: module.Settings })));

const VIEW_COMPONENTS: Record<View, ComponentType> = {
  ready: Ready, talk: Talk, tasks: Tasks, brief: Brief, recap: Recap, inbox: Inbox, mail: Mail, calendar: Calendar, issues: Issues, code: Code, sessions: Sessions, pipeline: Pipeline, numbers: Numbers, rooms: Rooms, contracts: Contracts,
  invoices: Invoices, finance: Finance, stocks: Stocks, posts: Posts, branding: Branding, decks: Decks, center: Center, alerts: Alerts, brain: Brain,
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

async function signOut(client?: QueryClient) {
  await endSession(client);
  location.hash = "";
  location.reload();
}

/** The bell: what is ready for you and which alerts are open, newest first, each one click from its page. */
function Bell() {
  const ready = useReady();
  const alerts = useAlerts("open");
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const items = (ready.data?.items ?? []).slice(0, 6);
  const open = (alerts.data ?? []).slice(0, 4);
  const count = (ready.data?.items.length ?? 0) + (alerts.data?.length ?? 0);
  const close = () => setAnchor(null);
  return (
    <>
      <button
        type="button"
        className="bell"
        data-tip={t("bell.title")}
        aria-label={t("bell.label", { count })}
        aria-expanded={!!anchor}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { left: box.left, right: box.right, top: box.top, bottom: box.bottom });
        }}
      >
        <BellIcon size={18} strokeWidth={1.75} />
        {count > 0 && <i className="bell-dot" />}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={close} width={340} side="right" label={t("bell.title")}>
          <div className="bell-pop">
            <div className="bell-h"><b>{t("bell.title")}</b><span className="faint tn">{count}</span></div>
            {items.map((item) => (
              <button type="button" key={`${item.kind}:${item.id}`} className="bell-r" onClick={() => { close(); go("ready", `${item.kind}:${item.id}`); }}>
                <ServiceIcon name={item.service ?? item.kind} size={20} fallback={item.kind} />
                <span className="grow"><b className="clip">{item.title}</b><small className="clip">{item.counterpart?.name ?? item.reason ?? t(`ready.kind.${item.kind as "task"}`)}</small></span>
              </button>
            ))}
            {open.length > 0 && <div className="bell-s">{t("nav.alerts")}</div>}
            {open.map((alert) => (
              <button type="button" key={alert.id} className="bell-r" onClick={() => { close(); go("alerts", alert.id); }}>
                <Dot tone={alert.severity === "critical" ? "bad" : alert.severity === "warning" ? "warn" : "info"} />
                <span className="grow"><b className="clip">{alert.title}</b><small className="clip">{alert.detail ?? alert.kind}</small></span>
              </button>
            ))}
            {count === 0 && <p className="faint" style={{ padding: "8px 10px", fontSize: 13 }}>{t("bell.empty")}</p>}
            {count > 0 && <button type="button" className="bell-all" onClick={() => { close(); go("ready"); }}>{t("bell.all")}</button>}
          </div>
        </Popover>
      )}
    </>
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

/** Open alerts, all severities. */
function useAlertTotal() {
  const counts = useAlertCounts();
  return counts.data ? counts.data.critical + counts.data.warning + counts.data.info : 0;
}

/** The tenant's name under the avatar, once there is more than one to tell apart. */
function TenantTag() {
  const tenants = useTenants();
  const me = useMe();
  if ((tenants.data?.length ?? 0) < 2 || !me.data?.tenant_name) return null;
  return <span className="rt" title={me.data.tenant_name}>{me.data.tenant_name}</span>;
}

function Rail({ view, live }: { view: View; live: LiveState }) {
  const client = useQueryClient();
  const ready = useReady();
  const alerts = useAlertTotal();
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
        <Bell />
        <TenantTag />
        <Profile live={live} onSignOut={() => void signOut(client)} />
      </div>
    </nav>
  );
}

/** The day at a glance, at the bottom of the sidebar: what got done of what lay ready today. */
function TodayCard() {
  // The same numbers as Ready's own progress line: decided in this visit, of what was ready plus that.
  const ready = useReady();
  const decided = decidedStore.use();
  const finished = decided.length;
  const total = finished + (ready.data?.items.length ?? 0);
  const body = (
    <>
      <span className="grow"><b>{t("today.today")}</b><small className="tn">{t("sidebar.doneOf", { done: finished, total })}</small></span>
      <Progress value={total ? (finished / total) * 100 : 0} />
    </>
  );
  // On Ready itself the card is only a status; elsewhere it leads there.
  return useRoute().view === "ready"
    ? <div className="sp" role="status">{body}</div>
    : <button type="button" className="sp" onClick={() => go("ready")}>{body}</button>;
}

/** Waiting sessions, at the top of the sidebar. */
function SessionPill() {
  const needs = useNeedsYou();
  const waiting = needs.waiting.length;
  if (!waiting) return null;
  return (
    <button type="button" className="sb-pill" onClick={() => go("sessions", sessionKey(needs.waiting[0]!))}>
      <i />
      <span className="grow clip">{waiting === 1 ? t("island.waitingOne") : t("island.waiting", { count: waiting })}</span>
    </button>
  );
}

function Sidebar({ view }: { view: View }) {
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
      <OrgSwitch />
      <SessionPill />
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
      <TodayCard />
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
    const stopCommands = listenForCommands({
      palette: () => palette.set(true),
      newNote: () => go("brain", "new"),
      // The Mac app's Company menu picks the organization; "" or null means all of them.
      org: (detail) => setOrg(typeof detail.id === "string" ? detail.id : ""),
    });
    // And it hears about every change, so its menu shows the current choice.
    post({ type: "org", id: orgStore.get() || null });
    const stopOrg = orgStore.subscribe(() => post({ type: "org", id: orgStore.get() || null }));
    return () => {
      stopCommands();
      stopOrg();
    };
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
      <main className={`window ${solo ? "solo" : ""}`} aria-label={t("app.name")}>
        <Rail view={route.view} live={live} />
        <Sidebar view={route.view} />
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
  const signedIn = useSignedIn();
  const link = useLink();
  const session = epoch.use();
  useEffect(() => watchLook(), []);
  // A new tenant starts with nothing decided in this visit.
  useEffect(() => {
    if (session) decidedStore.set([]);
  }, [session]);
  // Invitation and confirmation links work signed in or not, so they come before the sign-in.
  if (link) return <LinkPage link={link} />;
  return signedIn ? <Shell key={session} /> : <Login onDone={() => undefined} />;
}
