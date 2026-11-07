import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Bot, Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { useAgentNames, useAgents, useCosts, useNeedsYou, useRuns } from "../data";
import { agentName, dayTime, euro, toolName } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import {
  Badge, Btn, Confirm, Dot, Empty, Failure, PageHeader, Progress, Seg, ServiceIcon, Skeleton, Stat, brandOf, type Tone,
} from "../ui";
import { clock, useNow } from "../ui/live";
import { costsByDay } from "./briefing";
import { RunDot, RunStatus, openRun, runSeconds, seconds } from "./runs";
import "./agents.css";

type Agent = Schemas["AgentInfo"];
type Filter = "all" | "scheduled" | "manual";

/** How freely an agent acts: write tools always ask first, read-only agents only look. */
export function freedom(agent: Agent): { label: string; tone: Tone } {
  if (agent.blocked.length) return { label: t("agents.blocked"), tone: "bad" };
  if (agent.tools.some((tool) => tool.level === "write")) return { label: t("agents.asksFirst"), tone: "info" };
  if (agent.tools.length === 0) return { label: t("agents.noTools"), tone: "" };
  return { label: t("agents.readOnly"), tone: "" };
}

function Tile({ size = 32 }: { size?: number }) {
  return (
    <span className="ag-tile" style={{ width: size, height: size }}>
      <Bot size={size * 0.45} />
    </span>
  );
}

function useRunAgent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => must(api.POST("/agents/{id}/run", { params: { path: { id } } })),
    onSuccess: (started) => {
      toast(t("agents.started"));
      void client.invalidateQueries({ queryKey: ["runs"] });
      openRun(started.id);
    },
    onError: (error) => toast(error.message, "bad"),
  });
}

function SourceEditor({ initial, onClose, onSaved }: { initial: string; onClose: () => void; onSaved?: (agent: Agent) => void }) {
  const client = useQueryClient();
  const [source, setSource] = useState(initial);
  const save = useMutation({
    mutationFn: () => must(api.POST("/agents", { body: { source } })),
    onSuccess: (agent) => {
      toast(t("agents.saved"));
      void client.invalidateQueries({ queryKey: ["agents"] });
      onSaved?.(agent);
      onClose();
    },
  });
  return (
    <div className="card ag-src">
      <label>
        <span className="lbl" style={{ marginTop: 0 }}>{t("agents.file")}</span>
        <textarea className="ta mono" spellCheck={false} value={source} onChange={(event) => setSource(event.target.value)} />
      </label>
      <Failure error={save.error} />
      <div className="acts">
        <Btn variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Btn>
        <Btn onClick={onClose}>{t("common.cancel")}</Btn>
      </div>
    </div>
  );
}

