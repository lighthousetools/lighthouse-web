import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowLeft, ArrowUp, Bell, Bot, CalendarClock, Clock, FileCode, GitBranch, Hand, Maximize2, Minus,
  MousePointerClick, Play, Plus, Save, Search, Sparkles, Trash2, Webhook, Wrench, X, Zap, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { api, must, type Schemas } from "../api/client";
import { useAgents, useAutomations, useRuns } from "../data";
import { agentName, dayTime, time } from "../format";
import { t, useLanguage, type Key } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { createStore } from "../store";
import { Badge, Btn, Confirm, Empty, Failure, Seg, Skeleton, Toggle, smoothPath, sparkPoints, type Tone } from "../ui";
import { useNow } from "../ui/live";
import { RunDot, RunStatus, openRun, runSeconds, seconds } from "./runs";
import {
  cronHours, draftAutomation, emptyStep, emptyTrigger, parseAutomation, serializeAutomation,
  type Automation, type Step, type Trigger,
} from "./automation";
import "./automations.css";

type Info = Schemas["AutomationInfo"];
type Filter = "all" | "on" | "off";
type NodeKind = "trigger" | Step["kind"];

/** A sentence typed in the list, waiting in the builder until it is saved. */
const pendingStore = createStore<Automation | null>(null);

const KIND: Record<NodeKind, { label: Key; tone: Tone; icon: LucideIcon }> = {
  trigger: { label: "automations.kind.trigger", tone: "info", icon: Zap },
  agent: { label: "automations.kind.agent", tone: "vio", icon: Bot },
  tool: { label: "automations.kind.tool", tone: "", icon: Wrench },
  notify: { label: "automations.kind.notify", tone: "ok", icon: Bell },
  if: { label: "automations.kind.if", tone: "warn", icon: GitBranch },
};
const TRIGGER_ICON: Record<Trigger["kind"], LucideIcon> = { cron: CalendarClock, event: Zap, webhook: Webhook, manual: MousePointerClick };

const runsOf = (runs: Schemas["RunRecord"][], id: string) => runs.filter((run) => run.agent_id === `automation:${id}`);

export function triggerSummary(trigger: { kind: string; cron?: string | null; event?: string | null }) {
  if (trigger.kind === "cron") return t("automations.trigger.cronAt", { cron: trigger.cron ?? "" });
  if (trigger.kind === "event") return t("automations.trigger.eventOn", { event: trigger.event ?? "" });
  if (trigger.kind === "webhook") return t("automations.trigger.webhook");
  return t("automations.trigger.manual");
}

function stepTitle(step: Step, names: Record<string, string>) {
  switch (step.kind) {
    case "agent":
      return step.agent ? agentName(step.agent, names) : t("automations.pickAgent");
    case "tool":
      return step.name || t("automations.pickTool");
    case "notify":
      return step.subject || t("automations.kind.notify");
    default:
      return t(`automations.test.${step.test}`, { value: step.value });
  }
}

function stepWell(step: Step) {
  switch (step.kind) {
    case "agent":
      return t("automations.well.agent");
    case "tool":
      return Object.keys(step.input).length ? JSON.stringify(step.input) : t("automations.well.tool");
    case "notify":
      return `→ ${step.to}`;
    default:
      return t("automations.well.if");
  }
}

