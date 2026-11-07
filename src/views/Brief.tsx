import type { Schemas } from "../api/client";
import { CalendarClock, Check, PlugZap, ShieldCheck, Sunrise } from "lucide-react";
import { cronText } from "../cron";
import { useAgentNames, useAgents, useBrief, useConnectors, useCosts, useMe, useReady, useRuns } from "../data";
import { dayTime, euro, greeting, isoWeek, longDate, time, toolName, weekdayShort } from "../format";
import { t, useLanguage } from "../i18n";
import { go } from "../router";
import { openExternal } from "../shell/bridge";
import { Btn, Empty, Failure, ServiceIcon, Skeleton, brandOf } from "../ui";
import { useNow } from "../ui/live";
import { AskBox } from "./Ask";
import { Gauge, Linked, Sec, Thesis, costsByDay, linkedLabel } from "./briefing";
import { change, columns, formatNumber, thesis, type DocItem, type DocSection } from "./document";
import { RunDot, openRun, runSentence } from "./runs";

const isoDay = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

type Weather = NonNullable<Schemas["BriefingContent"]["weather"]>;

/** Today's weather, as the vision shows it beside the headline: temperature, summary, and the day's range. */
function WeatherTile({ weather }: { weather: Weather }) {
  const temperature = weather.temperature_c ?? weather.high_c;
  return (
    <div className="bf-g bf-w" title={weather.source ?? undefined}>
      <div className="gh">
        {temperature != null && <b className="tn">{Math.round(temperature)}°</b>}
        <span>{weather.summary}</span>
      </div>
      {weather.low_c != null && weather.high_c != null && (
        <div className="bf-wr" aria-hidden="true">
          <i style={{ left: `${Math.max(0, Math.min(100, ((weather.low_c + 10) / 45) * 100))}%`, right: `${100 - Math.max(0, Math.min(100, ((weather.high_c + 10) / 45) * 100))}%` }} />
        </div>
      )}
      <div className="gf">{[weather.location, weather.low_c != null && weather.high_c != null ? t("brief.range", { low: Math.round(weather.low_c), high: Math.round(weather.high_c) }) : null].filter(Boolean).join(" · ")}</div>
    </div>
  );
}

/** The week ahead in small day cards: weekday, its one-word label, and what is on. */
function WeekAhead({ days }: { days: Schemas["WeekDay"][] }) {
  if (!days.length) return null;
  return (
    <Sec title={t("brief.week")} hint={days.length}>
      <div className="bf-week">
        {days.slice(0, 6).map((day) => {
          const date = new Date(`${day.date}T12:00:00`);
          return (
            <div key={day.date} className="bf-day">
              <b>{weekdayShort(date)} <span className="faint tn">{date.getDate()}.</span></b>
              {day.label && <em className="clip">{day.label}</em>}
              {(day.items ?? []).slice(0, 2).map((item, index) => <small key={index} className="clip">{item.title ?? item.text}</small>)}
            </div>
          );
        })}
      </div>
    </Sec>
  );
}

/** "Das hängt zusammen": how items across services belong together, with their sources in a chain. */
function Connected({ connection, count }: { connection: Schemas["Connection"]; count: number }) {
  return (
    <div style={{ marginTop: 20 }}>
      <Linked
        label={linkedLabel()}
        chain={(connection.items ?? []).slice(0, 5).map((source) => ({
          svc: brandOf(source.service) ?? source.service,
          label: source.reference ?? source.service,
          fallback: source.service,
          run: () => (source.url ? openExternal(source.url) : undefined),
        }))}
        action={count > 0 ? <Btn size="sm" onClick={() => go("ready")}>{t("brief.goThrough")}</Btn> : undefined}
      >
        <p className="bf-lt"><b>{connection.title}</b> {connection.text}</p>
      </Linked>
    </div>
  );
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
              <small>{sameDay ? t("today.today") : weekdayShort(when)} · {cronText(agent.schedule)}</small>
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

type Run = Schemas["RunRecord"];

/** Runs of the same agent ending the same way, next to each other, become one line with a count. */
export function groupRuns<T extends Pick<Run, "agent_id" | "status">>(runs: T[]): { run: T; count: number }[] {
  const groups: { run: T; count: number }[] = [];
  for (const run of runs) {
    const last = groups[groups.length - 1];
    if (last && last.run.agent_id === run.agent_id && last.run.status === run.status) last.count++;
    else groups.push({ run, count: 1 });
  }
  return groups;
}

function Activity() {
  const runs = useRuns(40);
  const names = useAgentNames();
  // Questions and drafts were asked for a moment ago, so they are not news.
  const groups = groupRuns((runs.data ?? []).filter((run) => !["agent-draft", "brain-ask"].includes(run.agent_id))).slice(0, 8);
  return (
    <Sec title={t("today.activity")} hint={groups.length || undefined}>
      {runs.isPending && <Skeleton count={4} height={40} />}
      {!runs.isPending && groups.length === 0 && <div className="bf-ok">{t("today.noActivity")}</div>}
      {groups.map(({ run, count }) => {
        // What it is at: the step it waits on or runs, or why it stopped.
        const detail = run.activity ? toolName(run.activity) : run.status === "failed" ? run.reason : null;
        return (
          <button type="button" key={run.id} className="bf-f" onClick={() => (count > 1 ? go("log") : openRun(run.id))}>
            <span className="ic" style={{ width: 20, display: "grid", placeItems: "center" }}><RunDot status={run.status} /></span>
            <span className="grow">
              {runSentence(run, names)}
              {count > 1 && <b className="tn"> {t("today.times", { count })}</b>}
              {detail && <span className="faint"> · {run.status === "waiting" ? t("today.waitsFor", { step: detail }) : detail}</span>}
            </span>
            <span className="faint tn" style={{ fontSize: 12 }}>{time(run.started_at)}</span>
          </button>
        );
      })}
      {groups.length > 0 && (
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
        <b className="clip">{item.title ?? item.text}</b>
        {(item.subtitle || item.detail || source?.reference) && <small className="clip">{item.subtitle ?? item.detail ?? source?.reference}</small>}
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
          side={document?.content.weather ? <WeatherTile weather={document.content.weather} /> : <CostGauge />}
        >
          {count > 0 && (
            <Btn variant="primary" onClick={() => go("ready")}>
              {count === 1 ? t("today.goThroughOne") : t("today.goThrough", { count })}
            </Btn>
          )}
          {document && <Btn onClick={() => openRun(document.run_id)}>{t("brief.openRun")}</Btn>}
          {document && !isToday && <span className="faint" style={{ fontSize: 12 }}>{t("brief.notToday")}</span>}
        </Thesis>
        {document?.content.connections?.[0] && <Connected connection={document.content.connections[0]} count={count} />}
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
            <WeekAhead days={document?.content.week ?? []} />
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
