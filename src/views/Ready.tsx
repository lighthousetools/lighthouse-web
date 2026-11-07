import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Check, ChevronDown, PencilLine, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { useAgentNames, useNeedsYou } from "../data";
import { agentName, dateTime, toolName } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { createStore } from "../store";
import { Badge, Btn, Card, Empty, Failure, Menu, Progress, Seg, ServiceIcon, Skeleton, brandOf } from "../ui";
import { plainFields } from "./Decisions";
import "./approvals.css";

type Item =
  | { key: string; kind: "approval"; created: string; approval: Schemas["Approval"] }
  | { key: string; kind: "permission"; created: string; permission: Schemas["Permission"] };

type Decided = { key: string; title: string; stamp: string };

/** What was decided in this visit, so the queue can show it and the empty state can list it. */
const decidedStore = createStore<Decided[]>([]);
type Filter = "all" | "agents" | "claude";

const LONG_FIELDS = new Set(["body", "text", "message", "content", "description", "comment"]);

/** 2 h, 3 d: how long something has waited. */
export function age(iso: string | undefined, now = Date.now()) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return t("age.minutes", { count: Math.max(1, minutes) });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("age.hours", { count: hours });
  return t("age.days", { count: Math.round(hours / 24) });
}

function titleOf(item: Item) {
  return item.kind === "approval" ? toolName(item.approval.tool) : t("approvals.claudeWants", { tool: item.permission.tool });
}

function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["approvals"] });
    void client.invalidateQueries({ queryKey: ["permissions"] });
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

