import { CalendarClock, Check, PlugZap, ShieldCheck } from "lucide-react";
import { useAgentNames, useAgents, useConnectors, useCosts, useMe, useNeedsYou, useRuns } from "../data";
import { agentName, euro, greeting, isoWeek, longDate, time, toolName, weekdayShort } from "../format";
import { t, useLanguage } from "../i18n";
import { go } from "../router";
import { Btn, Dot, ServiceIcon, Skeleton, brandOf } from "../ui";
import { useNow } from "../ui/live";
import { Markdown } from "../ui/markdown";
import { AskBox } from "./Ask";
import { Gauge, Linked, Sec, Thesis } from "./briefing";
import { RunDot, openRun, runSentence } from "./runs";

const DAY = 86_400_000;
const isoDay = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** Costs per day for the last `days` days, oldest first, with zero for quiet days. */
export function costsByDay(costs: { day: string; cost_eur: number }[], days: number, today = new Date()) {
  return Array.from({ length: days }, (_, index) => {
    const day = isoDay(new Date(today.getTime() - (days - 1 - index) * DAY));
    return { day, cost: costs.filter((cost) => cost.day === day).reduce((sum, cost) => sum + cost.cost_eur, 0) };
  });
}

function CostGauge() {
  const costs = useCosts(14);
  const runs = useRuns(100);
  const days = costsByDay(costs.data ?? [], 14);
  const today = days[days.length - 1]?.cost ?? 0;
  const ranToday = (runs.data ?? []).filter((run) => run.started_at.slice(0, 10) === isoDay(new Date())).length;
  return (
    <Gauge
      title={t("today.costsOpen")}
      big={euro(today)}
      label={t("today.costsToday")}
      bars={days.map((day) => day.cost)}
      hot={days.length - 1}
      tip={(index) => `${weekdayShort(days[index]!.day)} ${euro(days[index]!.cost)}`}
      foot={ranToday === 1 ? t("today.runsTodayOne") : t("today.runsToday", { count: ranToday })}
      onClick={() => go("log")}
    />
  );
}

function Briefing() {
  const runs = useRuns(50);
  const brief = runs.data?.find((run) => run.agent_id.includes("brief") && run.report);
  if (!brief?.report) return null;
  return (
    <Linked
      label={t("today.summaryFrom", { time: time(brief.finished_at) })}
      onClick={() => openRun(brief.id)}
      action={<Btn size="sm" onClick={() => openRun(brief.id)}>{t("today.openBriefing")}</Btn>}
    >
      <Markdown source={brief.report} />
    </Linked>
  );
}

function ComingUp() {
  const agents = useAgents();
  const now = useNow(60_000);
  const upcoming = (agents.data ?? [])
    .filter((agent) => agent.next_run)
    .sort((a, b) => a.next_run!.localeCompare(b.next_run!))
    .slice(0, 6);
  const next = upcoming[0];
  return (
    <Sec title={t("today.coming")} hint={next ? t("today.nextAt", { time: time(next.next_run) }) : undefined}>
      {agents.isPending && <Skeleton count={3} height={40} />}
      {!agents.isPending && upcoming.length === 0 && (
        <div className="bf-ok"><CalendarClock size={16} className="faint" />{t("today.comingEmpty")}</div>
      )}
      {upcoming.length > 0 && <div className="bf-now tn">{time(new Date(now).toISOString())}</div>}
      {upcoming.map((agent) => {
        const when = new Date(agent.next_run!);
        const sameDay = isoDay(when) === isoDay(new Date(now));
        return (
          <button type="button" key={agent.id} className="bf-ev" onClick={() => go("agents", agent.id)}>
            <time>{time(agent.next_run)}</time>
            <span className="grow">
              <b>{agent.name}</b>
              <small>{sameDay ? t("today.today") : weekdayShort(when)} · {agent.schedule}</small>
            </span>
          </button>
        );
      })}
    </Sec>
  );
}

function Connections() {
  const connectors = useConnectors();
  const broken = (connectors.data ?? []).filter((connector) => !connector.connected);
  if (connectors.isPending || (connectors.data ?? []).length === 0) return null;
  return (
    <Sec title={t("nav.connections")} hint={broken.length || undefined}>
      {broken.length === 0 ? (
        <div className="bf-ok"><ShieldCheck size={16} className="up" />{t("today.allConnected")}</div>
      ) : (
        broken.map((connector) => (
          <button type="button" key={connector.name} className="bf-r" onClick={() => go("connections")}>
            <ServiceIcon name={connector.name} size={24} />
            <span className="tx">
              <b className="clip">{t("today.notConnected", { name: connector.name })}</b>
              <small className="clip">{t("today.fixHint")}</small>
            </span>
            <PlugZap size={16} className="warnc" />
          </button>
        ))
      )}
    </Sec>
  );
}

