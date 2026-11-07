import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Bot, Calendar, Check, ChevronDown, Flag, GripVertical, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { api, must, type Schemas } from "../api/client";
import { useAgentNames, useAgents, useTasks } from "../data";
import { agentName, shortDate, weekdayShort } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { openExternal } from "../shell/bridge";
import { toast } from "../shell/state";
import { createStore } from "../store";
import { Badge, Btn, CheckBox, Empty, Failure, Menu, Seg, ServiceIcon, Skeleton, brandOf } from "../ui";
import { Markdown } from "../ui/markdown";
import { openRun } from "./runs";
import { GROUPS, addDays, dayIso, dueFor, groupOf, nextWeekday, parseTask, type DueGroup } from "./taskdates";
import "./tasks.css";

type Task = Schemas["Task"];
type Tab = "all" | DueGroup | "proposed" | "done";
type Undo = { id: number; text: string; run: () => void };

const undoStore = createStore<Undo | null>(null);
const showDoneStore = createStore(false);
let undoId = 1;

function pushUndo(text: string, run: () => void) {
  const id = undoId++;
  undoStore.set({ id, text, run });
  setTimeout(() => undoStore.set((current) => (current?.id === id ? null : current)), 6000);
}

function runUndo() {
  const current = undoStore.get();
  if (!current) return;
  undoStore.set(null);
  current.run();
}

export function dueLabel(due: string | null | undefined, today = new Date()) {
  if (!due) return t("tasks.someday");
  if (due < dayIso(today)) return t("tasks.overdue");
  if (due === dayIso(today)) return t("today.today");
  if (due === dayIso(addDays(today, 1))) return t("tasks.tomorrow");
  if (due <= dayIso(addDays(today, 6))) return weekdayShort(`${due}T12:00:00`);
  return shortDate(`${due}T12:00:00`);
}

const groupLabel = (group: DueGroup) => t(`tasks.group.${group}`);

function useTaskActions() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["tasks"] });
    void client.invalidateQueries({ queryKey: ["ready"] });
  };
  const call = <T,>(promise: Promise<{ data?: T; error?: unknown; response: Response }>) => must(promise).finally(refresh);
  const fail = (error: Error) => toast(error.message, "bad");
  return {
    create: (body: Schemas["NewTask"]) => call(api.POST("/tasks", { body })).catch(fail),
    patch: (id: string, body: Schemas["TaskPatch"]) => call(api.PATCH("/tasks/{id}", { params: { path: { id } }, body })).catch(fail),
    complete: (id: string) => call(api.POST("/tasks/{id}/complete", { params: { path: { id } } })).catch(fail),
    reopen: (id: string) => call(api.POST("/tasks/{id}/reopen", { params: { path: { id } } })).catch(fail),
    accept: (id: string) => call(api.POST("/tasks/{id}/accept", { params: { path: { id } } })).catch(fail),
    remove: (id: string) => call(api.DELETE("/tasks/{id}", { params: { path: { id } } })).catch(fail),
    delegate: (id: string, agentId: string) => call(api.POST("/tasks/{id}/delegate", { params: { path: { id } }, body: { agent_id: agentId } })).then(() => toast(t("tasks.delegated"))).catch(fail),
    order: (ids: string[]) => call(api.POST("/tasks/order", { body: { ids } })).catch(fail),
  };
}

type Actions = ReturnType<typeof useTaskActions>;

const DUE_OPTIONS = (today = new Date()): [string | null, string][] => [
  [dayIso(today), t("today.today")],
  [dayIso(addDays(today, 1)), t("tasks.tomorrow")],
  [dayIso(nextWeekday(today, 5, 1)), t("tasks.friday")],
  [dayIso(nextWeekday(today, 1, 1)), t("tasks.nextWeek")],
  [null, t("tasks.someday")],
];

