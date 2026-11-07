import { ArrowLeft, ChevronRight, CircleDashed, CircleDot, CheckCircle2, ExternalLink, Layers, Plus, Search, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { shortDate, dayTime } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { createStore } from "../store";
import { Avatar, Btn, Empty, Failure, Field, Kbd, Modal, Progress, Skeleton } from "../ui";
import { Select } from "../ui/select";
import { Markdown } from "../ui/markdown";
import { Freshness, NoSource, canDo, field, has, openItem, useAction, useDomains, useItem, useItems, useSources, type Item } from "./connected";
import "./linear.css";

type Tab = "open" | "mine" | "all" | "projects" | "cycles";
const collapsedStore = createStore<string[]>([]);

/** Workflow order of common issue states, so groups read from active to done. */
const ORDER = ["in progress", "started", "in review", "todo", "unstarted", "backlog", "triage", "done", "completed", "canceled", "cancelled"];
export function stateRank(state: string | null | undefined) {
  const index = ORDER.indexOf((state ?? "").toLowerCase());
  return index === -1 ? ORDER.length : index;
}

/** Issues grouped by state, in workflow order. */
export function groupByState(items: Item[]) {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.state ?? "—";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].sort(([a], [b]) => stateRank(a) - stateRank(b) || a.localeCompare(b));
}

function StateIcon({ state }: { state: string | null | undefined }) {
  const value = (state ?? "").toLowerCase();
  if (["done", "completed"].includes(value)) return <CheckCircle2 size={14} style={{ color: "var(--vio)" }} />;
  if (["in progress", "started", "in review"].includes(value)) return <CircleDot size={14} style={{ color: "var(--warn)" }} />;
  return <CircleDashed size={14} className="faint" />;
}

const identifier = (item: Item) => field(item, "identifier") ?? field(item, "key") ?? item.external_id.slice(0, 8);

