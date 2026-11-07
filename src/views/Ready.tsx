import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, Brain, Check, ChevronDown, ListTodo, PencilLine, Send, Sparkles, X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, must, type Schemas } from "../api/client";
import { useAgentNames, useMe, useReady } from "../data";
import { agentName, dateTime, greeting, toolName } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { createStore } from "../store";
import { Badge, Btn, Card, Empty, Failure, Menu, Progress, Seg, ServiceIcon, Skeleton, brandOf } from "../ui";
import { plainFields } from "./Decisions";
import { LaterMenu } from "./later";
import "./ready.css";

type ReadyItem = Schemas["ReadyItem"];
type Kind = "approval" | "permission" | "draft" | "task" | "fact" | "post";
type Filter = "all" | "decisions" | "drafts" | "suggestions";
type Decided = { key: string; title: string; stamp: string };
type Action = { label: string; icon: ReactNode; kbd: string; run: () => Promise<unknown>; stamp: string; primary?: boolean };

/** What was decided in this visit, so the queue can show it and the empty state can list it. */
const decidedStore = createStore<Decided[]>([]);
const LONG_FIELDS = new Set(["body", "text", "message", "content", "description", "comment"]);
export const keyOf = (item: Pick<ReadyItem, "kind" | "id">) => `${item.kind}:${item.id}`;

/** 2 h, 3 d: how long something has waited. */
export function age(iso: string | undefined, now = Date.now()) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return t("age.minutes", { count: Math.max(1, minutes) });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("age.hours", { count: hours });
  return t("age.days", { count: Math.round(hours / 24) });
}