function setDue(actions: Actions, task: Task, due: string | null) {
  const previous = task.due_on ?? null;
  if (previous === due) return;
  void actions.patch(task.id, { due_on: due });
  pushUndo(t("tasks.movedTo", { title: task.title, due: dueLabel(due) }), () => void actions.patch(task.id, { due_on: previous }));
}

function SourceChip({ source, mini }: { source: Schemas["SourceLink"]; mini?: boolean }) {
  const open = () => {
    if (source.url) openExternal(source.url);
    else if (source.kind === "brain") go("brain", source.reference);
    else if (source.kind === "run") openRun(source.reference);
    else if (source.kind === "approval") go("ready", source.reference);
  };
  return (
    <button
      type="button"
      className={`tas-srcchip ${mini ? "mini" : ""}`}
      title={t("tasks.openSource")}
      onClick={(event) => {
        event.stopPropagation();
        open();
      }}
    >
      <ServiceIcon name={brandOf(source.kind)} size={14} fallback={source.kind} />
      {source.label ?? source.reference}
    </button>
  );
}

function Row({ task, selected, editing, leaving, over, actions, onSelect, onDone, onEdit, drag }: {
  task: Task; selected: boolean; editing: boolean; leaving: boolean; over: boolean; actions: Actions;
  onSelect: () => void; onDone: () => void; onEdit: (editing: boolean) => void;
  drag: { onDragStart: (event: DragEvent) => void; onDragOver: (event: DragEvent) => void; onDrop: (event: DragEvent) => void; onDragEnd: () => void; dragging: boolean };
}) {
  const group = groupOf(task.due_on);
  return (
    <div
      data-task={task.id}
      role="option"
      aria-selected={selected}
      draggable={!editing}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
      className={`tk-r ${selected ? "on" : ""} ${leaving ? "leaving" : ""} ${over ? "over" : ""} ${drag.dragging ? "dragging" : ""}`}
      onClick={onSelect}
    >
      <span className="gr" aria-hidden="true"><GripVertical size={14} /></span>
      <CheckBox on={leaving} label={t("tasks.markDone", { title: task.title })} onChange={onDone} />
      {task.priority > 0 && (
        <span className="pri" title={t("tasks.important")}>
          {Array.from({ length: Math.min(3, task.priority) }, (_, index) => <i key={index} />)}
        </span>
      )}
      {editing ? (
        <input
          className="ed"
          autoFocus
          defaultValue={task.title}
          aria-label={t("tasks.title")}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value && value !== task.title) void actions.patch(task.id, { title: value });
            onEdit(false);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = task.title;
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <span className="tt clip" onDoubleClick={() => onEdit(true)}>{task.title}</span>
      )}
      {task.source && <SourceChip source={task.source} mini />}
      <span className="grow" />
      <Menu
        label={t("tasks.due")}
        items={DUE_OPTIONS().map(([value, label]) => ({ label, icon: <Calendar size={14} />, run: () => setDue(actions, task, value) }))}
        trigger={(open) => (
          <button
            type="button"
            className={`due ${group === "today" ? "now" : ""}`}
            aria-label={t("tasks.dueChange", { due: dueLabel(task.due_on) })}
            onClick={(event) => {
              event.stopPropagation();
              open();
            }}
          >
            {dueLabel(task.due_on)}
          </button>
        )}
      />
    </div>
  );
}

