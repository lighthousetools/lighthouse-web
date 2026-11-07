import { CalendarClock, Check, PlugZap, ShieldCheck, Sunrise } from "lucide-react";
import { useAgentNames, useAgents, useBrief, useConnectors, useCosts, useMe, useReady, useRuns } from "../data";
import { dayTime, euro, greeting, isoWeek, longDate, time, toolName, weekdayShort } from "../format";
import { t, useLanguage } from "../i18n";
import { go } from "../router";
import { openExternal } from "../shell/bridge";
import { Btn, Empty, Failure, ServiceIcon, Skeleton, brandOf } from "../ui";
import { useNow } from "../ui/live";
import { AskBox } from "./Ask";
import { Gauge, Sec, Thesis, costsByDay } from "./briefing";
import { change, columns, formatNumber, thesis, type DocItem, type DocSection } from "./document";
import { RunDot, openRun, runSentence } from "./runs";

const isoDay = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

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

function Item({ item }: { item: DocItem }) {
  const source = item.source;
  const number = item.numbers?.[0];
  const delta = number ? change(number) : null;
  const open = source?.url ? () => openExternal(source.url!) : undefined;
  const body = (
    <>
      <ServiceIcon name={brandOf(source?.service)} fallback={source?.service ?? item.text} size={24} />
      <span className="tx">
        <b className="clip">{item.text}</b>
        {(item.detail || source?.reference) && <small className="clip">{item.detail ?? source?.reference}</small>}
      </span>
      {number && (
        <span className="end tn" title={number.label}>
          {formatNumber(number)}
          {delta != null && <span className={delta >= 0 ? "up" : "down"}> {delta >= 0 ? "+" : ""}{delta} %</span>}
        </span>
      )}
    </>
  );
  return open ? (
    <button type="button" className="bf-r" onClick={open} title={source?.url ?? undefined}>{body}</button>
  ) : (
    <div className="bf-r static">{body}</div>
  );
}

function DocSec({ section }: { section: DocSection }) {
  const items = section.items ?? [];
  return (
    <Sec title={section.title} hint={items.length || undefined}>
      {items.length === 0 && <div className="bf-ok"><Check size={16} className="up" />{t("brief.sectionEmpty")}</div>}
      {items.map((item, index) => <Item key={index} item={item} />)}
    </Sec>
  );
}

export function Brief() {
  useLanguage();
  const me = useMe();
  const brief = useBrief();
  const ready = useReady();
  const now = new Date();
  const first = me.data?.name.split(" ")[0];
  const hello = greeting(now.getHours());
  const document = brief.data;
  const parts = thesis(document?.content.summary);
  const isToday = document?.period === isoDay(now);
  const sections = document?.content.sections ?? [];
  const cols = columns(sections, 3);
  const unavailable = document?.content.unavailable ?? [];
  const count = ready.data?.total ?? 0;
  return (
    <div className="page">
      <div className="bf">
        <Thesis
          kicker={[longDate(now), t("today.week", { week: isoWeek(now) }), document ? t("brief.from", { time: dayTime(document.created_at) }) : null].filter(Boolean).join(" · ")}
          title={parts.title || (first ? t("today.greeting", { greeting: hello, name: first }) : hello)}
          lead={parts.lead || (document ? document.content.title : t("brief.none"))}
          side={<CostGauge />}
        >
          {count > 0 && (
            <Btn variant="primary" onClick={() => go("ready")}>
              {count === 1 ? t("today.goThroughOne") : t("today.goThrough", { count })}
            </Btn>
          )}
          {document && <Btn onClick={() => openRun(document.run_id)}>{t("brief.openRun")}</Btn>}
          {document && !isToday && <span className="faint" style={{ fontSize: 12 }}>{t("brief.notToday")}</span>}
        </Thesis>
        <div style={{ marginTop: 20 }}><AskBox /></div>
        <Failure error={brief.error} />
        {brief.isPending && <div style={{ marginTop: 24 }}><Skeleton count={4} /></div>}
        {!brief.isPending && !document && (
          <div className="card" style={{ marginTop: 20 }}>
            <Empty icon={<Sunrise />} title={t("brief.empty")} sub={t("brief.emptyHint")} action={<Btn onClick={() => go("agents")}>{t("nav.agents")}</Btn>} />
          </div>
        )}
        <div className="bf-grid">
          <div className="bf-col">
            {cols[0]!.map((section, index) => <DocSec key={index} section={section} />)}
            <ComingUp />
          </div>
          <div className="bf-col">
            {cols[1]!.map((section, index) => <DocSec key={index} section={section} />)}
            <Connections />
          </div>
          <div className="bf-col">
            {cols[2]!.map((section, index) => <DocSec key={index} section={section} />)}
            <Activity />
          </div>
        </div>
        {unavailable.length > 0 && (
          <p className="bf-un faint">
            <PlugZap size={14} />
            {t("brief.unavailable", { services: unavailable.join(", ") })}
          </p>
        )}
      </div>
    </div>
  );
}