function NeedsYou() {
  const needs = useNeedsYou();
  const names = useAgentNames();
  return (
    <Sec title={t("today.needsYou")} hint={needs.total || undefined} label={t("today.needsYou")}>
      {needs.loading && <Skeleton count={3} height={52} />}
      {needs.permissions.map((request) => (
        <button type="button" key={request.id} className="bf-r" onClick={() => go("approvals", `permission:${request.id}`)}>
          <ServiceIcon name="claude" size={24} />
          <span className="tx">
            <b className="clip">{t("approvals.claudeWants", { tool: request.tool })}</b>
            <small className="clip">{request.project}</small>
          </span>
        </button>
      ))}
      {needs.approvals.map((approval) => (
        <button type="button" key={approval.id} className="bf-r" onClick={() => go("approvals", `approval:${approval.id}`)}>
          <ServiceIcon name={brandOf(approval.tool.split(".")[0])} fallback={approval.tool} size={24} />
          <span className="tx">
            <b className="clip">{toolName(approval.tool)}</b>
            <small className="clip">{t("approvals.proposes", { agent: agentName(approval.agent_id, names) })}</small>
          </span>
        </button>
      ))}
      {needs.waiting.map((session) => (
        <button type="button" key={`${session.node_id}-${session.id}`} className="bf-r" onClick={() => go("sessions", `${session.node_id}:${session.id}`)}>
          <ServiceIcon name="claude" size={24} />
          <span className="tx">
            <b className="clip">{session.project}</b>
            <small className="clip">{session.summary ?? t("status.waiting")}</small>
          </span>
          <Dot tone="warn" />
        </button>
      ))}
      {!needs.loading && needs.total === 0 && (
        <div className="bf-ok"><Check size={16} className="up" />{t("today.nothing")}</div>
      )}
      {needs.decisions > 0 && (
        <div className="bf-more">
          <Btn variant="primary" onClick={() => go("approvals")}>
            {needs.decisions === 1 ? t("today.goThroughOne") : t("today.goThrough", { count: needs.decisions })}
          </Btn>
        </div>
      )}
    </Sec>
  );
}

function Activity() {
  const runs = useRuns(12);
  const names = useAgentNames();
  // Questions and drafts were asked for a moment ago, so they are not news.
  const list = (runs.data ?? []).filter((run) => !["agent-draft", "brain-ask"].includes(run.agent_id)).slice(0, 9);
  return (
    <Sec title={t("today.activity")} hint={list.length || undefined}>
      {runs.isPending && <Skeleton count={4} height={40} />}
      {!runs.isPending && list.length === 0 && <div className="bf-ok">{t("today.noActivity")}</div>}
      {list.map((run) => (
        <button type="button" key={run.id} className="bf-f" onClick={() => openRun(run.id)}>
          <span className="ic" style={{ width: 20, display: "grid", placeItems: "center" }}><RunDot status={run.status} /></span>
          <span className="grow">
            {runSentence(run, names)}
            {run.status === "running" && run.activity && <span className="faint"> · {t("run.activity", { step: toolName(run.activity) })}</span>}
          </span>
          <span className="faint tn" style={{ fontSize: 12 }}>{time(run.started_at)}</span>
        </button>
      ))}
      {list.length > 0 && (
        <div className="bf-more">
          <Btn size="sm" onClick={() => go("log")}>{t("today.allRuns")}</Btn>
        </div>
      )}
    </Sec>
  );
}

export function Today() {
  useLanguage();
  const me = useMe();
  const needs = useNeedsYou();
  const now = new Date();
  const first = me.data?.name.split(" ")[0];
  const hello = greeting(now.getHours());
  const lead =
    needs.total === 0 ? t("today.nothing")
    : needs.total === 1 ? t("today.needs.one")
    : t("today.needs.other", { count: needs.total });
  return (
    <div className="page">
      <div className="bf">
        <Thesis
          kicker={`${longDate(now)} · ${t("today.week", { week: isoWeek(now) })}`}
          title={first ? t("today.greeting", { greeting: hello, name: first }) : hello}
          lead={lead}
          side={<CostGauge />}
        >
          <AskBox />
        </Thesis>
        <Briefing />
        <div className="bf-grid">
          <div className="bf-col">
            <NeedsYou />
          </div>
          <div className="bf-col">
            <ComingUp />
            <Connections />
          </div>
          <div className="bf-col">
            <Activity />
          </div>
        </div>
      </div>
    </div>
  );
}