function Detail({ id, states }: { id: string; states: string[] }) {
  const detail = useItem(id);
  const sources = useSources();
  const action = useAction();
  const [comment, setComment] = useState("");
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !(event.target as HTMLElement).closest("input, textarea") && !document.querySelector(".palbg, .modalbg, .menu")) go("issues");
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  if (!detail.data) {
    return <div className="ln-detail"><div className="ln-dinner">{detail.isPending ? <Skeleton count={4} /> : <Failure error={detail.error} />}</div></div>;
  }
  const item = detail.data.item;
  const comments = detail.data.children.filter((child) => child.kind === "comment");
  const description = field(item, "description") ?? item.summary ?? "";
  const canComment = canDo(sources.data, "issues", "comment", item.source);
  const canUpdate = canDo(sources.data, "issues", "update", item.source);
  return (
    <div className="ln-detail">
      <div className="ln-dbar">
        <Btn icon size="xs" variant="ghost" aria-label={t("common.back")} onClick={() => go("issues")}><ArrowLeft /></Btn>
        <button type="button" className="ln-crumb" onClick={() => go("issues")}>{t("nav.issues")}</button>
        <ChevronRight size={12} className="faint" />
        <span className="mono">{identifier(item)}</span>
        <span className="grow" />
        {item.url && <Btn size="sm" variant="ghost" onClick={() => openItem(item)}><ExternalLink />{t("connected.openIn")}</Btn>}
        <Btn icon size="xs" variant="ghost" aria-label={t("common.close")} onClick={() => go("issues")}><X /></Btn>
      </div>
      <div className="ln-dmain">
        <div className="ln-dcol">
          <div className="ln-dinner">
            <div className="ln-dti">{item.title}</div>
            <div className="ln-dde">{description ? <Markdown source={description} /> : <span className="faint">{t("issues.noDescription")}</span>}</div>
            <section>
              <h3>{t("issues.activity")}<small>{comments.length}</small></h3>
              <div className="ln-feed">
                {comments.map((entry) => (
                  <div key={entry.id} style={{ display: "flex", gap: 10, padding: "8px 0" }}>
                    <span style={{ flex: "none" }}><Avatar name={entry.author ?? "?"} size={22} /></span>
                    <div className="grow">
                      <div style={{ fontSize: 12 }}><b style={{ fontWeight: 500 }}>{entry.author}</b> <span className="faint">{entry.occurred_at ? dayTime(entry.occurred_at) : ""}</span></div>
                      <Markdown source={field(entry, "body") ?? entry.summary ?? entry.title ?? ""} />
                    </div>
                  </div>
                ))}
                {comments.length === 0 && <p className="faint" style={{ fontSize: 13 }}>{t("issues.noComments")}</p>}
              </div>
              {canComment && (
                <form
                  className="ln-cbox"
                  style={{ marginTop: 12 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (comment.trim()) action.mutate({ item: item.id, action: "comment", input: { body: comment.trim() } }, { onSuccess: () => setComment("") });
                  }}
                >
                  <textarea className="ta" rows={3} aria-label={t("issues.comment")} placeholder={t("issues.commentPlaceholder")} value={comment} onChange={(event) => setComment(event.target.value)} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <span className="faint grow" style={{ fontSize: 12 }}>{t("issues.commentHint")}</span>
                    <Btn size="sm" variant="primary" type="submit" disabled={!comment.trim() || action.isPending}><Send />{t("issues.comment")}</Btn>
                  </div>
                </form>
              )}
            </section>
          </div>
        </div>
        <aside className="ln-dside" style={{ width: 260, flex: "none", borderLeft: "1px solid var(--line)", padding: 16, fontSize: 13 }}>
          <dl className="facts">
            <dt>{t("issues.state")}</dt>
            <dd style={{ display: "flex", alignItems: "center", gap: 6 }}><StateIcon state={item.state} />{item.state ?? "—"}</dd>
            <dt>{t("issues.assignee")}</dt><dd>{item.assignee ?? t("issues.nobody")}</dd>
            {field(item, "project") && <><dt>{t("issues.project")}</dt><dd>{field(item, "project")}</dd></>}
            {field(item, "priority") && <><dt>{t("issues.priority")}</dt><dd>{field(item, "priority")}</dd></>}
            <dt>{t("issues.updated")}</dt><dd>{item.occurred_at ? dayTime(item.occurred_at) : "—"}</dd>
            <dt>{t("issues.source")}</dt><dd>{item.source}</dd>
          </dl>
          {canUpdate && states.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>{t("issues.moveTo")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {states.filter((state) => state !== item.state).map((state) => (
                  <Btn key={state} size="xs" disabled={action.isPending} onClick={() => action.mutate({ item: item.id, action: "update", input: { state } })}>
                    <StateIcon state={state} />{state}
                  </Btn>
                ))}
              </div>
              <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>{t("issues.updateHint")}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ item, on }: { item: Item; on: boolean }) {
  const project = field(item, "project");
  return (
    <div role="row" className={`ln-row ${on ? "on" : ""}`} onClick={() => go("issues", item.id)}>
      <span className="ln-ck" />
      <span className="ln-iid tn">{identifier(item)}</span>
      <span className="ln-ic"><StateIcon state={item.state} /></span>
      <span className="ln-tt clip">{item.title}</span>
      <span className="ln-meta">
        {has(item, "mention") && <span className="ln-lb"><i style={{ background: "var(--vio)" }} />{t("inbox.tag.mention")}</span>}
        {project && <span className="ln-pj"><Layers size={11} /><span className="clip">{project}</span></span>}
      </span>
      <time className="tn">{item.occurred_at ? shortDate(item.occurred_at) : ""}</time>
      {item.assignee ? <Avatar name={item.assignee} size={18} /> : <span className="ln-nobody" style={{ width: 18, height: 18 }} />}
    </div>
  );
}

function Projects({ kind }: { kind: "projects" | "cycles" }) {
  const list = useItems(kind === "projects" ? "/issues/projects" : "/issues/cycles", { limit: 200 });
  const items = list.data?.items ?? [];
  if (list.isPending) return <div style={{ padding: 16 }}><Skeleton count={4} height={52} /></div>;
  if (!items.length) return <Empty title={kind === "projects" ? t("issues.noProjects") : t("issues.noCycles")} />;
  return (
    <div className="ln-list" style={{ overflowY: "auto", flex: 1 }}>
      {items.map((item) => {
        const progress = Number(field(item, "progress") ?? NaN);
        return (
          <div key={item.id} className="ln-row" style={{ height: 52 }} onClick={() => openItem(item)}>
            <span className="ln-ck" />
            <Layers size={14} className="faint" />
            <span className="ln-tt">
              <span className="clip" style={{ display: "block" }}>{item.title}</span>
              <span className="faint clip" style={{ display: "block", fontSize: 12 }}>{[item.state, item.summary].filter(Boolean).join(" · ")}</span>
            </span>
            {!Number.isNaN(progress) && <span style={{ width: 120, display: "flex" }}><Progress value={progress <= 1 ? progress * 100 : progress} /></span>}
            <time className="tn">{item.ends_at ? shortDate(item.ends_at) : ""}</time>
          </div>
        );
      })}
    </div>
  );
}

/** Where a new issue can go: issue trackers with `create`, code hosts with `create_issue`. */
export type IssueTarget = { source: string; action: string; kind: "tracker" | "repo" };
export function issueTargets(sources: { name: string; domain: string; actions: string[] }[]): IssueTarget[] {
  return sources.flatMap((source): IssueTarget[] =>
    source.domain === "issues" && source.actions.includes("create") ? [{ source: source.name, action: "create", kind: "tracker" }]
    : source.domain === "code" && source.actions.includes("create_issue") ? [{ source: source.name, action: "create_issue", kind: "repo" }]
    : [],
  );
}

/** A new issue. Creating it is a writing call, so it waits for approval in Ready. */
function NewIssue({ onClose }: { onClose: () => void }) {
  const sources = useSources();
  const pulls = useItems("/pulls", { limit: 100 });
  const action = useAction();
  const targets = issueTargets(sources.data ?? []);
  const [target, setTarget] = useState(targets[0]?.source ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [team, setTeam] = useState("");
  const repos = [...new Set((pulls.data?.items ?? []).map((item) => (field(item, "owner") && field(item, "repo") ? `${field(item, "owner")}/${field(item, "repo")}` : "")).filter(Boolean))];
  const [repo, setRepo] = useState("");
  const chosen = targets.find((item) => item.source === target);
  const [owner, name] = (repo || repos[0] || "").split("/");
  const create = () => {
    if (!chosen || !title.trim()) return;
    const input = chosen.kind === "repo" ? { owner, repo: name, title: title.trim(), body } : { title: title.trim(), description: body, team };
    action.mutate({ source: chosen.source, action: chosen.action, input }, { onSuccess: onClose });
  };
  return (
    <Modal
      title={t("issues.new")}
      sub={t("issues.newSub")}
      onClose={onClose}
      actions={<><Btn onClick={onClose}>{t("common.cancel")}</Btn><Btn variant="primary" disabled={!chosen || !title.trim() || (chosen.kind === "repo" && !(owner && name)) || action.isPending} onClick={create}>{t("issues.create")}</Btn></>}
    >
      {targets.length > 1 && (
        <div style={{ marginBottom: 8 }}>
          <Select label={t("issues.where")} value={target} onChange={setTarget} options={targets.map((item) => [item.source, item.source] as const)} />
        </div>
      )}
      <Field autoFocus label={t("issues.titleLabel")} value={title} onChange={setTitle} placeholder={t("issues.titlePlaceholder")} />
      {chosen?.kind === "repo" ? (
        <div style={{ marginTop: 8 }}><Field label={t("issues.repo")} value={repo || repos[0] || ""} onChange={setRepo} placeholder="owner/repo" /></div>
      ) : (
        <div style={{ marginTop: 8 }}><Field label={t("issues.team")} value={team} onChange={setTeam} placeholder={t("issues.teamPlaceholder")} /></div>
      )}
      <textarea className="ta" style={{ width: "100%", marginTop: 8, minHeight: 120 }} aria-label={t("issues.description")} placeholder={t("issues.description")} value={body} onChange={(event) => setBody(event.target.value)} />
      <p className="faint" style={{ fontSize: "var(--t-12)", marginTop: 6 }}>{t("connected.approvalNote")}</p>
    </Modal>
  );
}

export function Issues() {
  useLanguage();
  const route = useRoute();
  const domains = useDomains();
  const sources = useSources();
  const collapsed = collapsedStore.use();
  const [tab, setTab] = useState<Tab>("open");
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const pause = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(pause);
  }, [query]);
  const enabled = domains.has("issues");
  const open = useItems("/issues", { limit: 500, ...(term ? { q: term } : {}) }, enabled);
  const all = useItems("/issues", { limit: 500, open: false, ...(term ? { q: term } : {}) }, enabled && tab === "all");
  const items = useMemo(() => ((tab === "all" ? all.data : open.data)?.items ?? []).filter((item) => item.kind === "issue"), [tab, all.data, open.data]);
  const shown = tab === "mine" ? items.filter((item) => has(item, "assigned")) : items;
  const groups = groupByState(shown);
  const states = [...new Set((open.data?.items ?? []).map((item) => item.state).filter(Boolean) as string[])].sort((a, b) => stateRank(a) - stateRank(b));
  const flat = groups.flatMap(([key, list]) => (collapsed.includes(key) ? [] : list));
  const position = flat.findIndex((item) => item.id === route.param);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea") || event.metaKey || event.ctrlKey || event.altKey || document.querySelector(".palbg, .modalbg")) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = flat[Math.min(flat.length - 1, position + 1)];
        if (next) go("issues", next.id);
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = flat[Math.max(0, position - 1)];
        if (next) go("issues", next.id);
      }
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".ln-q input")?.focus();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  if (!sources.isPending && !enabled) return <div className="page"><NoSource domain="issues" /></div>;
  const query_ = tab === "all" ? all : open;
  const count = (value: Tab) => (value === "mine" ? items.filter((item) => has(item, "assigned")).length : value === "open" ? (open.data?.items ?? []).filter((item) => item.kind === "issue").length : undefined);
  return (
    <div className="lnr">
      <div className="ln-top">
        <h1>{t("nav.issues")}</h1>
        <Freshness domain="issues" />
        <span className="grow" />
        <label className="ln-q">
          <Search size={14} />
          <input aria-label={t("issues.search")} placeholder={t("issues.search")} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setQuery("")} />
          {query ? <button type="button" aria-label={t("common.clear")} onClick={() => setQuery("")}><X size={12} /></button> : <Kbd>/</Kbd>}
        </label>
        {issueTargets(sources.data ?? []).length > 0 && <Btn size="sm" variant="primary" onClick={() => setCreating(true)}><Plus />{t("issues.new")}</Btn>}
      </div>
      {creating && <NewIssue onClose={() => setCreating(false)} />}
      <div className="ln-bar">
        <div className="ln-vt" role="tablist">
          {(["open", "mine", "all", "projects", "cycles"] as Tab[]).map((value) => (
            <button type="button" key={value} role="tab" aria-selected={tab === value} className={tab === value ? "on" : ""} onClick={() => setTab(value)}>
              {t(`issues.tab.${value}`)}{count(value) != null && <em className="tn">{count(value)}</em>}
            </button>
          ))}
        </div>
      </div>
      <div className={`ln-body ${route.param ? "opened" : ""}`} style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {tab === "projects" || tab === "cycles" ? (
          <Projects kind={tab} />
        ) : (
          <>
            <Failure error={query_.error} />
            {query_.isPending ? (
              <div style={{ padding: 16 }}><Skeleton count={8} height={36} /></div>
            ) : shown.length === 0 ? (
              <Empty title={term ? t("mail.noHits") : t("issues.empty")} sub={term ? undefined : t("issues.emptyHint")} />
            ) : (
              <div className="ln-list" style={{ overflowY: "auto", flex: 1 }} role="grid" aria-label={t("nav.issues")}>
                {groups.map(([key, list]) => {
                  const shut = collapsed.includes(key);
                  return (
                    <section key={key}>
                      <button
                        type="button"
                        className="ln-gh"
                        style={{ position: "sticky", top: 0, zIndex: 2, backdropFilter: "blur(20px)" }}
                        aria-expanded={!shut}
                        onClick={() => collapsedStore.set(shut ? collapsed.filter((item) => item !== key) : [...collapsed, key])}
                      >
                        <ChevronRight size={12} className={shut ? "" : "rot"} />
                        <StateIcon state={key} />
                        <b className="clip">{key}</b>
                        <em className="tn">{list.length}</em>
                      </button>
                      {!shut && list.map((item) => <Row key={item.id} item={item} on={item.id === route.param} />)}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
        {route.param && <Detail key={route.param} id={route.param} states={states} />}
      </div>
    </div>
  );
}
