import { AlertTriangle, Bot, CheckCheck, Plug } from "lucide-react";
import { useState } from "react";
import { useAgentNames, useAlertCounts, useCosts, useNeedsYou, useReady, useRuns, useSessions } from "../data";
import { agentName, euro, time, tokens } from "../format";
import { t, useLanguage } from "../i18n";
import { go } from "../router";
import { Seg, ServiceIcon, Spark, smoothPath } from "../ui";
import { useNow } from "../ui/live";
import { costsByDay } from "./briefing";
import { money, useNumbers, useOrg, useSources } from "./connected";
import { age } from "./Ready";
import { RunDot, openRun } from "./runs";
import "./center.css";

type Filter = "all" | "running" | "needs" | "errors";
const WINDOW = 2 * 3_600_000;

/** Runs per hour over the last `hours`, oldest first, for the activity curve. */
export function runsPerHour(starts: string[], hours = 24, now = Date.now()) {
  const counts = Array.from({ length: hours }, () => 0);
  for (const start of starts) {
    const ago = Math.floor((now - Date.parse(start)) / 3_600_000);
    if (ago >= 0 && ago < hours) counts[hours - 1 - ago]! += 1;
  }
  return counts;
}

export function Center() {
  useLanguage();
  const now = useNow(30_000);
  const org = useOrg();
  const numbers = useNumbers();
  const ready = useReady();
  const runs = useRuns(200);
  const sessions = useSessions();
  const alerts = useAlertCounts();
  const costs = useCosts(14);
  const needs = useNeedsYou();
  const sources = useSources();
  const names = useAgentNames();
  const [filter, setFilter] = useState<Filter>("all");
  const first = numbers.data?.currencies[0];
  const list = (runs.data ?? []).filter((run) => run.agent_id !== "brain-ask");
  const failed = list.filter((run) => ["failed", "limit_exceeded"].includes(run.status) && now - Date.parse(run.started_at) < 86_400_000);
  const running = list.filter((run) => run.status === "running" || run.status === "waiting");
  const days = costsByDay(costs.data ?? [], 14);
  const todayCost = days[days.length - 1]?.cost ?? 0;
  const alertTotal = alerts.data ? alerts.data.critical + alerts.data.warning + alerts.data.info : 0;
  const active = (sessions.data ?? []).filter((session) => session.status === "running" || session.status === "waiting");
  const curve = runsPerHour(list.map((run) => run.started_at), 24, now);
  const done24 = list.filter((run) => run.status === "succeeded" && now - Date.parse(run.started_at) < 86_400_000).length;
  const width = 1000;
  const height = 90;
  const max = Math.max(1, ...curve);
  const points = curve.map((value, index) => [(index / (curve.length - 1)) * width, height - 8 - (value / max) * (height - 24)] as [number, number]);
  const lanes = [...new Set(list.filter((run) => now - Date.parse(run.started_at) < WINDOW || run.status === "running").map((run) => run.agent_id))].slice(0, 10);
  const x = (iso: string) => Math.max(0, Math.min(100, 100 - ((now - Date.parse(iso)) / WINDOW) * 100));
  const tone = (status: string) => (status === "failed" || status === "limit_exceeded" ? "bad" : status === "waiting" ? "warn" : status === "running" ? "run" : "ok");
  const show = (status: string) =>
    filter === "all" || (filter === "running" ? status === "running" : filter === "needs" ? status === "waiting" : ["failed", "limit_exceeded"].includes(status));
  const tiles: { label: string; value: string; sub: string; spark?: number[]; view: Parameters<typeof go>[0]; hot?: boolean }[] = [
    { label: t("numbers.cash"), value: first ? money(first.cash, first.currency) : "–", sub: org ? org.name : t("org.allCompanies"), view: "finance" },
    { label: t("nav.pipeline"), value: first ? money(first.pipeline_open, first.currency) : "–", sub: first ? t("center.deals", { count: first.deals_open }) : "–", view: "pipeline" },
    { label: t("center.sessions"), value: String(active.length), sub: t("center.waiting", { count: needs.waiting.length }), view: "sessions" },
    { label: t("nav.alerts"), value: String(alertTotal), sub: t("center.critical", { count: alerts.data?.critical ?? 0 }), view: "alerts", hot: (alerts.data?.critical ?? 0) > 0 },
    { label: t("today.needsYou"), value: String(ready.data?.total ?? 0), sub: t("center.decisions", { count: needs.decisions }), view: "ready", hot: (ready.data?.total ?? 0) > 0 },
    { label: t("today.costsToday"), value: euro(todayCost), sub: t("center.fourteen"), spark: days.map((day) => day.cost), view: "log" },
  ];
  return (
    <div className="page flush" style={{ overflowY: "auto", display: "block" }}>
      <div className="ccv">
        <div className="cc-top">
          <div className="grow">
            <h1>{t("nav.center")}</h1>
            <p>{t("center.lead", { done: done24, needs: ready.data?.total ?? 0, errors: failed.length })}</p>
          </div>
          <Seg<Filter>
            label={t("center.filter")}
            value={filter}
            onChange={setFilter}
            options={[["all", t("approvals.filterAll"), list.length], ["running", t("status.running"), running.length], ["needs", t("today.needsYou"), needs.waiting.length + needs.decisions], ["errors", t("center.errors"), failed.length]]}
          />
        </div>
        <div className="cc-kpi">
          {tiles.map((tile) => (
            <button type="button" key={tile.label} className="cc-tile" onClick={() => go(tile.view)}>
              <span className="faint" style={{ fontSize: 12 }}>{tile.label}</span>
              <b className="tn" style={{ font: "500 20px/28px var(--display)", color: tile.hot ? "var(--warn)" : undefined }}>{tile.value}</b>
              <span className="faint" style={{ fontSize: 12 }}>{tile.sub}</span>
              {tile.spark && tile.spark.length > 1 && <Spark data={tile.spark} height={26} />}
            </button>
          ))}
        </div>
        <div className="card cc-curve">
          <div className="z-hd">
            <div className="grow"><b>{t("center.lastDay")}</b><small>{t("center.perHour")}</small></div>
            <span className="faint" style={{ fontSize: 12, display: "inline-flex", gap: 12 }}>
              <span><CheckCheck size={12} /> {t("center.done", { count: done24 })}</span>
              <span><AlertTriangle size={12} /> {t("center.errorsCount", { count: failed.length })}</span>
            </span>
          </div>
          <div className="z-pl" style={{ height: height + 18 }}>
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }} aria-hidden="true">
              <path d={`${smoothPath(points)} L${width} ${height} L0 ${height}Z`} fill="var(--accent-soft)" />
              <path d={smoothPath(points)} fill="none" stroke="var(--chart)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="ax"><span>{t("center.dayAgo")}</span><span>{t("center.noon")}</span><span>{t("center.now")}</span></div>
          </div>
        </div>
        <div className="cc-mid">
          <div className="card cc-box">
            <div className="ch"><Bot size={15} />{t("nav.agents")}<small>{t("center.lanes", { active: lanes.length, running: running.length })}</small></div>
            <div className="cc-g">
              <div className="cc-gh">
                {[-100, -80, -60, -40, -20].map((minutes, index) => <i key={minutes} style={{ left: `${index * 20}%` }}>{t("center.minutesAgo", { count: -minutes })}</i>)}
                <em>{t("center.now")}</em>
              </div>
              <div className="bd">
                {lanes.map((agent) => {
                  const mine = list.filter((run) => run.agent_id === agent);
                  return (
                    <div key={agent} className="cc-lane">
                      <div className="z-lb"><span className="grow" style={{ minWidth: 0 }}><span className="n clip">{agentName(agent, names)}</span><span className="m clip">{mine.length} {t("weekly.runs")}</span></span></div>
                      <div style={{ position: "relative", flex: 1, height: 25, marginRight: 12 }}>
                        {mine.filter((run) => now - Date.parse(run.finished_at ?? new Date(now).toISOString()) < WINDOW).map((run) => {
                          const left = x(run.started_at);
                          const right = run.finished_at ? x(run.finished_at) : 100;
                          return (
                            <button
                              type="button"
                              key={run.id}
                              className={`cc-bar ${show(run.status) ? "" : "dim"}`}
                              style={{ left: `${left}%`, width: `max(${Math.max(right - left, 1.5)}%, 28px)`, color: tone(run.status) === "bad" ? "var(--bad)" : tone(run.status) === "warn" ? "var(--warn)" : tone(run.status) === "run" ? "var(--accent)" : undefined }}
                              onClick={() => openRun(run.id)}
                              title={`${agentName(run.agent_id, names)} · ${time(run.started_at)}`}
                            >
                              <span className="clip">{run.activity ?? run.status}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {lanes.length === 0 && <p className="faint" style={{ padding: 16, fontSize: 13 }}>{t("center.quiet")}</p>}
              </div>
            </div>
          </div>
          <div className="cc-need">
            <div className="z-hd">{t("today.needsYou")}<em className="tn">{ready.data?.total ?? 0}</em></div>
            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {(ready.data?.items ?? []).slice(0, 8).map((item) => (
                <button type="button" key={`${item.kind}:${item.id}`} className="card cc-nc" style={{ padding: "10px 12px", textAlign: "left" }} onClick={() => go("ready", `${item.kind}:${item.id}`)}>
                  <b className="clip" style={{ display: "block" }}>{item.title}</b>
                  <span className="faint" style={{ fontSize: 12 }}>{t(`ready.kind.${item.kind as "approval"}`)} · {age(item.created_at)}</span>
                </button>
              ))}
              {(ready.data?.items ?? []).length === 0 && <p className="faint" style={{ padding: 8, fontSize: 13 }}>{t("ready.leadNone")}</p>}
            </div>
          </div>
        </div>
        <div className="cc-low">
          <div className="card">
            <div className="ch">{t("center.live")}<small>{running.length ? t("status.running") : ""}</small></div>
            <div className="cc-st">
              {list.slice(0, 12).map((run) => (
                <button type="button" key={run.id} onClick={() => openRun(run.id)}>
                  <span className="faint tn">{time(run.started_at)}</span>
                  <RunDot status={run.status} />
                  <span className="grow clip">{agentName(run.agent_id, names)}{run.activity ? ` · ${run.activity}` : ""}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="ch"><Plug size={14} />{t("center.services")}<small>{t("center.healthy", { ok: (sources.data ?? []).filter((source) => !source.stale && !source.status?.last_error).length, count: (sources.data ?? []).length })}</small></div>
            <div className="cc-h">
              {(sources.data ?? []).map((source) => (
                <button type="button" key={source.name} onClick={() => go("connections")}>
                  <ServiceIcon name={source.connector} fallback={source.name} size={18} />
                  <span className="grow clip">{source.name}</span>
                  <i className={`dot ${source.status?.last_error ? "bad" : source.stale ? "warn" : "ok"}`} />
                </button>
              ))}
              {(sources.data ?? []).length === 0 && <p className="faint" style={{ fontSize: 13 }}>{t("center.noSources")}</p>}
            </div>
          </div>
          <div className="card cc-c">
            <div className="big"><b className="tn">{euro(todayCost)}</b><span>{t("today.costsToday")}</span></div>
            <div className="faint" style={{ fontSize: 12 }}>{t("center.tokens", { count: tokens(list.filter((run) => now - Date.parse(run.started_at) < 86_400_000).reduce((sum, run) => sum + run.input_tokens + run.output_tokens, 0)) })}</div>
            <Spark data={days.map((day) => day.cost)} height={40} />
          </div>
        </div>
      </div>
    </div>
  );
}
