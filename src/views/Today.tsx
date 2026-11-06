import { useQuery } from "@tanstack/react-query";
import { api, must, type Schemas } from "../api/client";
import { useAgentNames, useAgents, useConnectors, useMe, useNeedsYou, useRuns } from "../data";
import {
  agentName, euro, greeting, isoWeek, longDate, time, toolName, weekday,
} from "../format";
import { t, tOr, useLanguage, type Key } from "../i18n";
import { go } from "../router";
import { Dot, Markdown, Section, Skeleton } from "../ui";
import { AskBox } from "./Ask";
import { PermissionCard, ProposalCard } from "./Decisions";

export function runSentence(run: Schemas["RunRecord"], names: Record<string, string>) {
  const agent = agentName(run.agent_id, names);
  const when = time(run.finished_at ?? run.started_at);
  return t(`run.${run.status}` as Key, { agent, time: when });
}

const RUN_TONES: Record<string, "ok" | "run" | "attn" | "err"> = {
  succeeded: "ok", running: "run", waiting: "attn", failed: "err", rejected: "err", limit_exceeded: "err",
};

function Activity() {
  const runs = useRuns(12);
  const names = useAgentNames();
  if (runs.isPending) return <Skeleton count={2} />;
  // Questions and drafts were asked for a moment ago, so they are not news.
  const list = (runs.data ?? []).filter((run) => !["agent-draft", "brain-ask"].includes(run.agent_id));
  if (list.length === 0) return <p className="muted">{t("today.noActivity")}</p>;
  return (
    <ul className="feed">
      {list.slice(0, 8).map((run) => (
        <li key={run.id}>
          <span className="t">{time(run.started_at)}</span>
          <Dot tone={RUN_TONES[run.status]} />
          <button onClick={() => go("log", run.id)}>
            {tOr(`run.${run.status}`, "") ? runSentence(run, names) : t("run.other", { agent: agentName(run.agent_id, names), time: time(run.started_at) })}
            {run.status === "running" && run.activity && (
              <span className="muted"> · {t("run.activity", { step: toolName(run.activity) })}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Briefing() {
  const runs = useRuns(50);
  const brief = runs.data?.find((run) => run.agent_id.includes("brief") && run.report);
  if (!brief?.report) return null;
  return (
    <section className="summary fade">
      <div className="eyebrow">
        {t("today.summary")} · {t("today.summaryFrom", { time: time(brief.finished_at) })}
      </div>
      <Markdown text={brief.report} />
    </section>
  );
}

function Rail() {
  const needs = useNeedsYou();
  const connectors = useConnectors();
  const agents = useAgents();
  const costs = useQuery({
    queryKey: ["costs", 1],
    queryFn: () => must(api.GET("/costs", { params: { query: { days: 1 } } })),
  });
  const today = new Date().toISOString().slice(0, 10);
  const spent = (costs.data ?? []).filter((cost) => cost.day === today);
  const total = spent.reduce((sum, cost) => sum + cost.cost_eur, 0);
  const top = Math.max(...spent.map((cost) => cost.cost_eur), 0);
  const upcoming = (agents.data ?? [])
    .filter((agent) => agent.next_run)
    .sort((a, b) => a.next_run!.localeCompare(b.next_run!))
    .slice(0, 5);
  const broken = (connectors.data ?? []).filter((connector) => !connector.connected);
  return (
    <aside className="rail">
      <section>
        <h2>{t("today.open")}</h2>
        <div className="qrow">
          <Dot tone={needs.decisions ? "attn" : "ok"} />
          <span className="l">{t("nav.approvals")}</span>
          <span className="r">{needs.decisions}</span>
        </div>
        <div className="qrow">
          <Dot tone={needs.waiting.length ? "attn" : "ok"} />
          <span className="l">{t("today.waitingSessions")}</span>
          <span className="r">{needs.waiting.length}</span>
        </div>
        {broken.map((connector) => (
          <div className="qrow" key={connector.name}>
            <Dot tone="err" />
            <span className="l">{t("today.notConnected", { name: connector.name })}</span>
            <button className="btn sm" onClick={() => go("settings")}>{t("today.fix")}</button>
          </div>
        ))}
      </section>
      <section>
        <h2>{t("today.coming")}</h2>
        {upcoming.length === 0 && <p className="muted">{t("today.comingEmpty")}</p>}
        {upcoming.map((agent) => (
          <div className="qrow" key={agent.id}>
            <span className="mono" style={{ color: "var(--ink-3)" }}>{time(agent.next_run)}</span>
            <span className="l">{agent.name}</span>
            <span className="r">{weekday(agent.next_run!)}</span>
          </div>
        ))}
      </section>
      <section>
        <h2 className="spread">
          {t("today.costs")} <span className="mono">{euro(total)}</span>
        </h2>
        {spent.length === 0 && <p className="muted">{t("today.costsEmpty")}</p>}
        {spent.map((cost) => (
          <div className="bar-row" key={cost.provider}>
            <span>{cost.provider}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${top ? (cost.cost_eur / top) * 100 : 0}%` }} />
            </div>
            <span className="v">{euro(cost.cost_eur)}</span>
          </div>
        ))}
      </section>
    </aside>
  );
}

export function Today() {
  useLanguage();
  const me = useMe();
  const needs = useNeedsYou();
  const names = useAgentNames();
  const now = new Date();
  const first = me.data?.name.split(" ")[0];
  const hello = greeting(now.getHours());
  const lead =
    needs.total === 0
      ? t("today.nothing")
      : needs.total === 1
        ? t("today.needs.one")
        : t("today.needs.other", { count: needs.total });
  return (
    <div className="content">
      <header className="head">
        <div>
          <div className="eyebrow">
            {longDate(now)} · {t("today.week", { week: isoWeek(now) })}
          </div>
          <h1>{first ? t("today.greeting", { greeting: hello, name: first }) : hello}</h1>
          <p className="sub">{lead}</p>
        </div>
      </header>
      <div className="today">
        <div>
          <AskBox />
          <Briefing />
          {needs.total > 0 && (
            <Section title={t("today.needsYou")} count={needs.total}>
              {needs.permissions.map((request) => (
                <PermissionCard key={request.id} request={request} />
              ))}
              {needs.approvals.map((approval) => (
                <ProposalCard key={approval.id} approval={approval} names={names} />
              ))}
              {needs.waiting.map((session) => (
                <article className="edge attn" key={`${session.node_id}-${session.id}`}>
                  <div className="top">
                    <span className="src">{session.node_name}</span>
                    {session.branch}
                  </div>
                  <h3 className="ti">{session.project}</h3>
                  {session.summary && <p className="de">{session.summary}</p>}
                </article>
              ))}
            </Section>
          )}
          <Section title={t("today.activity")}>
            <Activity />
          </Section>
        </div>
        <Rail />
      </div>
    </div>
  );
}