function Creator() {
  const [description, setDescription] = useState("");
  const draft = useMutation({ mutationFn: () => must(api.POST("/agents/draft", { body: { description } })) });
  return (
    <div className="ag-page">
      <button type="button" className="ag-back" onClick={() => go("agents")}>
        <ArrowLeft size={14} />
        {t("nav.agents")}
      </button>
      <header className="ag-hd">
        <Tile size={40} />
        <div className="grow">
          <h1>{t("agents.new")}</h1>
          <p>{t("agents.newLead")}</p>
        </div>
      </header>
      {draft.data ? (
        <SourceEditor initial={draft.data.source} onClose={() => draft.reset()} onSaved={(agent) => go("agents", agent.id)} />
      ) : (
        <div className="card pad ag-new">
          <label>
            <span className="lbl" style={{ marginTop: 0 }}>{t("agents.createLabel")}</span>
            <textarea
              className="ta"
              autoFocus
              placeholder={t("agents.createPlaceholder")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <Failure error={draft.error} />
          <div>
            <Btn variant="primary" disabled={draft.isPending || !description.trim()} onClick={() => draft.mutate()}>
              <Sparkles />
              {draft.isPending ? t("agents.writing") : t("agents.write")}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function RunRows({ runs, names, empty }: { runs: Schemas["RunRecord"][]; names: Record<string, string>; empty: string }) {
  return (
    <div className="card ag-tbl">
      {runs.map((run) => (
        <div key={run.id} className="ag-hist" role="button" tabIndex={0} onClick={() => openRun(run.id)} onKeyDown={(event) => event.key === "Enter" && openRun(run.id)}>
          <RunDot status={run.status} />
          <span className="grow clip">{agentName(run.agent_id, names)}</span>
          <span className="c">{dayTime(run.started_at)}</span>
          <span className="c tn">{seconds(runSeconds(run))}</span>
          <span className="c tn">{euro(run.cost_eur)}</span>
          <RunStatus status={run.status} />
        </div>
      ))}
      {runs.length === 0 && <p className="ag-none">{empty}</p>}
    </div>
  );
}

function Detail({ agent }: { agent: Agent }) {
  const client = useQueryClient();
  const names = useAgentNames();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const run = useRunAgent();
  const runs = useQuery({
    queryKey: ["runs", "agent", agent.id],
    queryFn: () => must(api.GET("/agents/{id}/runs", { params: { path: { id: agent.id } } })),
  });
  const remove = useMutation({
    mutationFn: () => must(api.DELETE("/agents/{id}", { params: { path: { id: agent.id } } })),
    onSuccess: () => {
      toast(t("agents.deleted", { name: agent.name }));
      void client.invalidateQueries({ queryKey: ["agents"] });
      go("agents");
    },
  });
  const list = runs.data ?? [];
  const succeeded = list.filter((item) => item.status === "succeeded").length;
  const cost = list.reduce((sum, item) => sum + item.cost_eur, 0);
  const free = freedom(agent);
  return (
    <div className="ag-page">
      <button type="button" className="ag-back" onClick={() => go("agents")}>
        <ArrowLeft size={14} />
        {t("nav.agents")}
      </button>
      <header className="ag-hd">
        <Tile size={40} />
        <div className="grow">
          <h1>{agent.name}</h1>
          <p>{agent.schedule ? t("agents.next", { time: dayTime(agent.next_run) }) : t("agents.manual")}</p>
        </div>
        <Btn disabled={run.isPending || agent.blocked.length > 0} onClick={() => run.mutate(agent.id)}>
          <Play />
          {t("agents.run")}
        </Btn>
        {agent.editable && (
          <>
            <Btn onClick={() => setEditing(!editing)}>
              <Pencil />
              {t("agents.edit")}
            </Btn>
            <Btn icon variant="ghost" aria-label={t("common.delete")} onClick={() => setConfirming(true)}>
              <Trash2 />
            </Btn>
          </>
        )}
      </header>
      <Failure error={remove.error} />
      {agent.blocked.map((reason) => (
        <p key={reason} className="fail ag-blocked"><AlertTriangle size={14} />{reason}</p>
      ))}
      {editing ? (
        <SourceEditor initial={agent.source} onClose={() => setEditing(false)} />
      ) : (
        <>
          <div className="g4">
            <Stat label={t("agents.runs")} value={runs.isPending ? "–" : list.length} delta={t("agents.succeeded", { count: succeeded })} />
            <Stat label={t("agents.successRate")} value={list.length ? `${Math.round((succeeded / list.length) * 100)} %` : "–"} />
            <Stat label={t("agents.costTotal")} value={euro(cost)} delta={list.length ? t("agents.perRun", { cost: euro(cost / list.length) }) : undefined} />
            <Stat label={t("agents.lastRun")} value={<span style={{ fontSize: 15 }}>{list[0] ? dayTime(list[0].started_at) : t("agents.never")}</span>} />
          </div>
          <h3 className="ag-h">{t("agents.tools")}</h3>
          <div className="card ag-tools">
            {agent.tools.map((tool) => (
              <div key={tool.name}>
                <ServiceIcon name={brandOf(tool.name.split(".")[0])} fallback={tool.name} size={20} />
                <span className="grow clip">
                  {toolName(tool.name)} <span className="faint mono">{tool.name}</span>
                </span>
                <Badge tone={tool.level === "write" ? "info" : ""}>{tool.level === "write" ? t("agents.asksFirst") : t("agents.readOnly")}</Badge>
              </div>
            ))}
            {agent.tools.length === 0 && <p className="ag-none">{t("agents.noTools")}</p>}
          </div>
          <h3 className="ag-h">{t("agents.whenHow")}</h3>
          <div className="card ag-kv">
            <div><span>{t("agents.schedule")}</span><b className="mono">{agent.schedule ?? t("agents.manual")}</b></div>
            <div><span>{t("agents.freedom")}</span><b><Badge tone={free.tone}>{free.label}</Badge></b></div>
            <div><span>{t("agents.delivers")}</span><b>{agent.deliver.length ? agent.deliver.join(", ") : t("common.none")}</b></div>
            <div><span>{t("agents.skills")}</span><b>{agent.skills.length ? agent.skills.join(", ") : t("common.none")}</b></div>
            {!agent.editable && <div><span>{t("agents.file")}</span><b>{t("agents.managed")}</b></div>}
          </div>
          <h3 className="ag-h">{t("agents.recentRuns")}</h3>
          {runs.isPending ? <Skeleton count={3} height={40} /> : <RunRows runs={list.slice(0, 20)} names={names} empty={t("agents.noRuns")} />}
        </>
      )}
      {confirming && (
        <Confirm
          title={t("agents.deleteConfirm", { name: agent.name })}
          action={t("common.delete")}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function RunningRow({ run, names }: { run: Schemas["RunRecord"]; names: Record<string, string> }) {
  const now = useNow(1000);
  const elapsed = now - Date.parse(run.started_at);
  return (
    <div className="ag-live" role="button" tabIndex={0} onClick={() => openRun(run.id)} onKeyDown={(event) => event.key === "Enter" && openRun(run.id)}>
      <RunDot status={run.status} />
      <div className="grow">
        <div className="clip t">{agentName(run.agent_id, names)}</div>
        <div className="clip s">{run.activity ? t("run.activity", { step: toolName(run.activity) }) : t("status.running")}</div>
      </div>
      <div className="pr"><Progress value={Math.min(95, (elapsed / 120_000) * 100)} color={run.status === "waiting" ? "var(--warn)" : undefined} /></div>
      <span className="tn m">{clock(elapsed)}</span>
      <span className="tn m">{euro(run.cost_eur)}</span>
      <Btn size="xs" onClick={() => openRun(run.id)}>{t("agents.watch")}</Btn>
    </div>
  );
}

function Overview() {
  const agents = useAgents();
  const runs = useRuns(100);
  const costs = useCosts(1);
  const needs = useNeedsYou();
  const names = useAgentNames();
  const run = useRunAgent();
  const [filter, setFilter] = useState<Filter>("all");
  const all = agents.data ?? [];
  const list = all.filter((agent) => filter === "all" || (filter === "scheduled" ? agent.schedule : !agent.schedule));
  const history = (runs.data ?? []).filter((item) => !["brain-ask", "agent-draft"].includes(item.agent_id));
  const running = history.filter((item) => item.status === "running" || item.status === "waiting");
  const today = costsByDay(costs.data ?? [], 1)[0]?.cost ?? 0;
  const todayIso = new Date().toISOString().slice(0, 10);
  const costToday = (id: string) => history.filter((item) => item.agent_id === id && item.started_at.slice(0, 10) === todayIso).reduce((sum, item) => sum + item.cost_eur, 0);
  const lastRun = (id: string) => history.find((item) => item.agent_id === id);
  const scheduled = all.filter((agent) => agent.schedule).length;
  return (
    <div className="ag-page">
      <PageHeader
        title={t("nav.agents")}
        sub={running.length ? t("agents.leadRunning", { count: running.length }) : t("agents.lead")}
      >
        <Seg<Filter>
          label={t("agents.filter")}
          value={filter}
          onChange={setFilter}
          options={[["all", t("agents.filterAll"), all.length], ["scheduled", t("agents.filterScheduled"), scheduled], ["manual", t("agents.filterManual"), all.length - scheduled]]}
        />
        <Btn variant="primary" onClick={() => go("agents", "new")}>
          <Plus />
          {t("agents.new")}
        </Btn>
      </PageHeader>
      <div className="g4">
        <Stat label={t("agents.runningNow")} value={running.length} delta={t("agents.waitingForYou", { count: needs.approvals.length })} />
        <Stat label={t("today.costsToday")} value={euro(today)} />
        <Stat label={t("agents.runs")} value={history.length} delta={t("agents.lastHundred")} />
        <Stat
          label={t("agents.successRate")}
          value={history.length ? `${Math.round((history.filter((item) => item.status === "succeeded").length / history.length) * 100)} %` : "–"}
          delta={t("agents.failed", { count: history.filter((item) => item.status === "failed").length })}
        />
      </div>
      {running.length > 0 && (
        <>
          <h3 className="ag-h">{t("agents.runningNow")}</h3>
          <div className="card ag-tbl">
            {running.map((item) => <RunningRow key={item.id} run={item} names={names} />)}
          </div>
        </>
      )}
      <h3 className="ag-h">{t("agents.yours")}</h3>
      {agents.isPending ? (
        <Skeleton count={4} height={56} />
      ) : agents.isError ? (
        <Failure error={agents.error} />
      ) : all.length === 0 ? (
        <div className="card">
          <Empty icon={<Bot />} title={t("agents.empty")} sub={t("agents.emptyHint")} action={<Btn variant="primary" onClick={() => go("agents", "new")}><Plus />{t("agents.new")}</Btn>} />
        </div>
      ) : (
        <div className="card ag-tbl">
          <div className="ag-th">
            <span>{t("agents.agent")}</span>
            <span>{t("agents.tools")}</span>
            <span>{t("agents.freedom")}</span>
            <span>{t("agents.nextRun")}</span>
            <span className="r">{t("today.today")}</span>
            <span />
          </div>
          {list.map((agent) => {
            const free = freedom(agent);
            const last = lastRun(agent.id);
            const busy = running.some((item) => item.agent_id === agent.id);
            return (
              <div key={agent.id} className={`ag-tr ${agent.blocked.length ? "off" : ""}`} role="button" tabIndex={0} onClick={() => go("agents", agent.id)} onKeyDown={(event) => event.key === "Enter" && go("agents", agent.id)}>
                <span className="nm">
                  <Tile />
                  <span className="grow">
                    <span className="t clip">{agent.name}{busy && <Dot tone="live" />}</span>
                    <span className="s clip">{last ? t("agents.lastRunAt", { time: dayTime(last.started_at) }) : agent.schedule ? agent.schedule : t("agents.manual")}</span>
                  </span>
                </span>
                <span className="c tools">
                  {agent.tools.slice(0, 3).map((tool) => <ServiceIcon key={tool.name} name={brandOf(tool.name.split(".")[0])} fallback={tool.name} size={18} />)}
                  {agent.tools.length > 3 && <span className="faint" style={{ fontSize: 12, marginLeft: 4 }}>+{agent.tools.length - 3}</span>}
                </span>
                <span><Badge tone={free.tone}>{free.label}</Badge></span>
                <span className="c">{agent.next_run ? dayTime(agent.next_run) : t("agents.onRequest")}</span>
                <span className="c r tn">{euro(costToday(agent.id))}</span>
                <span className="r">
                  <Btn icon size="xs" variant="ghost" aria-label={t("agents.runNamed", { name: agent.name })} disabled={run.isPending || agent.blocked.length > 0} onClick={() => run.mutate(agent.id)}>
                    <Play />
                  </Btn>
                </span>
              </div>
            );
          })}
          {list.length === 0 && <p className="ag-none">{t("agents.noneInFilter")}</p>}
        </div>
      )}
      <h3 className="ag-h">{t("agents.recentRuns")}</h3>
      {runs.isPending ? <Skeleton count={3} height={40} /> : <RunRows runs={history.slice(0, 8)} names={names} empty={t("agents.noRuns")} />}
    </div>
  );
}

export function Agents() {
  useLanguage();
  const route = useRoute();
  const agents = useAgents();
  if (route.param === "new") return <div className="agex-ag"><Creator /></div>;
  const agent = route.param ? agents.data?.find((item) => item.id === route.param) : undefined;
  if (route.param && agents.isPending) return <div className="page"><Skeleton count={5} /></div>;
  return <div className="agex-ag">{agent ? <Detail key={agent.id} agent={agent} /> : <Overview />}</div>;
}