function Detail({ task, actions, names }: { task: Task; actions: Actions; names: Record<string, string> }) {
  const [notes, setNotes] = useState(task.notes ?? "");
  useEffect(() => setNotes(task.notes ?? ""), [task.id, task.notes]);
  const done = task.status === "done";
  const proposed = task.status === "proposed";
  const important = task.priority > 0;
  const group = groupOf(task.due_on);
  return (
    <div className="tk-d" key={task.id}>
      <textarea
        key={task.title}
        className="ti"
        rows={2}
        defaultValue={task.title}
        aria-label={t("tasks.title")}
        onBlur={(event) => {
          const value = event.target.value.trim();
          if (value && value !== task.title) void actions.patch(task.id, { title: value });
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") event.currentTarget.blur();
        }}
      />
      <div className="dl">
        <span>{t("tasks.due")}</span>
        <Seg<DueGroup>
          label={t("tasks.due")}
          value={group}
          onChange={(value) => setDue(actions, task, dueFor(value))}
          options={GROUPS.map((value) => [value, groupLabel(value)])}
        />
      </div>
      <div className="dl">
        <span>{t("tasks.importantShort")}</span>
        <button
          type="button"
          className={`flag ${important ? "on" : ""}`}
          aria-pressed={important}
          onClick={() => void actions.patch(task.id, { priority: important ? 0 : 3 })}
        >
          <Flag size={14} />
          {important ? t("tasks.keepOnTop") : t("tasks.notMarked")}
        </button>
      </div>
      {proposed && (
        <div className="tas-dg">
          <div className="dgh"><Sparkles size={14} />{t("tasks.proposedBy", { agent: agentName(task.agent_id ?? "", names) })}</div>
          <p>{t("tasks.proposedHint")}</p>
          <div className="dga">
            <Btn size="sm" variant="primary" onClick={() => void actions.accept(task.id)}><Check />{t("ready.accept")}</Btn>
            <Btn size="sm" onClick={() => void actions.remove(task.id)}><X />{t("ready.reject")}</Btn>
          </div>
        </div>
      )}
      {task.source ? (
        <div className="sc">
          <div className="sch">{t("ready.source")}</div>
          <button
            type="button"
            className="scb"
            onClick={() => {
              if (task.source?.url) openExternal(task.source.url);
              else if (task.source?.kind === "brain") go("brain", task.source.reference);
              else if (task.source?.kind === "run") openRun(task.source.reference);
            }}
          >
            <ServiceIcon name={brandOf(task.source.kind)} size={20} fallback={task.source.kind} />
            <span className="grow">
              <b className="clip">{task.source.label ?? task.source.reference}</b>
              <small className="clip">{task.source.kind} · {task.source.reference}</small>
            </span>
            <ArrowUpRight size={14} className="faint" />
          </button>
        </div>
      ) : (
        <p className="hintp">{t("tasks.noSource")}</p>
      )}
      <Delegate task={task} actions={actions} names={names} />
      <div className="sch">{t("tasks.notes")}</div>
      <textarea
        className="ta nt"
        rows={3}
        placeholder={t("tasks.notesPlaceholder")}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        onBlur={() => notes !== (task.notes ?? "") && void actions.patch(task.id, { notes: notes || null })}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") event.currentTarget.blur();
        }}
      />
      <p className="est tn">{task.origin === "agent" ? t("tasks.fromAgent", { agent: agentName(task.agent_id ?? "", names) }) : t("tasks.created", { date: shortDate(task.created_at) })}</p>
      <div className="dfoot">
        {done ? (
          <Btn onClick={() => void actions.reopen(task.id)}><RotateCcw />{t("tasks.reopen")}</Btn>
        ) : !proposed ? (
          <Btn variant="primary" kbd="X" onClick={() => void actions.complete(task.id)}><Check />{t("tasks.done")}</Btn>
        ) : null}
        <span className="grow" />
        <Btn icon variant="ghost" aria-label={t("common.delete")} title={t("common.delete")} onClick={() => void actions.remove(task.id)}><Trash2 /></Btn>
      </div>
    </div>
  );
}