function Spark({ data }: { data: number[] }) {
  const points = sparkPoints(data.length > 1 ? data : [0, ...data], 72, 24);
  return (
    <svg viewBox="0 0 72 24" className="sp" aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--chart)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Dayline({ automations, runs }: { automations: Info[]; runs: Schemas["RunRecord"][] }) {
  const now = new Date(useNow(60_000));
  const hour = now.getHours() + now.getMinutes() / 60;
  const start = 6;
  const span = 18;
  const x = (value: number) => `${((Math.min(24, Math.max(start, value)) - start) / span) * 100}%`;
  const today = now.toDateString();
  const done = runs.filter((run) => run.agent_id.startsWith("automation:") && new Date(run.started_at).toDateString() === today);
  const planned = automations.filter((item) => item.enabled && item.trigger.cron).flatMap((item) => cronHours(item.trigger.cron!).map((at) => ({ at, item })));
  return (
    <div className="au-day">
      <div className="tr">
        {planned.filter(({ at }) => at >= start && at > hour).map(({ at, item }, index) => (
          <button type="button" key={`p${index}`} className="next" style={{ left: x(at) }} title={`${item.name} · ${String(Math.floor(at)).padStart(2, "0")}:${String(Math.round((at % 1) * 60)).padStart(2, "0")}`} onClick={() => go("automations", item.id)} />
        ))}
        {done.map((run) => {
          const date = new Date(run.started_at);
          return (
            <button type="button" key={run.id} style={{ left: x(date.getHours() + date.getMinutes() / 60), background: run.status === "failed" ? "var(--bad)" : undefined }} title={`${run.agent_id.slice(11)} · ${time(run.started_at)}`} onClick={() => openRun(run.id)} />
          );
        })}
        <em style={{ left: x(hour) }} />
      </div>
      <div className="lb">
        {[6, 9, 12, 15, 18, 21, 24].map((value) => <span key={value} style={{ left: x(value) }}>{value}</span>)}
      </div>
    </div>
  );
}

function List() {
  const automations = useAutomations();
  const runs = useRuns(200);
  const agents = useAgents();
  const client = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sentence, setSentence] = useState("");
  const all = automations.data ?? [];
  const history = runs.data ?? [];
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => must(api.PATCH("/automations/{id}", { params: { path: { id } }, body: { enabled } })),
    onSuccess: (item) => {
      toast(item.enabled ? t("automations.switchedOn", { name: item.name }) : t("automations.switchedOff", { name: item.name }));
      void client.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const needle = query.trim().toLowerCase();
  const shown = all.filter((item) => (filter === "all" || (filter === "on" ? item.enabled : !item.enabled)) && (!needle || `${item.name} ${item.description}`.toLowerCase().includes(needle)));
  const upcoming = all.filter((item) => item.enabled && item.next_run).sort((a, b) => a.next_run!.localeCompare(b.next_run!)).slice(0, 6);
  const perDay = (id: string) => {
    const mine = runsOf(history, id);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(Date.now() - (6 - index) * 86_400_000).toDateString();
      return mine.filter((run) => new Date(run.started_at).toDateString() === day).length;
    });
  };
  const build = () => {
    if (!sentence.trim()) return;
    pendingStore.set(draftAutomation(sentence, agents.data?.[0]?.id ?? ""));
    setSentence("");
    go("automations", "new");
  };
  return (
    <div className="au-list">
      <header className="ph">
        <div className="grow">
          <h1>{t("nav.automations")}</h1>
          <p>{t("automations.lead")}</p>
        </div>
        <div className="acts">
          <Seg<Filter>
            label={t("automations.filter")}
            value={filter}
            onChange={setFilter}
            options={[["all", t("approvals.filterAll"), all.length], ["on", t("automations.on"), all.filter((item) => item.enabled).length], ["off", t("automations.off"), all.filter((item) => !item.enabled).length]]}
          />
        </div>
      </header>
      <div className="au-build">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            build();
          }}
        >
          <Sparkles size={16} />
          <input aria-label={t("automations.describe")} placeholder={t("automations.describePlaceholder")} value={sentence} onChange={(event) => setSentence(event.target.value)} />
          <Btn size="sm" variant="primary" type="submit" disabled={!sentence.trim()}>{t("automations.build")}</Btn>
        </form>
      </div>
      <div className="au-sec">
        <h3>{t("today.today")}</h3>
        <Dayline automations={all} runs={history} />
      </div>
      <div className="au-sec">
        <div className="autx-sh2">
          <h3>{t("automations.yours")}</h3>
          <div style={{ width: 200 }}>
            <label className="field">
              <Search />
              <input aria-label={t("ui.search")} placeholder={t("ui.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>
        </div>
        <Failure error={automations.error} />
        {automations.isPending ? (
          <Skeleton count={4} height={60} />
        ) : all.length === 0 ? (
          <div className="card">
            <Empty icon={<Zap />} title={t("automations.empty")} sub={t("automations.emptyHint")} />
          </div>
        ) : (
          <div className="card au-rows">
            {shown.map((item) => {
              const mine = runsOf(history, item.id);
              const last = mine[0];
              return (
                <div key={item.id} className="au-row" role="button" tabIndex={0} onClick={() => go("automations", item.id)} onKeyDown={(event) => event.key === "Enter" && go("automations", item.id)}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="t clip">{item.name}</div>
                    <div className="s clip">
                      {triggerSummary(item.trigger)}
                      {item.enabled && item.next_run ? ` · ${t("automations.nextAt", { time: dayTime(item.next_run) })}` : ""}
                      {!item.enabled ? ` · ${t("automations.paused")}` : ""}
                      {last ? ` · ${t("agents.lastRunAt", { time: dayTime(last.started_at) })}` : ""}
                    </div>
                  </div>
                  <Spark data={perDay(item.id)} />
                  <span className="n tn">{t("automations.runs", { count: mine.length })}</span>
                  <span onClick={(event) => event.stopPropagation()}>
                    <Toggle on={item.enabled} label={t("automations.enabledNamed", { name: item.name })} onChange={(enabled) => toggle.mutate({ id: item.id, enabled })} />
                  </span>
                </div>
              );
            })}
            {shown.length === 0 && <p className="none">{t("automations.noneInFilter")}</p>}
          </div>
        )}
      </div>
      {upcoming.length > 0 && (
        <div className="au-sec">
          <h3>{t("automations.scheduled")}</h3>
          <div className="au-next">
            {upcoming.map((item) => (
              <button type="button" key={item.id} onClick={() => go("automations", item.id)}>
                <Clock size={14} />
                <b className="tn">{dayTime(item.next_run)}</b>
                <span className="clip">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const NODE_W = 260;
const NODE_H = 104;
const GAP = 64;

function NodeCard({ kind, title, sub, well, icon: Icon, selected, index, onSelect, onRemove, onAdd, last }: {
  kind: NodeKind; title: string; sub: string; well: string; icon: LucideIcon; selected: boolean; index: number;
  onSelect: () => void; onRemove?: () => void; onAdd?: () => void; last: boolean;
}) {
  const meta = KIND[kind];
  return (
    <div
      className={`au-node ${selected ? "sel" : ""}`}
      style={{ left: 0, top: index * (NODE_H + GAP), height: NODE_H }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onSelect}
      onKeyDown={(event) => event.key === "Enter" && onSelect()}
    >
      <span className={`kt ${meta.tone}`}>{t(meta.label)}</span>
      {index > 0 && <span className="port in" />}
      <div className="h">
        <span className="autx-tile"><Icon size={14} /></span>
        <b className="clip">{title}</b>
      </div>
      <p className="clip">{sub}</p>
      <div className="wl mono clip">{well}</div>
      {onRemove && (
        <span className="x">
          <Btn icon size="xs" variant="ghost" aria-label={t("automations.removeStep")} onClick={onRemove}><X /></Btn>
        </span>
      )}
      {last && onAdd && (
        <span className="autx-pw">
          <button type="button" className="plus" aria-label={t("automations.addStep")} onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}>
            <Plus size={11} />
          </button>
        </span>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="f">
      <span>{label}</span>
      {children}
    </label>
  );
}

function MatchEditor({ match, onChange }: { match: Record<string, string>; onChange: (match: Record<string, string>) => void }) {
  const text = Object.entries(match).map(([key, value]) => `${key}: ${value}`).join("\n");
  return (
    <textarea
      className="au-in ta2 mono"
      rows={3}
      defaultValue={text}
      placeholder="agent_id: morning-brief"
      onBlur={(event) =>
        onChange(Object.fromEntries(event.target.value.split("\n").map((line) => line.split(/:(.*)/)).filter(([key]) => key?.trim()).map(([key, value]) => [key!.trim(), (value ?? "").trim()])))
      }
    />
  );
}

function StepInspector({ model, index, onChange, onMove, agents }: {
  model: Automation; index: number; onChange: (model: Automation) => void; onMove: (step: number) => void; agents: Schemas["AgentInfo"][];
}) {
  if (index === 0) {
    const trigger = model.trigger;
    const Icon = TRIGGER_ICON[trigger.kind];
    const set = (next: Trigger) => onChange({ ...model, trigger: next });
    return (
      <>
        <div className="nh">
          <span className="autx-tile"><Icon size={15} /></span>
          <div className="grow">
            <div className="ti">{t("automations.kind.trigger")}</div>
            <div className="ty"><span className="k info">{triggerSummary(trigger)}</span></div>
          </div>
        </div>
        <Field label={t("automations.when")}>
          <div className="au-opts">
            {(["cron", "event", "webhook", "manual"] as const).map((kind) => (
              <button type="button" key={kind} className={trigger.kind === kind ? "on" : ""} onClick={() => trigger.kind !== kind && set(emptyTrigger(kind))}>
                {t(`automations.triggerKind.${kind}`)}
              </button>
            ))}
          </div>
        </Field>
        {trigger.kind === "cron" && (
          <Field label={t("automations.cron")}>
            <input className="au-in mono" value={trigger.cron} onChange={(event) => set({ ...trigger, cron: event.target.value })} />
          </Field>
        )}
        {trigger.kind === "event" && (
          <Field label={t("automations.event")}>
            <input className="au-in mono" value={trigger.event} list="au-events" onChange={(event) => set({ ...trigger, event: event.target.value })} />
            <datalist id="au-events">
              <option value="run.failed" />
              <option value="run.succeeded" />
              <option value="run.waiting" />
            </datalist>
          </Field>
        )}
        {(trigger.kind === "event" || trigger.kind === "webhook") && (
          <Field label={t("automations.match")}>
            <MatchEditor match={trigger.match} onChange={(match) => set({ ...trigger, match })} />
          </Field>
        )}
        <p className="au-hint">{t(`automations.triggerHint.${trigger.kind}`)}</p>
      </>
    );
  }
  const step = model.steps[index - 1]!;
  const meta = KIND[step.kind];
  const set = (next: Step) => onChange({ ...model, steps: model.steps.map((item, n) => (n === index - 1 ? next : item)) });
  return (
    <>
      <div className="nh">
        <span className="autx-tile"><meta.icon size={15} /></span>
        <div className="grow">
          <div className="ti">{t(meta.label)}</div>
          <div className="ty"><span className={`k ${meta.tone}`}>{t("automations.stepOf", { index, count: model.steps.length })}</span></div>
        </div>
      </div>
      {step.kind === "agent" && (
        <Field label={t("automations.kind.agent")}>
          <div className="au-opts">
            {agents.map((agent) => (
              <button type="button" key={agent.id} className={step.agent === agent.id ? "on" : ""} onClick={() => set({ ...step, agent: agent.id })}>{agent.name}</button>
            ))}
          </div>
          {agents.length === 0 && <input className="au-in mono" value={step.agent} onChange={(event) => set({ ...step, agent: event.target.value })} />}
        </Field>
      )}
      {step.kind === "tool" && (
        <>
          <Field label={t("automations.toolName")}>
            <input className="au-in mono" value={step.name} placeholder="mail.send_reply" onChange={(event) => set({ ...step, name: event.target.value })} />
          </Field>
          <Field label={t("automations.toolInput")}>
            <textarea
              className="au-in ta2 mono"
              rows={5}
              defaultValue={JSON.stringify(step.input, null, 2)}
              onBlur={(event) => {
                try {
                  set({ ...step, input: JSON.parse(event.target.value || "{}") });
                } catch {
                  toast(t("approvals.invalidJson"), "bad");
                }
              }}
            />
          </Field>
          <div className="au-note"><Hand size={13} />{t("automations.toolNote")}</div>
        </>
      )}
      {step.kind === "notify" && (
        <>
          <Field label={t("automations.to")}>
            <input className="au-in mono" value={step.to} placeholder="owner" onChange={(event) => set({ ...step, to: event.target.value })} />
          </Field>
          <Field label={t("automations.subject")}>
            <input className="au-in" value={step.subject} onChange={(event) => set({ ...step, subject: event.target.value })} />
          </Field>
          <Field label={t("automations.message")}>
            <textarea className="au-in ta2" rows={4} value={step.message} onChange={(event) => set({ ...step, message: event.target.value })} />
          </Field>
        </>
      )}
      {step.kind === "if" && (
        <>
          <Field label={t("automations.goesOnIf")}>
            <div className="au-opts">
              {(["contains", "not_contains", "status"] as const).map((test) => (
                <button type="button" key={test} className={step.test === test ? "on" : ""} onClick={() => set({ ...step, test, value: test === "status" ? "succeeded" : step.value })}>
                  {t(`automations.testKind.${test}`)}
                </button>
              ))}
            </div>
          </Field>
          {step.test === "status" ? (
            <div className="au-opts" style={{ marginTop: 8 }}>
              {["succeeded", "failed"].map((value) => (
                <button type="button" key={value} className={step.value === value ? "on" : ""} onClick={() => set({ ...step, value })}>{t(`status.${value as "failed"}`)}</button>
              ))}
            </div>
          ) : (
            <Field label={t("automations.text")}>
              <input className="au-in" value={step.value} onChange={(event) => set({ ...step, value: event.target.value })} />
            </Field>
          )}
        </>
      )}
      <p className="au-cap">{t("automations.placeholders")}</p>
      <div className="au-mono">{"{{output}} {{status}} {{automation}} {{event}} {{event.<field>}}"}</div>
      <div className="mv">
        <Btn size="sm" disabled={index <= 1} onClick={() => onMove(-1)}><ArrowUp />{t("automations.up")}</Btn>
        <Btn size="sm" disabled={index >= model.steps.length} onClick={() => onMove(1)}><ArrowDown />{t("automations.down")}</Btn>
      </div>
    </>
  );
}

const PALETTE: { group: Key; items: { kind: NodeKind; trigger?: Trigger["kind"]; label: Key; icon: LucideIcon }[] }[] = [
  {
    group: "automations.palette.triggers",
    items: [
      { kind: "trigger", trigger: "cron", label: "automations.triggerKind.cron", icon: CalendarClock },
      { kind: "trigger", trigger: "event", label: "automations.triggerKind.event", icon: Zap },
      { kind: "trigger", trigger: "webhook", label: "automations.triggerKind.webhook", icon: Webhook },
      { kind: "trigger", trigger: "manual", label: "automations.triggerKind.manual", icon: MousePointerClick },
    ],
  },
  {
    group: "automations.palette.steps",
    items: [
      { kind: "agent", label: "automations.kind.agent", icon: Bot },
      { kind: "tool", label: "automations.kind.tool", icon: Wrench },
    ],
  },
  { group: "automations.palette.logic", items: [{ kind: "if", label: "automations.kind.if", icon: GitBranch }] },
  { group: "automations.palette.actions", items: [{ kind: "notify", label: "automations.kind.notify", icon: Bell }] },
];

function Builder({ info, initial }: { info?: Info; initial: Automation }) {
  const client = useQueryClient();
  const agentsQuery = useAgents();
  const agents = agentsQuery.data ?? [];
  const names = Object.fromEntries(agents.map((agent) => [agent.id, agent.name]));
  const [model, setModel] = useState(initial);
  const [saved, setSaved] = useState(info ? serializeAutomation(initial) : "");
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"step" | "runs" | "file">("step");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 40 });
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [quick, setQuick] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const runs = useQuery({
    queryKey: ["automations", info?.id, "runs"],
    enabled: !!info,
    queryFn: () => must(api.GET("/automations/{id}/runs", { params: { path: { id: info!.id } } })),
  });
  const file = serializeAutomation(model);
  const dirty = file !== saved;
  const count = model.steps.length + 1;

  const fit = () => {
    const box = canvas.current?.getBoundingClientRect();
    if (!box) return;
    const height = count * (NODE_H + GAP);
    const scale = Math.min(1, Math.max(0.4, (box.height - 80) / height));
    setZoom(scale);
    setPan({ x: (box.width - NODE_W * scale) / 2, y: 40 });
  };
  useEffect(fit, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (text: string) => must(api.POST("/automations", { body: { source: text } })),
    onSuccess: (result, text) => {
      toast(t("automations.saved"));
      setSaved(text);
      setSource(null);
      pendingStore.set(null);
      void client.invalidateQueries({ queryKey: ["automations"] });
      if (!info || result.id !== info.id) go("automations", result.id);
    },
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => must(api.PATCH("/automations/{id}", { params: { path: { id: info!.id } }, body: { enabled } })),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["automations"] }),
    onError: (error) => toast(error.message, "bad"),
  });
  const run = useMutation({
    mutationFn: () => must(api.POST("/automations/{id}/run", { params: { path: { id: info!.id } }, body: {} as never })),
    onSuccess: (started) => {
      toast(t("automations.started"));
      void client.invalidateQueries({ queryKey: ["automations", info?.id, "runs"] });
      openRun(started.id);
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const remove = useMutation({
    mutationFn: () => must(api.DELETE("/automations/{id}", { params: { path: { id: info!.id } } })),
    onSuccess: () => {
      toast(t("automations.deleted"));
      void client.invalidateQueries({ queryKey: ["automations"] });
      go("automations");
    },
  });

  const insert = (kind: NodeKind, trigger?: Trigger["kind"]) => {
    if (kind === "trigger") {
      setModel({ ...model, trigger: emptyTrigger(trigger ?? "manual") });
      setSelected(0);
      return;
    }
    if (model.steps.length >= 20) return toast(t("automations.tooMany"), "bad");
    const at = Math.max(0, selected);
    const steps = [...model.steps];
    steps.splice(at, 0, emptyStep(kind));
    setModel({ ...model, steps });
    setSelected(at + 1);
    setTab("step");
  };
  const removeStep = (index: number) => {
    if (model.steps.length <= 1) return toast(t("automations.needsStep"), "bad");
    setModel({ ...model, steps: model.steps.filter((_, n) => n !== index - 1) });
    setSelected(Math.min(index, model.steps.length - 1));
  };
  const moveStep = (step: number) => {
    const from = selected - 1;
    const to = from + step;
    if (to < 0 || to >= model.steps.length) return;
    const steps = [...model.steps];
    [steps[from], steps[to]] = [steps[to]!, steps[from]!];
    setModel({ ...model, steps });
    setSelected(to + 1);
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && model.name.trim()) save.mutate(file);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const nodes = [
    { kind: "trigger" as NodeKind, title: triggerSummary({ kind: model.trigger.kind, cron: model.trigger.kind === "cron" ? model.trigger.cron : null, event: model.trigger.kind === "event" ? model.trigger.event : null }), sub: t(`automations.triggerHint.${model.trigger.kind}`), well: model.trigger.kind === "cron" ? model.trigger.cron : model.trigger.kind === "event" ? model.trigger.event : model.trigger.kind === "webhook" ? `POST /automations/${info?.id ?? "…"}/webhook` : t("automations.trigger.manual"), icon: TRIGGER_ICON[model.trigger.kind] },
    ...model.steps.map((step) => ({ kind: step.kind as NodeKind, title: stepTitle(step, names), sub: t(`automations.sub.${step.kind}`), well: stepWell(step), icon: KIND[step.kind].icon })),
  ];
  const wires = nodes.slice(1).map((_, index) => {
    const x = NODE_W / 2;
    const y1 = index * (NODE_H + GAP) + NODE_H;
    const y2 = (index + 1) * (NODE_H + GAP);
    return smoothPath([[x, y1], [x, y2]]).replace(/C.*/, `C${x} ${y1 + 30},${x} ${y2 - 30},${x} ${y2}`);
  });
  const filteredPalette = PALETTE.map((group) => ({ ...group, items: group.items.filter((item) => t(item.label).toLowerCase().includes(paletteQuery.trim().toLowerCase())) })).filter((group) => group.items.length);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const [kind, trigger] = event.dataTransfer.getData("text/plain").split(":");
    if (kind) insert(kind as NodeKind, trigger as Trigger["kind"] | undefined);
  };
  const pointerDown = (event: ReactPointerEvent) => {
    drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.px + event.clientX - drag.current.x, y: drag.current.py + event.clientY - drag.current.y });
  };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) setZoom((value) => Math.min(1.6, Math.max(0.4, value - event.deltaY * 0.002)));
    else setPan((value) => ({ x: value.x - event.deltaX, y: value.y - event.deltaY }));
  };
  const history = runs.data ?? [];
  return (
    <div className="au-ed">
      <div className="au-crumb">
        <button type="button" onClick={() => go("automations")}><ArrowLeft size={14} />{t("nav.automations")}</button>
        <span className="sep">/</span>
        <input className="nm clip" aria-label={t("automations.name")} value={model.name} placeholder={t("automations.name")} onChange={(event) => setModel({ ...model, name: event.target.value })} style={{ minWidth: 120, flex: "0 1 340px" }} />
        {info ? <Badge tone={info.enabled ? "ok" : ""}>{info.enabled ? t("automations.on") : t("automations.off")}</Badge> : <Badge tone="info">{t("automations.draft")}</Badge>}
        {dirty && <Badge tone="warn">{t("automations.unsaved")}</Badge>}
        <span className="grow" />
        <Btn icon size="sm" variant="ghost" aria-label={t("automations.palette.toggle")} onClick={() => setPaletteOpen(!paletteOpen)}><Plus /></Btn>
        {info?.editable !== false && (
          <Btn size="sm" variant={dirty ? "primary" : ""} disabled={!dirty || !model.name.trim() || save.isPending} kbd="⌘S" onClick={() => save.mutate(file)}><Save />{t("common.save")}</Btn>
        )}
        {info && (
          <>
            <Btn size="sm" disabled={run.isPending} onClick={() => run.mutate()}><Play />{t("automations.runNow")}</Btn>
            <Btn size="sm" onClick={() => toggle.mutate(!info.enabled)}>{info.enabled ? t("automations.pause") : t("automations.switchOn")}</Btn>
            {info.editable && <Btn icon size="sm" variant="ghost" aria-label={t("common.delete")} onClick={() => setConfirming(true)}><Trash2 /></Btn>}
          </>
        )}
      </div>
      {(save.error || remove.error) && <div style={{ padding: "0 12px" }}><Failure error={save.error ?? remove.error} /></div>}
      {info && !info.editable && <p className="au-note" style={{ margin: "8px 12px 0" }}><FileCode size={13} />{t("automations.managed")}</p>}
      <div className="au-main">
        {paletteOpen && (
          <aside className="au-pal">
            <div className="h">
              <b>{t("automations.palette.title")}</b>
              <button type="button" aria-label={t("common.close")} onClick={() => setPaletteOpen(false)}><X size={14} /></button>
            </div>
            <label className="field">
              <Search />
              <input aria-label={t("ui.search")} placeholder={t("ui.search")} value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} />
            </label>
            <div className="ls">
              {filteredPalette.map((group) => (
                <div key={group.group}>
                  <h4>{t(group.group)}<em>{group.items.length}</em></h4>
                  {group.items.map((item) => (
                    <button
                      type="button"
                      key={item.label}
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData("text/plain", `${item.kind}:${item.trigger ?? ""}`)}
                      onClick={() => insert(item.kind, item.trigger)}
                    >
                      <item.icon size={14} />
                      {t(item.label)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </aside>
        )}
        <div
          ref={canvas}
          className="au-canvas"
          style={{ backgroundSize: `${16 * zoom}px ${16 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={() => (drag.current = null)}
          onWheel={wheel}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <div className="au-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <svg className="au-wires" width={NODE_W} height={count * (NODE_H + GAP)}>
              {wires.map((path, index) => <path key={index} className={`ln ${selected === index + 1 || selected === index ? "sel" : ""}`} d={path} />)}
            </svg>
            {nodes.map((node, index) => (
              <NodeCard
                key={index}
                index={index}
                {...node}
                selected={selected === index}
                last={index === nodes.length - 1}
                onSelect={() => {
                  setSelected(index);
                  setTab("step");
                }}
                onRemove={index > 0 ? () => removeStep(index) : undefined}
                onAdd={() => setQuick(!quick)}
              />
            ))}
            {quick && (
              <div className="au-quick" style={{ left: NODE_W / 2 + 14, top: nodes.length * (NODE_H + GAP) - GAP + 8 }} onPointerDown={(event) => event.stopPropagation()}>
                {PALETTE.slice(1).flatMap((group) => group.items).map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    onClick={() => {
                      setSelected(model.steps.length);
                      setQuick(false);
                      const steps = [...model.steps, emptyStep(item.kind as Step["kind"])];
                      setModel({ ...model, steps });
                      setSelected(steps.length);
                    }}
                  >
                    <span className="ic"><item.icon size={14} /></span>
                    {t(item.label)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="au-bar" onPointerDown={(event) => event.stopPropagation()}>
            <Btn icon size="xs" variant="ghost" aria-label={t("automations.zoomOut")} onClick={() => setZoom((value) => Math.max(0.4, value - 0.1))}><Minus /></Btn>
            <span className="tn">{Math.round(zoom * 100)} %</span>
            <Btn icon size="xs" variant="ghost" aria-label={t("automations.zoomIn")} onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}><Plus /></Btn>
            <i />
            <Btn icon size="xs" variant="ghost" aria-label={t("automations.fit")} onClick={fit}><Maximize2 /></Btn>
            {info && (
              <Btn size="xs" variant="accent" disabled={run.isPending || dirty} title={dirty ? t("automations.saveFirst") : undefined} onClick={() => run.mutate()}><Play />{t("automations.test")}</Btn>
            )}
          </div>
        </div>
        <aside className="au-ins">
          <div className="au-itabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "step"} className={tab === "step" ? "on" : ""} onClick={() => setTab("step")}>{t("automations.tab.step")}</button>
            <button type="button" role="tab" aria-selected={tab === "runs"} className={tab === "runs" ? "on" : ""} onClick={() => setTab("runs")}>{t("automations.tab.runs")}<em>{history.length}</em></button>
            <button type="button" role="tab" aria-selected={tab === "file"} className={tab === "file" ? "on" : ""} onClick={() => setTab("file")}>{t("automations.tab.file")}</button>
          </div>
          <div className="b">
            {tab === "step" && <StepInspector model={model} index={selected} onChange={setModel} onMove={moveStep} agents={agents} />}
            {tab === "step" && (
              <>
                <p className="au-cap">{t("automations.description")}</p>
                <textarea className="au-in ta2" rows={3} value={model.description} onChange={(event) => setModel({ ...model, description: event.target.value })} />
                {info && (
                  <div className="autx-sum" style={{ marginTop: 12 }}>
                    <div><span>{t("automations.when")}</span><b>{triggerSummary(info.trigger)}</b></div>
                    <div><span>{t("agents.nextRun")}</span><b>{info.next_run ? dayTime(info.next_run) : t("common.none")}</b></div>
                    <div><span>{t("automations.steps")}</span><b>{info.steps.length}</b></div>
                    <div><span>{t("automations.approvals")}</span><b>{info.steps.filter((step) => step.needs_approval).length}</b></div>
                  </div>
                )}
              </>
            )}
            {tab === "runs" && (
              <>
                {!info && <p className="au-hint">{t("automations.noRunsDraft")}</p>}
                {runs.isPending && info && <Skeleton count={3} height={44} />}
                {info && history.length === 0 && !runs.isPending && <p className="au-hint">{t("agents.noRuns")}</p>}
                {history.map((item) => (
                  <button type="button" key={item.id} className="au-run" onClick={() => openRun(item.id)}>
                    <RunDot status={item.status} />
                    <span className="grow">
                      <span className="t">{dayTime(item.started_at)}</span>
                      <span className="s">{seconds(runSeconds(item))} · {item.trigger}</span>
                    </span>
                    <RunStatus status={item.status} />
                  </button>
                ))}
              </>
            )}
            {tab === "file" && (
              <>
                <p className="au-hint">{t("automations.fileHint")}</p>
                <textarea className="au-src" spellCheck={false} value={source ?? file} onChange={(event) => setSource(event.target.value)} />
                {source !== null && source !== file && (
                  <div className="mv">
                    <Btn
                      size="sm"
                      onClick={() => {
                        try {
                          setModel(parseAutomation(source));
                          setSource(null);
                        } catch (error) {
                          toast((error as Error).message, "bad");
                        }
                      }}
                    >
                      {t("automations.applyFile")}
                    </Btn>
                    <Btn size="sm" variant="primary" disabled={save.isPending} onClick={() => save.mutate(source)}><Save />{t("common.save")}</Btn>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
      {confirming && (
        <Confirm title={t("automations.deleteConfirm", { name: model.name })} action={t("common.delete")} onConfirm={() => remove.mutate()} onClose={() => setConfirming(false)} />
      )}
    </div>
  );
}

export function Automations() {
  useLanguage();
  const route = useRoute();
  const automations = useAutomations();
  const pending = pendingStore.use();
  const info = route.param && route.param !== "new" ? automations.data?.find((item) => item.id === route.param) : undefined;
  const initial = useMemo<Automation | null>(() => {
    if (route.param === "new") return pending ?? draftAutomation("");
    if (!info) return null;
    try {
      return parseAutomation(info.source);
    } catch {
      return { name: info.name, trigger: { kind: "manual" }, steps: [], description: info.description };
    }
  }, [route.param, info?.source, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  if (route.param && route.param !== "new" && automations.isPending) return <div className="page"><Skeleton count={5} /></div>;
  return (
    <div className="au">
      {initial ? <Builder key={route.param} info={info} initial={initial} /> : <List />}
    </div>
  );
}
