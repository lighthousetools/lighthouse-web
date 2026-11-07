import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, FileCode2, Hand, LayoutGrid, ListChecks, Monitor, Pause, Play, Search, Terminal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { sessionKey, useNodes, usePermissions, useSessions } from "../data";
import { dateTime, dayTime, euro, statusLabel, time } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { Btn, Dot, Empty, Failure, Progress, Seg, ServiceIcon, Skeleton, type Tone } from "../ui";
import { DiffViewer, parseUnifiedDiff, type DiffFile } from "../ui/diff";
import { Elapsed } from "../ui/live";
import { Markdown } from "../ui/markdown";
import { plainFields } from "./Decisions";
import "./sessions.css";

type Session = Schemas["Session"];

const PILL: Record<string, Tone> = { waiting: "warn", running: "info", done: "ok", succeeded: "ok" };
const GROUPS = ["waiting", "running", "other"] as const;
type Group = (typeof GROUPS)[number];

export function groupOfSession(session: Session): Group {
  return session.status === "waiting" ? "waiting" : session.status === "running" ? "running" : "other";
}

const groupLabel = (group: Group) =>
  group === "waiting" ? t("sessions.needsYou") : group === "running" ? t("sessions.running") : t("sessions.done");

function dotTone(session: Session): Tone | "live" {
  return session.status === "waiting" ? "warn" : session.status === "running" ? "live" : session.status === "done" ? "ok" : "";
}

function SessionRow({ session, on }: { session: Session; on: boolean }) {
  return (
    <button
      type="button"
      className={`cl-sr ${on ? "on" : ""} ${session.status === "waiting" ? "ask" : ""}`}
      aria-current={on || undefined}
      onClick={() => go("sessions", sessionKey(session))}
    >
      <Dot tone={dotTone(session)} />
      <span className="grow">
        <span className="tt clip">{session.project}</span>
        <span className="z-st clip">{[session.branch, session.node_name].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="rt tn">
        {time(session.updated_at)}
        <small>{euro(session.cost_eur)}</small>
      </span>
    </button>
  );
}

function usePause() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) =>
      must(api.PATCH("/nodes/{id}", { params: { path: { id } }, body: { paused } })),
    onSuccess: (_, { paused }) => {
      toast(paused ? t("sessions.pausedToast") : t("sessions.resumedToast"));
      void client.invalidateQueries({ queryKey: ["nodes"] });
      void client.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
}