/** Hand the task to an agent; its report comes back onto the task, and anything it sends still waits for approval. */
function Delegate({ task, actions, names }: { task: Task; actions: Actions; names: Record<string, string> }) {
  const agents = useAgents();
  const list = agents.data ?? [];
  if (task.status === "proposed" || task.status === "done") return task.result ? <Result task={task} names={names} /> : null;
  return (
    <div className="sc">
      <div className="sch">{t("tasks.delegate")}</div>
      {task.delegated_agent ? (
        <>
          <p className="hintp">
            <Bot size={13} /> {task.result_status ? t("tasks.delegateDone", { agent: agentName(task.delegated_agent, names) }) : t("tasks.delegateRunning", { agent: agentName(task.delegated_agent, names) })}
            {task.delegated_run && <> · <button type="button" className="lnk" onClick={() => openRun(task.delegated_run!)}>{t("tasks.openRun")}</button></>}
          </p>
          {task.result && <Result task={task} names={names} />}
        </>
      ) : list.length ? (
        <Menu
          label={t("tasks.delegate")}
          items={list.map((agent) => ({ label: agent.name, icon: <Bot size={14} />, run: () => void actions.delegate(task.id, agent.id) }))}
          trigger={(open, isOpen) => <Btn size="sm" onClick={open} aria-expanded={isOpen}><Bot />{t("tasks.delegateTo")}<ChevronDown /></Btn>}
        />
      ) : (
        <p className="hintp">{t("tasks.noAgents")}</p>
      )}
      <p className="hintp">{t("tasks.delegateHint")}</p>
    </div>
  );
}

function Result({ task, names }: { task: Task; names: Record<string, string> }) {
  return (
    <div className="tas-dg">
      <div className="dgh">
        <Sparkles size={14} />
        {t("tasks.resultFrom", { agent: agentName(task.delegated_agent ?? "", names) })}
        {task.result_status && <Badge tone={task.result_status === "succeeded" ? "ok" : task.result_status === "failed" ? "bad" : ""}>{t(`tasks.result.${task.result_status as "succeeded"}`)}</Badge>}
      </div>
      <Markdown source={task.result ?? ""} />
    </div>
  );
}

