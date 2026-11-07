import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, Brain, Check, ChevronDown, ListTodo, Mail, PencilLine, Scissors, Send, ShieldCheck, Sparkles, TerminalSquare, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, authHeader, must, type Schemas } from "../api/client";
import { useAgentNames, useMe, useReady } from "../data";
import { agentName, dateTime, dayTime, greeting, toolName } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { inspect, toast } from "../shell/state";
import { createStore } from "../store";
import { Badge, Btn, Card, Empty, Failure, Menu, Progress, Seg, ServiceIcon, Skeleton, brandOf } from "../ui";
import { plainFields } from "./Decisions";
import { ItemInspector, field, personName as displayName, useItem } from "./connected";
import { LaterMenu } from "./later";
import { openRun } from "./runs";
import { pillarName, usePillars } from "./publishing";
import "./ready.css";

type ReadyItem = Schemas["ReadyItem"];
type Kind = "approval" | "permission" | "draft" | "task" | "fact" | "post";
type Filter = "all" | Category;
type Decided = { key: string; title: string; stamp: string };
type Action = { label: string; icon: ReactNode; kbd: string; run: () => Promise<unknown>; stamp: string; primary?: boolean };

/** What was decided in this visit, so the queue can show it and the empty state can list it. */
export const decidedStore = createStore<Decided[]>([]);
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

function useRefresh() {
  const client = useQueryClient();
  return () => {
    for (const key of ["ready", "approvals", "permissions", "tasks", "memory", "posts"]) void client.invalidateQueries({ queryKey: [key] });
  };
}