function DecisionCard({ item, names, onDecided }: { item: Item; names: Record<string, string>; onDecided: (stamp: string) => void }) {
  const refresh = useRefresh();
  const initial = item.kind === "approval" ? JSON.stringify(item.approval.input, null, 2) : "";
  const [text, setText] = useState(initial);
  const [editing, setEditing] = useState(false);
  const decide = useMutation({
    mutationFn: async (approve: boolean): Promise<unknown> => {
      if (item.kind === "permission") {
        return must(api.POST("/permissions/{id}/decision", { params: { path: { id: item.permission.id } }, body: { allow: approve } }));
      }
      let input: unknown;
      if (editing && approve) {
        try {
          input = JSON.parse(text);
        } catch {
          throw new Error(t("approvals.invalidJson"));
        }
      }
      return must(api.POST("/approvals/{id}/decision", { params: { path: { id: item.approval.id } }, body: { approve, input } }));
    },
    onSuccess: (_, approve) => {
      const stamp = approve ? (item.kind === "permission" ? t("status.allowed") : t("status.approved")) : t("status.denied");
      onDecided(stamp);
      toast(`${stamp}: ${titleOf(item)}`);
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
      const press = event.key.toLowerCase();
      if (decide.isPending) return;
      if ((press === "enter" && target.tagName !== "BUTTON") || press === "a") {
        event.preventDefault();
        decide.mutate(true);
      }
      if (press === "r") decide.mutate(false);
      if (press === "e" && item.kind === "approval") {
        event.preventDefault();
        setEditing((value) => !value);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const approval = item.kind === "approval" ? item.approval : null;
  const permission = item.kind === "permission" ? item.permission : null;
  const source = approval ? approval.tool.split(".")[0] : "claude";
  const changed = editing && text !== initial;
  return (
    <Card style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="rdc">
        <div className="rd-hd">
          <ServiceIcon name={brandOf(source)} fallback={source} size={20} />
          <span className="grow clip">
            {approval ? t("approvals.proposes", { agent: agentName(approval.agent_id, names) }) : `Claude Code · ${permission!.project}`}
          </span>
          <Badge tone="warn">{approval ? t("approvals.agent") : "Claude Code"}</Badge>
        </div>
        <h2>{titleOf(item)}</h2>
        {approval?.reason && (
          <p className="rd-why">
            <b>{t("approvals.why")}</b> {approval.reason}
          </p>
        )}
        {approval?.quotes_external && (
          <p className="note-box rd-ext">
            <AlertTriangle size={14} />
            <span>{t("approvals.external")}</span>
          </p>
        )}
        <div className="rea-dh">
          <span>{approval ? t("approvals.whatHappens") : t("approvals.request")}</span>
          {changed && <Badge>{t("approvals.changed")}</Badge>}
        </div>
        {editing ? (
          <label>
            <span className="lbl" style={{ marginTop: 0 }}>{t("approvals.arguments")}</span>
            <textarea className="ta mono" rows={12} spellCheck={false} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
        ) : (
          <Fields input={approval ? approval.input : permission!.input} />
        )}
        <Details input={approval ? approval.input : permission!.input} />
        {approval && approval.consulted.length > 0 && (
          <div className="rd-evd">
            <span className="faint">{t("approvals.consulted")}</span>
            {approval.consulted.map((tool) => (
              <span key={tool} className="rea-srcchip">
                <ServiceIcon name={brandOf(tool.split(".")[0])} fallback={tool} size={14} />
                {toolName(tool)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="rd-ft">
        <Btn variant="primary" kbd="↵" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
          <Check />
          {approval ? t("approvals.approve") : t("approvals.allow")}
        </Btn>
        {approval && (
          <Btn kbd="E" onClick={() => setEditing(!editing)}>
            <PencilLine />
            {editing ? t("approvals.stopEdit") : t("approvals.edit")}
          </Btn>
        )}
        <Btn kbd="R" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
          <X />
          {t("approvals.deny")}
        </Btn>
        <span className="grow" />
        {decide.error ? <Failure error={decide.error} /> : (
          <span className="exp tn">{t("common.expires", { time: dateTime((approval ?? permission)!.expires_at) })}</span>
        )}
      </div>
    </Card>
  );
}

function BatchMenu({ count }: { count: number }) {
  const refresh = useRefresh();
  const needs = useNeedsYou();
  const batch = useMutation({
    mutationFn: (approve: boolean) =>
      must(api.POST("/approvals/decisions", { body: { approve, ids: needs.approvals.map((item) => item.id) } })),
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
        { label: t("approvals.approveAll", { count }), icon: <Check size={14} />, run: () => batch.mutate(true) },
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

export function Approvals() {
  useLanguage();
  const route = useRoute();
  const needs = useNeedsYou();
  const names = useAgentNames();
  const decided = decidedStore.use();
  const [filter, setFilter] = useState<Filter>("all");
  const items = useMemo<Item[]>(
    () =>
      [
        ...needs.permissions.map((permission) => ({ key: `permission:${permission.id}`, kind: "permission" as const, created: permission.created_at, permission })),
        ...needs.approvals.map((approval) => ({ key: `approval:${approval.id}`, kind: "approval" as const, created: approval.created_at, approval })),
      ].sort((a, b) => (a.created ?? "").localeCompare(b.created ?? "")),
    [needs.permissions, needs.approvals],
  );
  const shown = items.filter((item) => filter === "all" || (filter === "agents" ? item.kind === "approval" : item.kind === "permission"));
  // Links may name a decision with its kind (`approval:<id>`) or by its bare id, as the Mac app does.
  const current = shown.find((item) => item.key === route.param || item.key.endsWith(`:${route.param}`)) ?? shown[0];
  const select = (key: string) => go("approvals", key);
  const move = (step: number) => {
    const index = shown.findIndex((item) => item.key === current?.key);
    const next = shown[(index + step + shown.length) % shown.length];
    if (next) select(next.key);
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
  const onDecided = (item: Item) => (stamp: string) => {
    decidedStore.set((list) => [{ key: item.key, title: titleOf(item), stamp }, ...list.filter((entry) => entry.key !== item.key)].slice(0, 20));
    const index = shown.findIndex((entry) => entry.key === item.key);
    const next = shown[index + 1] ?? shown[index - 1];
    if (next) select(next.key);
  };
  const total = items.length + decided.length;
  const oldest = items[0]?.created;
  const minutes = Math.max(1, Math.ceil(items.length * 0.7));
  const header = (
    <header className="rd-h">
      <div className="grow">
        <h1>{t("nav.approvals")}</h1>
        <p className="lead">
          {items.length ? (items.length === 1 ? t("approvals.leadOne") : t("approvals.leadMany", { count: items.length, minutes })) : t("approvals.lead")}
        </p>
      </div>
      {needs.approvals.length > 1 && <BatchMenu count={needs.approvals.length} />}
    </header>
  );

  if (needs.loading) {
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
          <div className="rdy-done">
            <div>
              <Sparkles size={28} className="warnc" />
              <h1 style={{ marginTop: 12 }}>{t("approvals.clear")}</h1>
              <p className="muted" style={{ marginTop: 8 }}>{t("approvals.empty")} {t("approvals.emptyHint")}</p>
              <div className="rd-acts">
                <Btn variant="primary" onClick={() => go("today")}>{t("approvals.backToday")}</Btn>
                <Btn onClick={() => go("log")}>{t("today.allRuns")}</Btn>
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

  const count = (kind?: Item["kind"]) => items.filter((item) => !kind || item.kind === kind).length;
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
                options={[["all", t("approvals.filterAll"), count()], ["agents", t("approvals.filterAgents"), count("approval")], ["claude", "Claude Code", count("permission")]]}
              />
            </div>
            <div className="rd-ql">
              {shown.map((item) => {
                const on = item.key === current?.key;
                const source = item.kind === "approval" ? item.approval.tool.split(".")[0] : "claude";
                return (
                  <button type="button" key={item.key} className={`rd-i ${on ? "on" : ""}`} aria-current={on || undefined} onClick={() => select(item.key)}>
                    <span className="ic"><ServiceIcon name={brandOf(source)} fallback={source} size={20} /></span>
                    <span className="grow">
                      <span className="t clip">{titleOf(item)}</span>
                      <span className="s clip">
                        {item.kind === "approval" ? agentName(item.approval.agent_id, names) : item.permission.project}
                      </span>
                    </span>
                    <span className="ag tn">{age(item.created)}</span>
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
              <div className="rd-mo" key={current.key}>
                <DecisionCard item={current} names={names} onDecided={onDecided(current)} />
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