/** A draft's arguments arrive as JSON text. */
function draftInput(item: ReadyItem): unknown {
  const text = (item.detail as { detail?: string | null })?.detail;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

export function titleOf(item: ReadyItem, names: Record<string, string> = {}) {
  const detail = (item.detail ?? {}) as Record<string, unknown>;
  switch (item.kind as Kind) {
    case "approval":
      return toolName(String(detail.tool ?? item.title));
    case "permission":
      return t("approvals.claudeWants", { tool: String(detail.tool ?? "") });
    case "draft":
      return t("ready.draftOf", { tool: toolName(String(detail.tool ?? "")), agent: agentName(item.agent_id ?? "", names) });
    default:
      return item.title;
  }
}

/** The service an item came from, for its icon. */
function sourceOf(item: ReadyItem) {
  const detail = (item.detail ?? {}) as Record<string, unknown>;
  if (item.kind === "permission") return "claude";
  if (item.kind === "approval" || item.kind === "draft") return String(detail.tool ?? "").split(".")[0];
  if (item.kind === "task") return (detail.source as { kind?: string } | null)?.kind ?? "lighthouse";
  return "lighthouse";
}

const kindLabel = (kind: string) => t(`ready.kind.${kind as Kind}`);

function useRefresh() {
  const client = useQueryClient();
  return () => {
    for (const key of ["ready", "approvals", "permissions", "tasks", "memory", "posts"]) void client.invalidateQueries({ queryKey: [key] });
  };
}

function Fields({ input }: { input: unknown }) {
  const fields = plainFields(input);
  const short = fields.filter((field) => !LONG_FIELDS.has(field.key));
  const long = fields.filter((field) => LONG_FIELDS.has(field.key));
  return (
    <>
      {short.length > 0 && (
        <dl className="rd-facts">
          {short.map((field) => (
            <div key={field.key} style={{ display: "contents" }}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {long.map((field) => (
        <div key={field.key}>
          <div className="rea-dh"><span>{field.label}</span></div>
          <div className="ta body" style={{ marginTop: 0 }}>{field.value}</div>
        </div>
      ))}
    </>
  );
}

function Details({ input }: { input: unknown }) {
  return (
    <details>
      <summary>{t("approvals.details")}</summary>
      <pre>{JSON.stringify(input, null, 2)}</pre>
    </details>
  );
}

function ItemCard({ item, names, onDecided }: { item: ReadyItem; names: Record<string, string>; onDecided: (stamp: string) => void }) {
  const refresh = useRefresh();
  const kind = item.kind as Kind;
  const detail = (item.detail ?? {}) as Record<string, unknown>;
  const initial = kind === "approval" ? JSON.stringify(detail.input, null, 2) : "";
  const [text, setText] = useState(initial);
  const [editing, setEditing] = useState(false);
  const post = (call: Promise<{ data?: unknown; error?: unknown; response: Response }>) => must(call);

  const approve = async () => {
    let input: unknown;
    if (editing) {
      try {
        input = JSON.parse(text);
      } catch {
        throw new Error(t("approvals.invalidJson"));
      }
    }
    return post(api.POST("/approvals/{id}/decision", { params: { path: { id: item.id } }, body: { approve: true, input } }));
  };
  const actions: Action[] = {
    approval: [
      { label: t("approvals.approve"), icon: <Check />, kbd: "↵", run: approve, stamp: t("status.approved"), primary: true },
      { label: t("approvals.deny"), icon: <X />, kbd: "R", stamp: t("status.denied"), run: () => post(api.POST("/approvals/{id}/decision", { params: { path: { id: item.id } }, body: { approve: false } })) },
    ],
    permission: [
      { label: t("approvals.allow"), icon: <Check />, kbd: "↵", primary: true, stamp: t("status.allowed"), run: () => post(api.POST("/permissions/{id}/decision", { params: { path: { id: item.id } }, body: { allow: true } })) },
      { label: t("approvals.deny"), icon: <X />, kbd: "R", stamp: t("status.denied"), run: () => post(api.POST("/permissions/{id}/decision", { params: { path: { id: item.id } }, body: { allow: false } })) },
    ],
    draft: [
      { label: t("ready.seen"), icon: <Check />, kbd: "↵", primary: true, stamp: t("ready.stampSeen"), run: () => post(api.POST("/ready/drafts/{id}/dismiss", { params: { path: { id: item.id } } })) },
    ],
    task: [
      { label: t("ready.accept"), icon: <Check />, kbd: "↵", primary: true, stamp: t("ready.stampAccepted"), run: () => post(api.POST("/tasks/{id}/accept", { params: { path: { id: item.id } } })) },
      { label: t("ready.reject"), icon: <X />, kbd: "R", stamp: t("ready.stampRejected"), run: () => post(api.DELETE("/tasks/{id}", { params: { path: { id: item.id } } })) },
    ],
    post: [
      { label: t("ready.keepIdea"), icon: <Check />, kbd: "↵", primary: true, stamp: t("ready.stampKept"), run: () => post(api.PATCH("/posts/{id}", { params: { path: { id: item.id } }, body: { status: "draft" } })) },
      { label: t("ready.discard"), icon: <X />, kbd: "R", stamp: t("ready.stampRejected"), run: () => post(api.DELETE("/posts/{id}", { params: { path: { id: item.id } } })) },
    ],
    fact: [
      { label: t("ready.confirm"), icon: <Check />, kbd: "↵", primary: true, stamp: t("ready.stampConfirmed"), run: () => post(api.POST("/memory/{id}/confirm", { params: { path: { id: item.id } } })) },
      { label: t("ready.forget"), icon: <X />, kbd: "R", stamp: t("ready.stampForgotten"), run: () => post(api.DELETE("/memory/{id}", { params: { path: { id: item.id } } })) },
    ],
  }[kind] ?? [];
  const later = useMutation({
    mutationFn: (until: Date) => must(api.POST("/ready/{kind}/{id}/snooze", { params: { path: { kind, id: item.id } }, body: { until: until.toISOString() } })),
    onSuccess: (_, until) => {
      const stamp = t("ready.stampLater", { time: dateTime(until.toISOString()) });
      onDecided(stamp);
      toast(`${stamp}: ${titleOf(item, names)}`);
      refresh();
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const decide = useMutation({
    mutationFn: (action: Action) => action.run(),
    onSuccess: (_, action) => {
      onDecided(action.stamp);
      toast(`${action.stamp}: ${titleOf(item, names)}`);
      refresh();
    },
  });

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable='true']")) {
        if (event.key === "Escape") target.blur();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || document.querySelector(".modalbg, .palbg, .menu, .insp")) return;
      if (decide.isPending) return;
      const press = event.key.toLowerCase();
      const primary = actions.find((action) => action.primary);
      const reject = actions.find((action) => action.kbd === "R");
      if (((press === "enter" && target.tagName !== "BUTTON") || press === "a") && primary) {
        event.preventDefault();
        decide.mutate(primary);
      }
      if (press === "r" && reject) decide.mutate(reject);
      if (press === "e" && kind === "approval") {
        event.preventDefault();
        setEditing((value) => !value);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const source = sourceOf(item);
  const changed = editing && text !== initial;
  const consulted = kind === "approval" ? ((detail.consulted as string[]) ?? []) : [];
  const head =
    kind === "approval" ? t("approvals.proposes", { agent: agentName(item.agent_id ?? "", names) })
    : kind === "permission" ? `Claude Code · ${String(detail.project ?? "")}`
    : item.agent_id ? t("ready.from", { agent: agentName(item.agent_id, names) })
    : t("app.name");
  const taskSource = kind === "task" ? (detail.source as Schemas["SourceLink"] | null) : null;
  const factSource = kind === "fact" ? (detail.source as Schemas["FactSource"] | null) : null;
  return (
    <Card style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="rdc">
        <div className="rd-hd">
          <ServiceIcon name={brandOf(source)} fallback={source} size={20} />
          <span className="grow clip">{head}</span>
          <Badge tone={item.group === "decisions" ? "warn" : item.group === "drafts" ? "info" : "vio"}>{kindLabel(kind)}</Badge>
        </div>
        <h2>{titleOf(item, names)}</h2>
        {item.summary && kind !== "task" && (
          <p className="rd-why">
            <b>{t("approvals.why")}</b> {item.summary}
          </p>
        )}
        {kind === "approval" && Boolean(detail.quotes_external) && (
          <p className="note-box rd-ext">
            <AlertTriangle size={14} />
            <span>{t("approvals.external")}</span>
          </p>
        )}
        {(kind === "approval" || kind === "permission" || kind === "draft") && (
          <>
            <div className="rea-dh">
              <span>{kind === "approval" ? t("approvals.whatHappens") : kind === "draft" ? t("ready.whatItPrepared") : t("approvals.request")}</span>
              {changed && <Badge>{t("approvals.changed")}</Badge>}
            </div>
            {editing ? (
              <label>
                <span className="lbl" style={{ marginTop: 0 }}>{t("approvals.arguments")}</span>
                <textarea className="ta mono" rows={12} spellCheck={false} value={text} onChange={(event) => setText(event.target.value)} />
              </label>
            ) : (
              <Fields input={kind === "draft" ? draftInput(item) : detail.input} />
            )}
            <Details input={kind === "draft" ? draftInput(item) : detail.input} />
          </>
        )}
        {kind === "task" && (
          <>
            <div className="rea-dh"><span>{t("ready.taskLead")}</span></div>
            {item.summary ? <div className="ta body" style={{ marginTop: 0 }}>{item.summary}</div> : <p className="faint">{t("ready.noNotes")}</p>}
            {taskSource && (
              <div className="rd-evd">
                <span className="faint">{t("ready.source")}</span>
                <span className="rea-srcchip">
                  <ServiceIcon name={brandOf(taskSource.kind)} fallback={taskSource.kind} size={14} />
                  {taskSource.label ?? taskSource.reference}
                </span>
              </div>
            )}
          </>
        )}
        {kind === "post" && (
          <>
            <div className="rea-dh"><span>{t("ready.postLead")}</span></div>
            <div className="ta body" style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{String(detail.body ?? item.title)}</div>
            {Boolean(detail.pillar) && (
              <div className="rd-evd"><span className="faint">{t("posts.pillar")}</span><span className="rea-srcchip">{String(detail.pillar)}{detail.topic ? ` · ${String(detail.topic)}` : ""}</span></div>
            )}
          </>
        )}
        {kind === "fact" && (
          <>
            <div className="rea-dh"><span>{t("ready.factLead")}</span></div>
            <div className="ta body" style={{ marginTop: 0 }}>{String(detail.text ?? item.title)}</div>
            {factSource?.label && (
              <div className="rd-evd">
                <span className="faint">{t("ready.learnedFrom")}</span>
                <span className="rea-srcchip"><Brain size={13} />{factSource.label}</span>
              </div>
            )}
          </>
        )}
        {consulted.length > 0 && (
          <div className="rd-evd">
            <span className="faint">{t("approvals.consulted")}</span>
            {consulted.map((tool) => (
              <span key={tool} className="rea-srcchip">
                <ServiceIcon name={brandOf(tool.split(".")[0])} fallback={tool} size={14} />
                {toolName(tool)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="rd-ft">
        {actions.map((action, index) => (
          <Fragment key={action.label}>
            <Btn variant={action.primary ? "primary" : ""} kbd={action.kbd} disabled={decide.isPending} onClick={() => decide.mutate(action)}>
              {action.icon}
              {action.label}
            </Btn>
            {index === 0 && kind === "approval" && (
              <Btn kbd="E" onClick={() => setEditing(!editing)}>
                <PencilLine />
                {editing ? t("approvals.stopEdit") : t("approvals.edit")}
              </Btn>
            )}
          </Fragment>
        ))}
        {kind === "post" && (
          <Btn onClick={() => go("posts", item.id)}>
            <Send />
            {t("ready.openPost")}
          </Btn>
        )}
        <LaterMenu onPick={(until) => later.mutate(until)} />
        {kind === "task" && (
          <Btn onClick={() => go("tasks")}>
            <ListTodo />
            {t("nav.tasks")}
          </Btn>
        )}
        <span className="grow" />
        {decide.error ? <Failure error={decide.error} /> : item.expires_at ? (
          <span className="exp tn">{t("common.expires", { time: dateTime(item.expires_at) })}</span>
        ) : null}
      </div>
    </Card>
  );
}

function BatchMenu({ ids }: { ids: string[] }) {
  const refresh = useRefresh();
  const batch = useMutation({
    mutationFn: (approve: boolean) => must(api.POST("/approvals/decisions", { body: { approve, ids } })),
    onSuccess: (result, approve) => {
      toast(approve ? t("approvals.approvedMany", { count: result.decided.length }) : t("approvals.deniedMany", { count: result.decided.length }));
      refresh();
    },
    onError: (error) => toast(error.message, "bad"),
  });
  return (
    <Menu
      label={t("approvals.all")}
      items={[
        { label: t("approvals.approveAll", { count: ids.length }), icon: <Check size={14} />, run: () => batch.mutate(true) },
        { label: t("approvals.denyAll"), icon: <X size={14} />, run: () => batch.mutate(false), danger: true },
      ]}
      trigger={(open, isOpen) => (
        <Btn onClick={open} aria-expanded={isOpen}>
          {t("approvals.all")}
          <ChevronDown />
        </Btn>
      )}
    />
  );
}

export function Ready() {
  useLanguage();
  const route = useRoute();
  const ready = useReady();
  const me = useMe();
  const names = useAgentNames();
  const decided = decidedStore.use();
  const [filter, setFilter] = useState<Filter>("all");
  const items = useMemo(() => ready.data?.items ?? [], [ready.data]);
  const shown = items.filter((item) => filter === "all" || item.group === filter);
  // Links may name an item with its kind (`approval:<id>`) or by its bare id, as notifications do.
  const current = shown.find((item) => keyOf(item) === route.param || item.id === route.param) ?? shown[0];
  const select = (key: string) => go("ready", key);
  const move = (step: number) => {
    const index = shown.findIndex((item) => keyOf(item) === (current && keyOf(current)));
    const next = shown[(index + step + shown.length) % shown.length];
    if (next) select(keyOf(next));
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) return;
      if (event.metaKey || event.ctrlKey || event.altKey || document.querySelector(".modalbg, .palbg, .menu")) return;
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        move(1);
      }
      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        move(-1);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  const onDecided = (item: ReadyItem) => (stamp: string) => {
    decidedStore.set((list) => [{ key: keyOf(item), title: titleOf(item, names), stamp }, ...list.filter((entry) => entry.key !== keyOf(item))].slice(0, 20));
    const index = shown.findIndex((entry) => keyOf(entry) === keyOf(item));
    const next = shown[index + 1] ?? shown[index - 1];
    if (next) select(keyOf(next));
  };
  const total = items.length + decided.length;
  const oldest = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.created_at;
  const minutes = Math.max(1, Math.ceil(items.length * 0.7));
  const first = me.data?.name.split(" ")[0];
  const hello = greeting(new Date().getHours());
  const approvalIds = items.filter((item) => item.kind === "approval").map((item) => item.id);
  const header = (
    <header className="rd-h">
      <div className="grow">
        <h1>{first ? t("ready.greeting", { greeting: hello, name: first }) : hello}</h1>
        <p className="lead">
          {items.length ? (items.length === 1 ? t("ready.leadOne") : t("ready.leadMany", { count: items.length, minutes })) : t("ready.leadNone")}
        </p>
      </div>
      {approvalIds.length > 1 && <BatchMenu ids={approvalIds} />}
    </header>
  );

  if (ready.isPending) {
    return (
      <div className="page">
        <div className="rdy">
          {header}
          <div style={{ marginTop: 24 }}><Skeleton count={4} height={58} /></div>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="page">
        <div className="rdy rd-empty">
          {header}
          <Failure error={ready.error} />
          <div className="rdy-done">
            <div>
              <Sparkles size={28} className="warnc" />
              <h1 style={{ marginTop: 12 }}>{t("ready.clear")}</h1>
              <p className="muted" style={{ marginTop: 8 }}>{t("ready.clearHint")}</p>
              <div className="rd-acts">
                <Btn variant="primary" onClick={() => go("tasks")}>{t("nav.tasks")}</Btn>
                <Btn onClick={() => go("brief")}>{t("nav.brief")}</Btn>
              </div>
              {decided.length > 0 && (
                <div className="rd-log">
                  {decided.map((entry) => (
                    <button type="button" key={entry.key} onClick={() => go("log")}>
                      <Check size={14} className="up" />
                      <span className="grow clip">{entry.title}</span>
                      <em>{entry.stamp}</em>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const count = (group?: string) => items.filter((item) => !group || item.group === group).length;
  const last = decided[0];
  return (
    <div className="page">
      <div className="rdy">
        {header}
        <div className="prog">
          <Progress value={total ? (decided.length / total) * 100 : 0} />
          <span className="tn">{t("approvals.progress", { done: decided.length, total })}</span>
          {oldest && <span className="tn">{t("approvals.oldest")} <span className="warnc">{age(oldest)}</span></span>}
          {last && (
            <span className="rd-stamp">
              <Check size={14} className="up" />
              {last.stamp}
              <span className="faint">·</span>
              <span className="clip" style={{ maxWidth: 220 }}>{last.title}</span>
            </span>
          )}
        </div>
        <div className="rd-grid">
          <div className="rd-q">
            <div className="rd-qh">
              <Seg<Filter>
                label={t("approvals.filter")}
                value={filter}
                onChange={setFilter}
                options={[
                  ["all", t("approvals.filterAll"), count()],
                  ["decisions", t("ready.decisions"), count("decisions")],
                  ["drafts", t("ready.drafts"), count("drafts")],
                  ["suggestions", t("ready.suggestions"), count("suggestions")],
                ]}
              />
            </div>
            <div className="rd-ql">
              {shown.map((item) => {
                const on = current && keyOf(item) === keyOf(current);
                const source = sourceOf(item);
                return (
                  <button type="button" key={keyOf(item)} className={`rd-i ${on ? "on" : ""}`} aria-current={on || undefined} onClick={() => select(keyOf(item))}>
                    <span className="ic"><ServiceIcon name={brandOf(source)} fallback={source} size={20} /></span>
                    <span className="grow">
                      <span className="t clip">{titleOf(item, names)}</span>
                      <span className="s clip">{kindLabel(item.kind)}{item.agent_id ? ` · ${agentName(item.agent_id, names)}` : ""}</span>
                    </span>
                    <span className="ag tn">{age(item.created_at)}</span>
                  </button>
                );
              })}
              {decided.map((entry) => (
                <div key={entry.key} className="rd-i dn">
                  <span className="ck"><Check size={12} /></span>
                  <span className="grow clip">{entry.title}</span>
                  <em>{entry.stamp}</em>
                </div>
              ))}
              {!shown.length && <p className="rd-none">{t("approvals.nothingHere")}</p>}
            </div>
          </div>
          <div className="rd-item">
            {current ? (
              <div className="rd-mo" key={keyOf(current)}>
                <ItemCard item={current} names={names} onDecided={onDecided(current)} />
              </div>
            ) : (
              <Empty title={t("approvals.nothingHere")} action={<Btn onClick={() => setFilter("all")}>{t("approvals.filterAll")}<ArrowRight /></Btn>} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