function Rail({ sessions, current, nodes }: { sessions: Session[]; current?: string; nodes: Schemas["Node"][] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = sessions.filter((session) => !needle || `${session.project} ${session.branch ?? ""} ${session.node_name} ${session.summary ?? ""}`.toLowerCase().includes(needle));
  const today = new Date().toISOString().slice(0, 10);
  const spent = sessions.filter((session) => session.updated_at.slice(0, 10) === today).reduce((sum, session) => sum + session.cost_eur, 0);
  return (
    <div className="cl-rail">
      <div className="top">
        <h1>{t("nav.sessions")}</h1>
      </div>
      <label className="cl-find">
        <Search size={13} className="faint" />
        <input aria-label={t("sessions.search")} placeholder={t("sessions.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && (
          <button type="button" aria-label={t("common.clear")} onClick={() => setQuery("")}>
            <X size={12} />
          </button>
        )}
      </label>
      <button type="button" className={`cl-all ${current ? "" : "on"}`} onClick={() => go("sessions")}>
        <LayoutGrid size={14} />
        <span className="grow">{t("sessions.all")}</span>
        <em>{sessions.length}</em>
      </button>
      <div className="list">
        {GROUPS.map((group) => {
          const list = shown.filter((session) => groupOfSession(session) === group);
          if (!list.length) return null;
          return (
            <div key={group}>
              <div className="gr">
                {groupLabel(group)}
                <em>{list.length}</em>
              </div>
              {list.map((session) => (
                <SessionRow key={sessionKey(session)} session={session} on={sessionKey(session) === current} />
              ))}
            </div>
          );
        })}
        {!shown.length && <p className="cl-none" style={{ padding: "12px 8px" }}>{needle ? t("palette.empty") : t("sessions.empty")}</p>}
      </div>
      <div className="foot">
        {nodes.map((node) => {
          const active = sessions.filter((session) => session.node_id === node.id && session.status === "running").length;
          return (
            <div key={node.id} className="z-mc">
              <Dot tone={node.paused ? "warn" : node.online ? "ok" : ""} />
              <span className="grow clip">
                {node.name}
                <small>{node.paused ? t("sessions.paused") : node.online ? t("sessions.online") : t("sessions.offline")}</small>
              </span>
              <span className="faint tn">{t("sessions.active", { count: active })}</span>
            </div>
          );
        })}
        <div className="bud faint">
          <span>{t("today.today")}</span>
          <span className="tn" style={{ color: "var(--ink)" }}>{euro(spent)}</span>
        </div>
      </div>
    </div>
  );
}

function Machines({ nodes }: { nodes: Schemas["Node"][] }) {
  const pause = usePause();
  return (
    <section>
      <div className="sect">
        <Monitor size={15} />
        {t("sessions.machines")}
        <small>{nodes.length}</small>
      </div>
      {nodes.length === 0 && <p className="cl-none">{t("sessions.none")} {t("sessions.noneHint")}</p>}
      {nodes.map((node) => (
        <div key={node.id} className="cl-mach">
          <Dot tone={node.paused ? "warn" : node.online ? "ok" : ""} />
          <span className="grow">
            <b className="clip">{node.name}</b>
            <small>
              {node.paused ? t("sessions.paused") : node.online ? t("sessions.online") : t("sessions.offline")} · {dayTime(node.last_seen_at)}
            </small>
          </span>
          <Btn
            size="xs"
            variant={node.paused ? "" : "danger"}
            disabled={pause.isPending}
            title={node.paused ? t("sessions.resume") : t("sessions.pause")}
            onClick={() => pause.mutate({ id: node.id, paused: !node.paused })}
          >
            {node.paused ? <Play /> : <Pause />}
            {node.paused ? t("sessions.resume") : t("sessions.pauseShort")}
          </Btn>
        </div>
      ))}
    </section>
  );
}

function Request({ request }: { request: Schemas["Permission"] }) {
  const client = useQueryClient();
  const decide = useMutation({
    mutationFn: (allow: boolean) =>
      must(api.POST("/permissions/{id}/decision", { params: { path: { id: request.id } }, body: { allow } })),
    onSuccess: (_, allow) => {
      toast(allow ? t("status.allowed") : t("status.denied"));
      void client.invalidateQueries({ queryKey: ["permissions"] });
      void client.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
  const fields = plainFields(request.input);
  const first = fields[0];
  return (
    <div className="cl-dec">
      <div className="top">
        <span className="ic"><Hand size={16} /></span>
        <span className="grow">
          <div className="q">{t("approvals.claudeWants", { tool: request.tool })}</div>
          <div className="why">{request.project}</div>
        </span>
      </div>
      {first && (
        <div className="pv">
          <b>{first.label}</b>
          <span className="mono clip">{first.value}</span>
        </div>
      )}
      <Failure error={decide.error} />
      <div className="ft">
        <Btn size="sm" variant="primary" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
          <Check />
          {t("approvals.allow")}
        </Btn>
        <Btn size="sm" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
          <X />
          {t("approvals.deny")}
        </Btn>
        <span className="grow" />
        <span className="w faint tn">{t("sessions.waitingSince")} <Elapsed from={Date.parse(request.created_at)} /></span>
      </div>
    </div>
  );
}

type Todo = { content?: string; status?: string; activeForm?: string };

/** The todo list a session wrote, whatever shape the tool input had. */
export function todosOf(value: unknown): Todo[] {
  const list = Array.isArray(value) ? value : (value as { todos?: unknown } | null)?.todos;
  return Array.isArray(list) ? (list as Todo[]).filter((todo) => todo && typeof todo === "object") : [];
}

/** A changed file's diff from the desktop agent, as hunks for the diff viewer. */
export function sessionDiff(file: Schemas["ChangedFile"]): DiffFile {
  const text = file.diff ?? "";
  const parsed = text.includes("@@") ? parseUnifiedDiff(text.includes("+++ ") ? text : `+++ b/${file.path}\n${text}`)[0] : undefined;
  return parsed ? { ...parsed, path: file.path } : { path: file.path, add: 0, del: 0, hunks: [] };
}

function useSessionDetail(session: Session) {
  return useQuery({
    queryKey: ["sessions", "detail", session.node_id, session.id],
    queryFn: () => must(api.GET("/sessions/{node}/{id}", { params: { path: { node: session.node_id, id: session.id } } })),
  });
}

function Composer({ session, pending }: { session: Session; pending: number }) {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () => must(api.POST("/sessions/{node}/{id}/messages", { params: { path: { node: session.node_id, id: session.id } }, body: { text: text.trim() } })),
    onSuccess: () => {
      setText("");
      toast(t("sessions.messageQueued"));
      void client.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const idle = session.status !== "running";
  return (
    <div className="cl-comp">
      <div className="box">
        <textarea
          rows={2}
          aria-label={t("sessions.message")}
          placeholder={t("sessions.messagePlaceholder")}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && text.trim()) {
              event.preventDefault();
              send.mutate();
            }
          }}
        />
        <div className="ft">
          <span className="tag"><Monitor size={12} />{session.node_name}</span>
          <span className="hint grow">{idle ? t("sessions.nextStopIdle") : t("sessions.nextStop")}{pending ? ` · ${t("sessions.pending", { count: pending })}` : ""}</span>
          <Btn icon size="sm" variant="primary" aria-label={t("sessions.send")} disabled={!text.trim() || send.isPending} onClick={() => send.mutate()}><ArrowUp /></Btn>
        </div>
      </div>
    </div>
  );
}

function Timeline({ detail }: { detail: Schemas["SessionDetail"] }) {
  const entries = [
    ...detail.timeline.map((event) => ({ at: event.created_at, kind: "event" as const, event })),
    ...detail.messages.map((message) => ({ at: message.created_at, kind: "message" as const, message })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  if (!entries.length) return <p className="cl-dim">{t("sessions.noTimeline")}</p>;
  return (
    <>
      {entries.map((entry, index) =>
        entry.kind === "message" ? (
          <div key={`m${index}`} className="cl-me">
            <div>
              {entry.message.text}
              <span className="cl-dim" style={{ display: "block", marginTop: 4 }}>
                {entry.message.status === "pending" ? t("sessions.waitsForStop") : t("sessions.delivered", { time: time(entry.message.delivered_at ?? entry.message.created_at) })}
              </span>
            </div>
          </div>
        ) : entry.event.kind === "prompt" ? (
          <div key={`e${index}`} className="cl-me"><div>{entry.event.summary}</div></div>
        ) : entry.event.kind === "stop" ? (
          <div key={`e${index}`} className="cl-say">{entry.event.summary ? <Markdown source={entry.event.summary} /> : <span className="cl-dim">{t("sessions.stopped", { time: time(entry.event.created_at) })}</span>}</div>
        ) : (
          <div key={`e${index}`} className="cl-asked">
            {entry.event.file_path ? <FileCode2 size={13} className="faint" /> : <Terminal size={13} className="faint" />}
            <span className="mono clip" style={{ fontSize: 12 }}>{entry.event.tool ?? entry.event.kind}</span>
            <span className="clip faint" style={{ fontSize: 12 }}>{entry.event.summary ?? entry.event.file_path}</span>
            <span className="grow" />
            <span className="faint tn" style={{ fontSize: 11 }}>{time(entry.event.created_at)}</span>
          </div>
        ),
      )}
    </>
  );
}

function Live({ session, nodes, requests }: { session: Session; nodes: Schemas["Node"][]; requests: Schemas["Permission"][] }) {
  const tone = PILL[session.status] ?? "";
  const running = session.status === "running";
  const detail = useSessionDetail(session);
  const [tab, setTab] = useState<"timeline" | "diff">("timeline");
  const [split, setSplit] = useState(false);
  const todos = todosOf(detail.data?.todos);
  const files = detail.data?.files ?? [];
  const pending = (detail.data?.messages ?? []).filter((message) => message.status === "pending").length;
  const doneTodos = todos.filter((todo) => todo.status === "completed").length;
  const stream = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stream.current?.scrollTo?.({ top: stream.current.scrollHeight });
  }, [detail.data?.timeline.length, detail.data?.messages.length]);
  return (
    <>
      <div className="cl-main">
        <div className="cl-lh">
          <ServiceIcon name="claude" size={18} />
          <h2 className="clip">{session.project}</h2>
          <span className={`cl-pill ${tone}`}>
            <Dot tone={dotTone(session)} />
            {session.status === "waiting" ? t("sessions.needsYouShort") : statusLabel(session.status)}
          </span>
          <span className="grow" />
          <span className="repo">{session.node_name}</span>
        </div>
        <div className="cl-bar">
          {todos.length > 0 && <div className="cl-prog"><Progress value={(doneTodos / todos.length) * 100} /></div>}
          <dl>
            <div>
              <dt>{t("sessions.project")}</dt>
              <dd className="rp clip"><Terminal size={13} className="faint" />{session.project}</dd>
            </div>
            <div>
              <dt>{t("sessions.branch")}</dt>
              <dd className="clip mono" style={{ fontSize: 12 }}>{session.branch ?? t("common.none")}</dd>
            </div>
            <div>
              <dt>{t("sessions.steps")}</dt>
              <dd className="tn">{todos.length ? `${doneTodos} / ${todos.length}` : t("common.none")}</dd>
            </div>
            <div>
              <dt>{t("sessions.time")}</dt>
              <dd>{running ? <Elapsed from={Date.parse(session.started_at)} /> : <span className="tn">{time(session.started_at)}</span>}</dd>
            </div>
            <div>
              <dt>{t("sessions.filesShort")}</dt>
              <dd className="tn">{files.length}</dd>
            </div>
          </dl>
        </div>
        <div className="cl-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "timeline"} className={tab === "timeline" ? "on" : ""} onClick={() => setTab("timeline")}>{t("sessions.timeline")}</button>
          <button type="button" role="tab" aria-selected={tab === "diff"} className={tab === "diff" ? "on" : ""} onClick={() => setTab("diff")}>{t("sessions.diff")} <span className="faint">{files.length}</span></button>
        </div>
        <div className="cl-sw">
          {tab === "timeline" ? (
            <div className="cl-stream" ref={stream}>
              <div className="col">
                <p className="cl-dim">{t("sessions.startedOn", { node: session.node_name, time: dateTime(session.started_at) })}</p>
                {detail.isPending && <Skeleton count={4} height={28} />}
                <Failure error={detail.error} />
                {detail.data && <Timeline detail={detail.data} />}
                {session.summary && !detail.data?.timeline.length && <div className="cl-say"><Markdown source={session.summary} /></div>}
                {running && (
                  <div className="cl-think">
                    <Terminal size={13} />
                    <span className="cl-shim">{t("sessions.working")}</span>
                  </div>
                )}
                {session.status === "done" && <div className="cl-ok"><Check size={14} />{t("sessions.finished", { time: time(session.updated_at) })}</div>}
              </div>
            </div>
          ) : (
            <div className="cl-diff">
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <Seg label={t("code.diffMode")} value={split ? "split" : "unified"} onChange={(value) => setSplit(value === "split")} options={[["unified", t("code.unified")], ["split", t("code.split")]]} />
              </div>
              {files.length ? <DiffViewer files={files.map(sessionDiff)} sideBySide={split} /> : <Empty title={t("sessions.noFiles")} sub={t("sessions.noFilesHint")} />}
            </div>
          )}
        </div>
        {requests.map((request) => (
          <Request key={request.id} request={request} />
        ))}
        <Composer session={session} pending={pending} />
      </div>
      <aside className="cl-side">
        <div className="cl-sp">
          <section>
            <div className="sect"><ListChecks size={15} />{t("sessions.plan")}<small>{todos.length ? t("sessions.stepOf", { done: doneTodos, count: todos.length }) : ""}</small></div>
            {todos.length > 0 ? (
              <ul className="cl-plan">
                {todos.map((todo, index) => (
                  <li key={index} className={todo.status === "completed" ? "done" : todo.status === "in_progress" ? "now" : ""}>
                    <i>{todo.status === "completed" ? <Check size={11} /> : index + 1}</i>
                    <span className="clip">{todo.status === "in_progress" ? todo.activeForm ?? todo.content : todo.content}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cl-none">{t("sessions.noTodos")}</p>
            )}
            {detail.data?.plan && <div style={{ marginTop: 10, fontSize: 13 }}><Markdown source={detail.data.plan} /></div>}
          </section>
          <section>
            <div className="sect"><FileCode2 size={15} />{t("sessions.files")}<small>{files.length}</small></div>
            <div className="cl-files">
              {files.map((file) => {
                const diff = sessionDiff(file);
                return (
                  <button type="button" key={file.path} onClick={() => setTab("diff")} title={file.path}>
                    <span className="mono clip">{file.path.split("/").pop()}</span>
                    <span className="dn"><b>+{diff.add}</b><i>−{diff.del}</i></span>
                  </button>
                );
              })}
              {files.length === 0 && <p className="cl-none">{t("sessions.noFiles")}</p>}
            </div>
          </section>
          <Machines nodes={nodes} />
          <section>
            <div className="sect">
              <Hand size={15} />
              {t("sessions.requests")}
              <small>{requests.length}</small>
            </div>
            {requests.length === 0 ? (
              <p className="cl-none">{t("sessions.noRequests")}</p>
            ) : (
              <ul className="cl-rules">
                {requests.map((request) => (
                  <li key={request.id}><Hand size={12} className="warnc" />{request.tool}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}

function Card({ session }: { session: Session }) {
  return (
    <div
      className={`cl-card ${session.status === "waiting" ? "ask" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => go("sessions", sessionKey(session))}
      onKeyDown={(event) => event.key === "Enter" && go("sessions", sessionKey(session))}
    >
      <div className="t clip">{session.project}</div>
      <div className="m">
        <Dot tone={dotTone(session)} />
        <span className="clip">{[session.branch, session.node_name].filter(Boolean).join(" · ")}</span>
      </div>
      {session.summary && <div className="l">{session.summary.split("\n")[0]}</div>}
      <div className="z-b tn">
        <span className="grow">{dayTime(session.updated_at)}</span>
        {euro(session.cost_eur)}
      </div>
    </div>
  );
}

function Overview({ sessions, nodes }: { sessions: Session[]; nodes: Schemas["Node"][] }) {
  const today = new Date().toISOString().slice(0, 10);
  const spent = sessions.filter((session) => session.updated_at.slice(0, 10) === today).reduce((sum, session) => sum + session.cost_eur, 0);
  const by = (group: Group) => sessions.filter((session) => groupOfSession(session) === group);
  return (
    <div className="cl-ov">
      <div className="z-hd">
        <div>
          <h2>{t("nav.sessions")}</h2>
          <p>{t("sessions.lead")}</p>
        </div>
      </div>
      <dl className="cl-st">
        <div><dt>{t("sessions.needsYou")}</dt><dd className="tn">{by("waiting").length}</dd></div>
        <div><dt>{t("sessions.running")}</dt><dd className="tn">{by("running").length}</dd></div>
        <div><dt>{t("sessions.machinesOnline")}</dt><dd className="tn">{nodes.filter((node) => node.online).length} / {nodes.length}</dd></div>
        <div><dt>{t("sessions.costToday")}</dt><dd className="tn">{euro(spent)}</dd></div>
      </dl>
      {sessions.length === 0 ? (
        <Empty
          icon={<Terminal />}
          title={nodes.length ? t("sessions.empty") : t("sessions.none")}
          sub={nodes.length ? t("sessions.emptyHint") : t("sessions.noneHint")}
          action={!nodes.length && <Btn onClick={() => go("settings", "devices")}>{t("sessions.addMachine")}</Btn>}
        />
      ) : (
        <div className="cl-board">
          {GROUPS.map((group) => (
            <section key={group}>
              <div className="ch2">
                {groupLabel(group)}
                <em>{by(group).length}</em>
              </div>
              {by(group).map((session) => (
                <Card key={sessionKey(session)} session={session} />
              ))}
              {by(group).length === 0 && <div className="cl-empty">{t("sessions.columnEmpty")}</div>}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sessions() {
  useLanguage();
  const route = useRoute();
  const sessions = useSessions();
  const nodes = useNodes();
  const permissions = usePermissions();
  const list = useMemo(
    () => [...(sessions.data ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [sessions.data],
  );
  const current = list.find((session) => sessionKey(session) === route.param);
  const requests = (permissions.data ?? []).filter(
    (request) => current && request.session_id === current.id && request.node_id === current.node_id,
  );
  return (
    <div className="page flush">
      <div className="clv">
        <Rail sessions={list} current={current ? sessionKey(current) : undefined} nodes={nodes.data ?? []} />
        {sessions.isPending ? (
          <div className="cl-ov"><Skeleton count={5} /></div>
        ) : sessions.isError ? (
          <div className="cl-ov"><Failure error={sessions.error} /></div>
        ) : current ? (
          <Live session={current} nodes={nodes.data ?? []} requests={requests} />
        ) : (
          <Overview sessions={list} nodes={nodes.data ?? []} />
        )}
      </div>
    </div>
  );
}
