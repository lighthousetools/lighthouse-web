import { Newspaper } from "lucide-react";
import { useAgentNames, useCosts, useRuns } from "../data";
import { agentName, dayTime, euro, isoWeek, plainSnippet, tokens, weekdayShort } from "../format";
import { t, useLanguage } from "../i18n";
import { go } from "../router";
import { Btn, Empty, Failure, Skeleton, Stat } from "../ui";
import { headingsOf, Markdown } from "../ui/markdown";
import { Gauge, Linked, Sec, Thesis } from "./briefing";
import { openRun } from "./runs";
import { costsByDay } from "./Today";

const DAY = 86_400_000;

/** Runs per weekday (Monday first) and hour, for the heat map. */
export function heat(starts: string[]) {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const start of starts) {
    const date = new Date(start);
    grid[(date.getDay() + 6) % 7]![date.getHours()]! += 1;
  }
  return grid;
}

/** The title and lead of a report: its first heading and the first paragraph after it. */
export function reportParts(report: string) {
  const heading = headingsOf(report)[0];
  const lines = report.split("\n");
  const lead = lines.slice(heading ? heading.line + 1 : 0).find((line) => line.trim() && !/^(#|\||```|[-*]\s|>)/.test(line.trim()));
  return { title: heading?.text.replace(/[*_`]/g, ""), lead: lead ? plainSnippet(lead) : undefined };
}

/** The report without its first heading, which already stands above it as the title. */
export function withoutTitle(report: string) {
  const heading = headingsOf(report)[0];
  if (!heading) return report;
  const lines = report.split("\n");
  lines.splice(heading.line, 1);
  return lines.join("\n").trim();
}

export function Weekly() {
  useLanguage();
  const runs = useRuns(200);
  const costs = useCosts(7);
  const names = useAgentNames();
  const now = new Date();
  const report = runs.data?.find((run) => /week/.test(run.agent_id) && run.report);
  const since = now.getTime() - 7 * DAY;
  const week = (runs.data ?? []).filter((run) => Date.parse(run.started_at) >= since && !["brain-ask", "agent-draft"].includes(run.agent_id));
  const days = costsByDay(costs.data ?? [], 7, now);
  const total = days.reduce((sum, day) => sum + day.cost, 0);
  const busiest = days.reduce((best, day, index) => (day.cost > (days[best]?.cost ?? 0) ? index : best), 0);
  const perDay = days.map((day) => week.filter((run) => run.started_at.slice(0, 10) === day.day).length);
  const succeeded = week.filter((run) => run.status === "succeeded").length;
  const failed = week.filter((run) => ["failed", "limit_exceeded"].includes(run.status)).length;
  const byAgent = Object.entries(
    week.reduce<Record<string, { count: number; cost: number }>>((map, run) => {
      const entry = (map[run.agent_id] ??= { count: 0, cost: 0 });
      entry.count += 1;
      entry.cost += run.cost_eur;
      return map;
    }, {}),
  ).sort((a, b) => b[1].count - a[1].count);
  const topAgent = byAgent[0]?.[1].count ?? 0;
  const providers = Object.entries(
    (costs.data ?? []).filter((cost) => days.some((day) => day.day === cost.day)).reduce<Record<string, number>>((map, cost) => ({ ...map, [cost.provider]: (map[cost.provider] ?? 0) + cost.cost_eur }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const topProvider = providers[0]?.[1] ?? 0;
  const grid = heat(week.map((run) => run.started_at));
  const peak = Math.max(1, ...grid.flat());
  const parts = report?.report ? reportParts(report.report) : null;
  const weekdays = Array.from({ length: 7 }, (_, index) => weekdayShort(new Date(2024, 0, 1 + index)));

  if (runs.isPending) return <div className="page"><Skeleton count={6} /></div>;
  return (
    <div className="page">
      <div className="bf">
        <Thesis
          kicker={[t("today.week", { week: isoWeek(now) }), report ? t("weekly.written", { time: dayTime(report.finished_at) }) : null, report ? agentName(report.agent_id, names) : null].filter(Boolean).join(" · ")}
          title={parts?.title ?? t("weekly.title", { week: isoWeek(now) })}
          lead={parts?.lead ?? (report ? t("weekly.leadReport") : t("weekly.emptyHint"))}
          side={
            <Gauge
              title={t("weekly.costsOpen")}
              big={euro(total)}
              label={t("weekly.costs")}
              bars={days.map((day) => day.cost)}
              hot={busiest}
              tip={(index) => `${weekdayShort(days[index]!.day)} ${euro(days[index]!.cost)}`}
              foot={total ? t("weekly.busiest", { day: weekdayShort(days[busiest]!.day) }) : t("weekly.quiet")}
              onClick={() => go("log")}
            />
          }
        >
          {report && <Btn onClick={() => openRun(report.id)}><Newspaper />{t("weekly.openRun")}</Btn>}
        </Thesis>
        <Failure error={runs.error ?? costs.error} />
        <div className="g4 rc-k">
          <Stat label={t("weekly.runs")} value={week.length} spark={perDay} delta={t("weekly.perDay", { count: (week.length / 7).toLocaleString(undefined, { maximumFractionDigits: 1 }) })} />
          <Stat label={t("status.succeeded")} value={succeeded} delta={t("agents.failed", { count: failed })} tone={failed ? "down" : "up"} />
          <Stat label={t("log.tokens")} value={tokens(week.reduce((sum, run) => sum + run.input_tokens + run.output_tokens, 0))} delta={t("weekly.inOut")} />
          <Stat label={t("weekly.agents")} value={byAgent.length} delta={byAgent[0] ? t("weekly.mostActive", { name: agentName(byAgent[0][0], names) }) : undefined} />
        </div>
        {report?.report ? (
          <Linked label={t("weekly.report")}>
            <div className="rc-rep"><Markdown source={withoutTitle(report.report)} /></div>
          </Linked>
        ) : (
          <div className="card" style={{ marginTop: 20 }}>
            <Empty icon={<Newspaper />} title={t("weekly.empty")} sub={t("weekly.emptyHint")} action={<Btn onClick={() => go("agents", "new")}>{t("agents.new")}</Btn>} />
          </div>
        )}
        <div className="bf-grid">
          <div className="bf-col">
            <Sec title={t("weekly.where")} hint={t("weekly.runs")}>
              {byAgent.length === 0 && <div className="bf-ok">{t("today.noActivity")}</div>}
              {byAgent.slice(0, 6).map(([id, entry]) => (
                <button type="button" key={id} className="rc-a" onClick={() => go("agents", id)}>
                  <span className="top"><b className="clip">{agentName(id, names)}</b><span className="tn">{entry.count}</span></span>
                  <span className="bar"><i style={{ width: `${(entry.count / topAgent) * 100}%` }} /></span>
                  <small className="tn">{euro(entry.cost)}</small>
                </button>
              ))}
            </Sec>
          </div>
          <div className="bf-col">
            <Sec title={t("weekly.when")}>
              <div className="rc-h">
                <div className="dl">{weekdays.map((day) => <span key={day}>{day.slice(0, 2)}</span>)}</div>
                <div className="gr">
                  {grid.flatMap((row, day) =>
                    row.map((value, hour) => (
                      <i key={`${day}-${hour}`} title={`${weekdays[day]} ${hour}:00 · ${value}`} style={{ opacity: value ? 0.25 + (value / peak) * 0.75 : 0.08 }} />
                    )),
                  )}
                </div>
                <div className="hl"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
              </div>
            </Sec>
          </div>
          <div className="bf-col">
            <Sec title={t("weekly.providers")} hint={euro(total)}>
              {providers.length === 0 && <div className="bf-ok">{t("today.costsEmpty")}</div>}
              {providers.map(([provider, cost]) => (
                <div key={provider} className="rc-a">
                  <span className="top"><b className="clip">{provider}</b><span className="tn">{euro(cost)}</span></span>
                  <span className="bar"><i style={{ width: `${topProvider ? (cost / topProvider) * 100 : 0}%` }} /></span>
                </div>
              ))}
            </Sec>
          </div>
        </div>
      </div>
    </div>
  );
}