export function Tasks() {
  useLanguage();
  const route = useRoute();
  const all = useTasks("all");
  const doneQuery = useTasks("done");
  const names = useAgentNames();
  const actions = useTaskActions();
  const undo = undoStore.use();
  const showDone = showDoneStore.use();
  const [tab, setTab] = useState<Tab>("all");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string[]>([]);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseTask(text), [text]);

  const tasks = all.data ?? [];
  const open = tasks.filter((task) => task.status === "open");
  const proposed = tasks.filter((task) => task.status === "proposed");
  const done = doneQuery.data ?? [];
  const groups = GROUPS.map((group) => ({ group, items: open.filter((task) => groupOf(task.due_on) === group) }));
  const shownGroups = tab === "all" ? groups : groups.filter((entry) => entry.group === tab);
  const flat: Task[] = [
    ...shownGroups.flatMap((entry) => entry.items),
    ...(tab === "all" || tab === "proposed" ? proposed : []),
    ...((tab === "all" && showDone) || tab === "done" ? done : []),
  ];
  const selected = route.param;
  const current = flat.find((task) => task.id === selected) ?? [...tasks, ...done].find((task) => task.id === selected) ?? flat[0] ?? null;
  const position = current ? flat.findIndex((task) => task.id === current.id) : -1;
  const select = (id: string) => go("tasks", id);

  const add = async () => {
    if (!parsed.title) return;
    const created = await actions.create({ title: parsed.title, due_on: parsed.due, priority: parsed.priority });
    setText("");
    if (created) select(created.id);
  };

  const finish = (task: Task) => {
    if (task.status === "done") {
      void actions.reopen(task.id);
      return;
    }
    const index = flat.findIndex((item) => item.id === task.id);
    const next = flat.slice(index + 1).find((item) => item.status === "open") ?? flat.slice(0, index).reverse().find((item) => item.status === "open");
    setLeaving((list) => [...list, task.id]);
    setTimeout(() => {
      void actions.complete(task.id).finally(() => setLeaving((list) => list.filter((id) => id !== task.id)));
    }, 360);
    pushUndo(t("tasks.completed", { title: task.title }), () => void actions.reopen(task.id));
    if (current?.id === task.id && next) select(next.id);
  };

  const remove = (task: Task) => {
    void actions.remove(task.id);
    pushUndo(t("tasks.deleted", { title: task.title }), () =>
      void actions.create({ title: task.title, due_on: task.due_on, notes: task.notes, priority: task.priority, source: task.source }),
    );
  };

  /** Moves a task before another one, or to the top of a group, and stores the new order. */
  const move = (id: string, target: { before?: string; group?: DueGroup }) => {
    const task = open.find((item) => item.id === id);
    if (!task) return;
    const goal = target.group ?? groupOf(open.find((item) => item.id === target.before)?.due_on);
    if (goal !== groupOf(task.due_on)) setDue(actions, task, dueFor(goal));
    const ids = open.map((item) => item.id).filter((item) => item !== id);
    const index = target.before ? ids.indexOf(target.before) : ids.findIndex((item) => groupOf(open.find((task) => task.id === item)?.due_on) === goal);
    ids.splice(index < 0 ? ids.length : index, 0, id);
    void actions.order(ids);
  };

  const shift = (step: number) => {
    if (!current || current.status !== "open") return;
    const group = groups.find((entry) => entry.items.some((task) => task.id === current.id));
    if (!group) return;
    const index = group.items.findIndex((task) => task.id === current.id);
    const target = group.items[index + step];
    if (target) {
      const ids = open.map((item) => item.id);
      const from = ids.indexOf(current.id);
      const to = ids.indexOf(target.id);
      [ids[from], ids[to]] = [ids[to]!, ids[from]!];
      void actions.order(ids);
      return;
    }
    const next = GROUPS[GROUPS.indexOf(group.group) + step];
    if (next) setDue(actions, current, dueFor(next));
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement;
      if (event.key === "Escape" && element === input.current) {
        setText("");
        element.blur();
        return;
      }
      if (element.closest("input, textarea, [contenteditable='true']") || document.querySelector(".palbg, .modalbg, .menu")) return;
      if (event.metaKey || event.ctrlKey) return;
      const press = event.key.toLowerCase();
      if (event.altKey && (press === "arrowup" || press === "arrowdown")) {
        event.preventDefault();
        shift(press === "arrowup" ? -1 : 1);
        return;
      }
      if (event.altKey) return;
      if (press === "n" || press === "/") {
        event.preventDefault();
        input.current?.focus();
        return;
      }
      if (press === "z") {
        runUndo();
        return;
      }
      if (press === "arrowdown" || press === "j") {
        event.preventDefault();
        const next = flat[Math.min(flat.length - 1, position + 1)];
        if (next) select(next.id);
        return;
      }
      if (press === "arrowup" || press === "k") {
        event.preventDefault();
        if (position <= 0) input.current?.focus();
        else select(flat[position - 1]!.id);
        return;
      }
      if (!current) return;
      if (press === "x" || press === " ") {
        event.preventDefault();
        if (current.status !== "proposed") finish(current);
      }
      if (press === "e") {
        event.preventDefault();
        setEditing(current.id);
      }
      if (press === "d") document.querySelector<HTMLElement>(`[data-task="${current.id}"] .due`)?.click();
      if (press === "f") void actions.patch(current.id, { priority: current.priority > 0 ? 0 : 3 });
      if (press === "backspace" || press === "delete") remove(current);
      if (press === "1") setDue(actions, current, dueFor("today"));
      if (press === "2") setDue(actions, current, dueFor("tomorrow"));
      if (press === "3") setDue(actions, current, dueFor("week"));
      if (press === "4") setDue(actions, current, null);
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  });

  useEffect(() => {
    if (current) document.querySelector(`[data-task="${current.id}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dragProps = (task: Task) => ({
    dragging: dragged === task.id,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
      setDragged(task.id);
    },
    onDragOver: (event: DragEvent) => {
      if (!dragged || dragged === task.id) return;
      event.preventDefault();
      setOver(task.id);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      if (dragged && dragged !== task.id) move(dragged, { before: task.id });
      setDragged(null);
      setOver(null);
    },
    onDragEnd: () => {
      setDragged(null);
      setOver(null);
    },
  });

  const counts: Record<Tab, number> = {
    all: open.length + proposed.length,
    today: groups[0]!.items.length,
    tomorrow: groups[1]!.items.length,
    week: groups[2]!.items.length,
    later: groups[3]!.items.length,
    proposed: proposed.length,
    done: done.length,
  };

  return (
    <div className="page flush">
      <div className="tkx">
        <div className="tk-m">
          <div className="tk-in">
            <header className="tk-h">
              <div className="grow">
                <h1>{t("nav.tasks")}</h1>
                <p>{t("tasks.lead")}</p>
              </div>
            </header>
            <form
              className="tk-cap"
              onSubmit={(event) => {
                event.preventDefault();
                void add();
              }}
            >
              <Plus size={16} className="faint" />
              <input
                ref={input}
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-label={t("tasks.new")}
                placeholder={t("tasks.placeholder")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
              {!text && <kbd>N</kbd>}
              {text && <Btn size="xs" variant="primary" type="submit" kbd="↵">{t("tasks.add")}</Btn>}
            </form>
            <div className="tk-pv">
              {text ? (
                <>
                  <span className="faint">{t("tasks.understood")}</span>
                  <span className="v clip">{parsed.title || "…"}</span>
                  <Badge tone={parsed.dueWord ? "info" : ""}><Calendar size={11} />{dueLabel(parsed.due)}</Badge>
                  {parsed.priority > 0 && <Badge tone="warn"><Flag size={11} />{t("tasks.important")}</Badge>}
                </>
              ) : (
                <span className="faint">{t("tasks.parseHint")}</span>
              )}
            </div>
            <div className="tk-tb">
              <Seg<Tab>
                label={t("tasks.view")}
                value={tab}
                onChange={setTab}
                options={[
                  ["all", t("approvals.filterAll"), counts.all],
                  ["today", t("today.today"), counts.today],
                  ["week", t("tasks.group.week"), counts.week + counts.tomorrow],
                  ["later", t("tasks.group.later"), counts.later],
                  ["proposed", t("tasks.proposed"), counts.proposed],
                  ["done", t("tasks.doneTab"), counts.done],
                ]}
              />
            </div>
            <Failure error={all.error ?? doneQuery.error} />
            {all.isPending ? (
              <Skeleton count={6} height={40} />
            ) : (
              <div className="tk-l" role="listbox" aria-label={t("nav.tasks")}>
                {shownGroups.map(({ group, items }) =>
                  items.length > 0 || tab === group || dragged ? (
                    <section key={group}>
                      <div
                        className={`tk-g ${over === `group:${group}` ? "over" : ""}`}
                        onDragOver={(event) => {
                          if (!dragged) return;
                          event.preventDefault();
                          setOver(`group:${group}`);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (dragged) move(dragged, { group });
                          setDragged(null);
                          setOver(null);
                        }}
                      >
                        {groupLabel(group)}
                        <em>{items.length}</em>
                      </div>
                      {items.map((task) => (
                        <Row
                          key={task.id}
                          task={task}
                          selected={task.id === current?.id}
                          editing={editing === task.id}
                          leaving={leaving.includes(task.id)}
                          over={over === task.id}
                          actions={actions}
                          onSelect={() => select(task.id)}
                          onDone={() => finish(task)}
                          onEdit={(value) => setEditing(value ? task.id : null)}
                          drag={dragProps(task)}
                        />
                      ))}
                    </section>
                  ) : null,
                )}
                {tab === "all" && open.length === 0 && proposed.length === 0 && (
                  <div className="tk-zero">
                    <Sparkles size={22} className="warnc" />
                    <b>{t("tasks.allDone")}</b>
                    <span>{t("tasks.allDoneHint")}</span>
                  </div>
                )}
                {flat.length === 0 && tab !== "all" && (
                  <Empty
                    icon={<Check size={20} />}
                    title={tab === "done" ? t("tasks.noneDone") : tab === "proposed" ? t("tasks.noneProposed") : t("tasks.noneOpen")}
                    sub={t("tasks.typeAbove")}
                    action={<Btn size="sm" onClick={() => setTab("all")}>{t("connections.showAll")}</Btn>}
                  />
                )}
                {(tab === "all" || tab === "proposed") && proposed.length > 0 && (
                  <section>
                    <div className="tk-g">
                      {t("tasks.couldAdd")}
                      <small>{t("tasks.fromAgents")}</small>
                    </div>
                    {proposed.map((task) => (
                      <div key={task.id} data-task={task.id} className={`tk-s ${task.id === current?.id ? "on" : ""}`} onClick={() => select(task.id)}>
                        <span className="gr" />
                        <button
                          type="button"
                          className="pl"
                          aria-label={t("tasks.acceptNamed", { title: task.title })}
                          title={t("ready.accept")}
                          onClick={(event) => {
                            event.stopPropagation();
                            void actions.accept(task.id);
                          }}
                        >
                          <Plus size={12} />
                        </button>
                        <span className="tx clip">{task.title}</span>
                        <span className="wy clip">{task.notes ?? agentName(task.agent_id ?? "", names)}</span>
                        <span className="grow" />
                        {task.source && <SourceChip source={task.source} mini />}
                        <Btn icon size="xs" variant="ghost" aria-label={t("ready.reject")} onClick={() => void actions.remove(task.id)}><X /></Btn>
                      </div>
                    ))}
                  </section>
                )}
                {tab === "all" && done.length > 0 && (
                  <section>
                    <button type="button" className="tk-g tgl" aria-expanded={showDone} onClick={() => showDoneStore.set(!showDone)}>
                      {t("tasks.doneTab")}
                      <em>{done.length}</em>
                      <ChevronDown size={14} style={{ transform: showDone ? "none" : "rotate(-90deg)", transition: "transform var(--fast)" }} />
                    </button>
                  </section>
                )}
                {((tab === "all" && showDone) || tab === "done") &&
                  done.map((task) => (
                    <div key={task.id} data-task={task.id} className={`tk-r dn ${task.id === current?.id ? "on" : ""}`} onClick={() => select(task.id)}>
                      <span className="gr" />
                      <CheckBox on label={t("tasks.reopenNamed", { title: task.title })} onChange={() => finish(task)} />
                      <span className="tt clip">{task.title}</span>
                      {task.source && <ServiceIcon name={brandOf(task.source.kind)} size={14} fallback={task.source.kind} />}
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div className="tk-keys">
            <span><kbd>↑</kbd><kbd>↓</kbd> {t("palette.choose")}</span>
            <span><kbd>X</kbd> {t("tasks.keyDone")}</span>
            <span><kbd>D</kbd> {t("tasks.due")}</span>
            <span><kbd>E</kbd> {t("tasks.keyRename")}</span>
            <span><kbd>F</kbd> {t("tasks.importantShort")}</span>
            <span><kbd>⌥</kbd><kbd>↕</kbd> {t("tasks.keyMove")}</span>
            <span><kbd>Z</kbd> {t("ui.undo")}</span>
          </div>
          {undo && (
            <div key={undo.id} className="tk-undo" style={{ transform: "translateX(-50%)" }}>
              <span className="clip">{undo.text}</span>
              <button type="button" onClick={runUndo}>{t("ui.undo")}</button>
              <kbd>Z</kbd>
            </div>
          )}
        </div>
        <aside className="tk-a" aria-label={t("tasks.task")}>
          {current ? <Detail task={current} actions={actions} names={names} /> : <div className="tk-zero"><span>{t("tasks.pick")}</span></div>}
        </aside>
      </div>
    </div>
  );
}