function Fields({ fields }: { fields: ReturnType<typeof plainFields> }) {
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

type Extra = { service?: string | null; counterpart?: string | null; org?: string | null; reason?: string | null; context_item_id?: string | null };
type Category = "mail" | "approval" | "task" | "fact" | "post" | "draft" | "permission";
const DRAFT_KEYS = ["body", "text", "message", "content", "comment"];
const CATEGORIES: Category[] = ["mail", "approval", "permission", "draft", "task", "post", "fact"];

/** What kind of thing an item is for a person: a mail to send, an approval, a task, something learned. */
export function categoryOf(item: Pick<ReadyItem, "kind" | "detail">): Category {
  const detail = (item.detail ?? {}) as Record<string, unknown>;
  if (item.kind === "approval" || item.kind === "draft") {
    const tool = String(detail.tool ?? "").toLowerCase();
    if (/mail|reply|send_message|gmail|outlook/.test(tool)) return "mail";
    return item.kind === "draft" ? "draft" : "approval";
  }
  return (["task", "fact", "post", "permission"].includes(item.kind) ? item.kind : "approval") as Category;
}

/** The arguments of an approval or draft: what will happen. */
function inputOf(item: ReadyItem): Record<string, unknown> {
  const detail = (item.detail ?? {}) as Record<string, unknown>;
  const input = item.kind === "draft" ? draftInput(item) : detail.input;
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

/** Everything the card shows, from the API's fields where they exist and derived from the item before that. */
export function viewOf(item: ReadyItem, names: Record<string, string> = {}) {
  const extra = item as ReadyItem & Extra;
  const detail = (item.detail ?? {}) as Record<string, unknown>;
  const input = inputOf(item);
  const category = categoryOf(item);
  const tool = String(detail.tool ?? "");
  const draftKey = DRAFT_KEYS.find((key) => typeof input[key] === "string" && (input[key] as string).trim());
  const to = typeof input.to === "string" ? input.to : Array.isArray(input.to) ? String(input.to[0] ?? "") : "";
  const source = item.kind === "task" ? (detail.source as Schemas["SourceLink"] | null) : null;
  const counterpart = extra.counterpart ?? (to ? displayName(to) : null) ?? source?.label ?? null;
  const service = extra.service ?? (category === "mail" ? "mail" : item.kind === "permission" ? "claude" : tool ? tool.split(".")[0]! : source?.kind ?? null);
  const subject = typeof input.subject === "string" ? input.subject : null;
  return {
    category,
    service,
    counterpart,
    org: extra.org ?? null,
    agent: item.agent_id ? agentName(item.agent_id, names) : null,
    title: subject ?? titleOf(item, names),
    why: extra.reason ?? (item.kind === "task" || item.kind === "fact" ? null : item.summary) ?? null,
    draftKey,
    draft: draftKey ? String(input[draftKey]) : null,
    contextId: extra.context_item_id ?? null,
    external: item.kind === "approval" && Boolean(detail.quotes_external),
  };
}

const CATEGORY_ICON: Record<Category, typeof Mail> = { mail: Mail, approval: ShieldCheck, task: ListTodo, fact: Brain, post: Send, draft: PencilLine, permission: TerminalSquare };

/** A service's logo when we know it, otherwise an icon for what kind of item it is, never a letter tile. */
export function ItemIcon({ service, category, size = 20 }: { service: string | null; category: Category; size?: number }) {
  const brand = brandOf(service ?? undefined);
  if (brand) return <ServiceIcon name={brand} size={size} />;
  const Icon = CATEGORY_ICON[category];
  return <span className="rd-ic" style={{ width: size, height: size }}><Icon size={Math.round(size * 0.62)} strokeWidth={1.8} /></span>;
}

/** Whether the server can rewrite a ready item yet (`POST /ready/{kind}/{id}/rewrite`). Read once from its spec. */
function useCanRewrite() {
  const spec = useQuery({
    queryKey: ["openapi", "paths"],
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch(new URL("/openapi.json", location.origin));
      if (!response.ok) return [] as string[];
      return Object.keys(((await response.json()) as { paths?: Record<string, unknown> }).paths ?? {});
    },
  });
  return (spec.data ?? []).includes("/ready/{kind}/{id}/rewrite");
}

function openContext(id: string) {
  inspect(`item:${id}`, <ItemInspector id={id} />);
}

/** The message the draft answers, when the item names it. */
function Quote({ id }: { id: string }) {
  const item = useItem(id);
  const data = item.data?.item;
  if (!data) return null;
  const message = [...(item.data?.children ?? [])].reverse().find((child) => child.kind === "message" && !child.flags.includes("from_me")) ?? data;
  const text = field(message, "body") ?? field(message, "text") ?? message.summary ?? "";
  const who = displayName(message.author) || message.source;
  return (
    <button type="button" className="qt" onClick={() => openContext(id)}>
      <span className="qh">{message.occurred_at ? t("ready.wrote", { who, when: dayTime(message.occurred_at) }) : who}</span>
      <span className="clip2">{text}</span>
    </button>
  );
}

function ItemCard({ item, names, onDecided }: { item: ReadyItem; names: Record<string, string>; onDecided: (stamp: string) => void }) {
  const refresh = useRefresh();
  const kind = item.kind as Kind;
  const detail = (item.detail ?? {}) as Record<string, unknown>;
  const view = viewOf(item, names);
  const canRewrite = useCanRewrite();
  const pillars = usePillars();
  const [draft, setDraft] = useState(view.draft ?? "");
  const [tone, setTone] = useState<"prepared" | "shorter" | "warmer" | "edited">("prepared");
  const [json, setJson] = useState(kind === "approval" ? JSON.stringify(detail.input, null, 2) : "");
  const [editingJson, setEditingJson] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setDraft(view.draft ?? "");
    setTone("prepared");
  }, [item.id]);
  const post = (call: Promise<{ data?: unknown; error?: unknown; response: Response }>) => must(call);

  const approve = async () => {
    let input: unknown;
    if (editingJson) {
      try {
        input = JSON.parse(json);
      } catch {
        throw new Error(t("approvals.invalidJson"));
      }
    } else if (view.draftKey && draft !== view.draft) {
      input = { ...inputOf(item), [view.draftKey]: draft };
    }
    return post(api.POST("/approvals/{id}/decision", { params: { path: { id: item.id } }, body: { approve: true, input } }));
  };
  const rewrite = useMutation({
    mutationFn: async (instruction: "shorter" | "warmer") => {
      const response = await fetch(new URL(`/ready/${item.kind}/${encodeURIComponent(item.id)}/rewrite`, location.origin), {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader() },
        body: JSON.stringify({ instruction, text: draft }),
      });
      if (!response.ok) throw new Error(t("error.server", { status: response.status }));
      return ((await response.json()) as { text?: string }).text ?? draft;
    },
    onSuccess: (text, instruction) => {
      setDraft(text);
      setTone(instruction);
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const pickTone = (value: "prepared" | "shorter" | "warmer") => {
    if (value === "prepared") {
      setDraft(view.draft ?? "");
      setTone("prepared");
    } else rewrite.mutate(value);
  };
  const later = useMutation({
    mutationFn: (until: Date) => must(api.POST("/ready/{kind}/{id}/snooze", { params: { path: { kind, id: item.id } }, body: { until: until.toISOString() } })),
    onSuccess: (_, until) => {
      const stamp = t("ready.stampLater", { time: dateTime(until.toISOString()) });
      onDecided(stamp);
      toast(`${stamp}: ${view.title}`);
      refresh();
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const sendLabel = view.category === "mail" ? t("ready.send") : kind === "permission" ? t("approvals.allow") : kind === "post" ? t("ready.keepIdea") : kind === "task" ? t("ready.accept") : kind === "fact" ? t("ready.confirm") : kind === "draft" ? t("ready.seen") : t("approvals.approve");
  const actions: Action[] = {
    approval: [
      { label: sendLabel, icon: <Check />, kbd: "↵", run: approve, stamp: view.category === "mail" ? t("ready.stampSent") : t("status.approved"), primary: true },
      { label: t("ready.discard"), icon: <X />, kbd: "R", stamp: t("status.denied"), run: () => post(api.POST("/approvals/{id}/decision", { params: { path: { id: item.id } }, body: { approve: false } })) },
    ],
    permission: [
      { label: sendLabel, icon: <Check />, kbd: "↵", primary: true, stamp: t("status.allowed"), run: () => post(api.POST("/permissions/{id}/decision", { params: { path: { id: item.id } }, body: { allow: true } })) },
      { label: t("approvals.deny"), icon: <X />, kbd: "R", stamp: t("status.denied"), run: () => post(api.POST("/permissions/{id}/decision", { params: { path: { id: item.id } }, body: { allow: false } })) },
    ],
    draft: [
      { label: sendLabel, icon: <Check />, kbd: "↵", primary: true, stamp: t("ready.stampSeen"), run: () => post(api.POST("/ready/drafts/{id}/dismiss", { params: { path: { id: item.id } } })) },
    ],
    task: [
      { label: sendLabel, icon: <Check />, kbd: "↵", primary: true, stamp: t("ready.stampAccepted"), run: () => post(api.POST("/tasks/{id}/accept", { params: { path: { id: item.id } } })) },
      { label: t("ready.discard"), icon: <X />, kbd: "R", stamp: t("ready.stampRejected"), run: () => post(api.DELETE("/tasks/{id}", { params: { path: { id: item.id } } })) },
    ],
    post: [
      { label: sendLabel, icon: <Check />, kbd: "↵", primary: true, stamp: t("ready.stampKept"), run: () => post(api.PATCH("/posts/{id}", { params: { path: { id: item.id } }, body: { status: "draft" } })) },
      { label: t("ready.discard"), icon: <X />, kbd: "R", stamp: t("ready.stampRejected"), run: () => post(api.DELETE("/posts/{id}", { params: { path: { id: item.id } } })) },
    ],
    fact: [
      { label: sendLabel, icon: <Check />, kbd: "↵", primary: true, stamp: t("ready.stampConfirmed"), run: () => post(api.POST("/memory/{id}/confirm", { params: { path: { id: item.id } } })) },
      { label: t("ready.forget"), icon: <X />, kbd: "R", stamp: t("ready.stampForgotten"), run: () => post(api.DELETE("/memory/{id}", { params: { path: { id: item.id } } })) },
    ],
  }[kind] ?? [];
  const decide = useMutation({
    mutationFn: (action: Action) => action.run(),
    onSuccess: (_, action) => {
      onDecided(action.stamp);
      toast(`${action.stamp}: ${view.title}`);
      refresh();
    },
  });
  const primary = actions.find((action) => action.primary);
  const reject = actions.find((action) => action.kbd === "R");
  const edit = () => {
    if (view.draftKey && kind !== "draft") {
      area.current?.focus();
      area.current?.setSelectionRange(area.current.value.length, area.current.value.length);
    } else if (kind === "approval") setEditingJson((value) => !value);
  };
  const context = () => {
    if (view.contextId) openContext(view.contextId);
    else if (kind === "post") go("posts", item.id);
    else if (kind === "task") go("tasks", item.id);
    else if (kind === "permission") go("sessions");
    else if (item.run_id) openRun(item.run_id);
  };

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
      if (((press === "enter" && target.tagName !== "BUTTON") || press === "a") && primary) {
        event.preventDefault();
        decide.mutate(primary);
      }
      if (press === "r" && reject) decide.mutate(reject);
      if (press === "e") {
        event.preventDefault();
        edit();
      }
      if (press === "k" && canRewrite && view.draftKey && kind === "approval") pickTone("shorter");
      if (press === "i") context();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const consulted = kind === "approval" ? ((detail.consulted as string[]) ?? []) : [];
  const shownInput = kind === "permission" ? detail.input : kind === "approval" || kind === "draft" ? inputOf(item) : null;
  // The draft, subject and recipient are shown above; the rest are details under plain labels.
  const fields = plainFields(shownInput).filter((entry) => entry.key !== view.draftKey && entry.key !== "subject" && !(entry.key === "to" && view.counterpart));
  const taskSource = kind === "task" ? (detail.source as Schemas["SourceLink"] | null) : null;
  const factSource = kind === "fact" ? (detail.source as Schemas["FactSource"] | null) : null;
  const draftLabel = view.category === "mail" ? t("ready.yourDraft") : kind === "post" ? t("ready.yourPost") : t("ready.yourAnswer");
  return (
    <Card style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="rdc">
        <div className="rd-hd">
          <ItemIcon service={view.service} category={view.category} />
          <span className="grow clip">{[view.counterpart ?? view.agent ?? t("app.name"), view.org].filter(Boolean).join(" · ")}</span>
          <Badge tone={item.group === "decisions" ? "warn" : item.group === "drafts" ? "info" : "vio"}>{t(`ready.category.${view.category}`)}</Badge>
        </div>
        <h2>{view.title}</h2>
        {view.why && <p className="rd-why"><b>{t("approvals.why")}</b> {view.why}</p>}
        {view.draftKey && (
          <>
            <div className="rea-dh">
              <span>{draftLabel}</span>
              {tone === "edited" && <Badge>{t("approvals.changed")}</Badge>}
              <span className="grow" />
              {canRewrite && kind === "approval" && (
                <Seg label={t("ready.tone")} value={tone === "edited" ? "prepared" : tone} onChange={pickTone} options={[["prepared", t("ready.tone.prepared")], ["shorter", t("ready.tone.shorter")], ["warmer", t("ready.tone.warmer")]]} />
              )}
            </div>
            <textarea
              ref={area}
              className="ta body rd-draft"
              aria-label={draftLabel}
              spellCheck
              readOnly={kind === "draft"}
              value={draft}
              onChange={(event) => { setDraft(event.target.value); setTone("edited"); }}
            />
          </>
        )}
        {view.contextId && <Quote id={view.contextId} />}
        {kind === "approval" && editingJson && (
          <label>
            <span className="lbl" style={{ marginTop: 0 }}>{t("approvals.arguments")}</span>
            <textarea className="ta mono" rows={10} spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)} />
          </label>
        )}
        {(kind === "approval" || kind === "draft" || kind === "permission") && !editingJson && (
          fields.length > 0 ? <Fields fields={fields} /> : !view.draftKey ? <p className="faint" style={{ fontSize: "var(--t-13)" }}>{t("approvals.noInput")}</p> : null
        )}
        {kind === "task" && (
          <>
            {item.summary ? <div className="ta body" style={{ marginTop: 0 }}>{item.summary}</div> : <p className="faint">{t("ready.noNotes")}</p>}
            {taskSource && (
              <div className="rd-evd"><span className="faint">{t("ready.source")}</span><span className="rea-srcchip"><ItemIcon service={taskSource.kind} category="task" size={14} />{taskSource.label ?? taskSource.reference}</span></div>
            )}
          </>
        )}
        {kind === "post" && (
          <>
            <div className="rea-dh"><span>{t("ready.postLead")}</span></div>
            <div className="ta body" style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{String(detail.body ?? item.title)}</div>
            {Boolean(detail.pillar) && <div className="rd-evd"><span className="faint">{t("posts.pillar")}</span><span className="rea-srcchip">{pillarName(pillars.data, String(detail.pillar))}{detail.topic ? ` · ${String(detail.topic)}` : ""}</span></div>}
          </>
        )}
        {kind === "fact" && (
          <>
            <div className="ta body" style={{ marginTop: 0 }}>{String(detail.text ?? item.title)}</div>
            {factSource?.label && <div className="rd-evd"><span className="faint">{t("ready.learnedFrom")}</span><span className="rea-srcchip"><Brain size={13} />{factSource.label}</span></div>}
          </>
        )}
        {(consulted.length > 0 || view.external) && (
          <div className="rd-evd">
            {consulted.length > 0 && <span className="faint">{t("approvals.consulted")}</span>}
            {consulted.map((tool) => (
              <span key={tool} className="rea-srcchip"><ItemIcon service={tool.split(".")[0]!} category={view.category} size={14} />{toolName(tool)}</span>
            ))}
            {view.external && <span className="rd-ext2" title={t("approvals.external")}><AlertTriangle size={12} />{t("ready.externalShort")}</span>}
          </div>
        )}
        {(kind === "approval" || kind === "draft" || kind === "permission") && <Details input={shownInput} />}
      </div>
      <div className="rd-ft">
        {primary && <Btn variant="primary" kbd="↵" disabled={decide.isPending} onClick={() => decide.mutate(primary)}>{primary.icon}{primary.label}</Btn>}
        {((view.draftKey && kind !== "draft") || kind === "approval") && <Btn kbd="E" onClick={edit}><PencilLine />{editingJson ? t("approvals.stopEdit") : t("approvals.edit")}</Btn>}
        {canRewrite && view.draftKey && kind === "approval" && <Btn kbd="K" disabled={rewrite.isPending} onClick={() => pickTone("shorter")}><Scissors />{t("ready.tone.shorter")}</Btn>}
        <LaterMenu kbd="S" onPick={(until) => later.mutate(until)} />
        {reject && <Btn kbd="R" disabled={decide.isPending} onClick={() => decide.mutate(reject)}>{reject.icon}{reject.label}</Btn>}
        <span className="grow" />
        {decide.error ? <Failure error={decide.error} /> : <Btn kbd="I" onClick={context}>{t("ready.context")}</Btn>}
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
  const shown = items.filter((item) => filter === "all" || categoryOf(item) === filter);
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
          {items.length ? t(new Date().getHours() < 12 ? "ready.leadNight" : "ready.leadDay", { count: items.length, minutes }) : t("ready.leadNone")}
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
                  ["all", t("approvals.filterAll"), items.length] as [Filter, string, number],
                  ...CATEGORIES.map((category) => [category, t(`ready.tabs.${category}`), items.filter((item) => categoryOf(item) === category).length] as [Filter, string, number]).filter(([, , count]) => count > 0),
                ]}
              />
            </div>
            <div className="rd-ql">
              {shown.map((item) => {
                const on = current && keyOf(item) === keyOf(current);
                const row = viewOf(item, names);
                return (
                  <button type="button" key={keyOf(item)} className={`rd-i ${on ? "on" : ""}`} aria-current={on || undefined} onClick={() => select(keyOf(item))}>
                    <span className="ic"><ItemIcon service={row.service} category={row.category} /></span>
                    <span className="grow">
                      <span className="t clip">{row.title}</span>
                      <span className="s clip">{[t(`ready.category.${row.category}`), row.counterpart ?? row.agent].filter(Boolean).join(" · ")}</span>
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
