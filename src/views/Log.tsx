import { ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { useAgentNames, useRuns } from "../data";
import { agentName, dayTime, euro, tokens } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { inspector } from "../shell/state";
import { Btn, Empty, Failure, PageHeader, SearchField, Seg, Skeleton } from "../ui";
import { RunDot, RunStatus, openRun, runSeconds, seconds } from "./runs";

type Filter = "all" | "running" | "failed" | "succeeded";

const matches = (status: string, filter: Filter) =>
  filter === "all" ||
  (filter === "running" ? status === "running" || status === "waiting" : filter === "failed" ? ["failed", "rejected", "limit_exceeded"].includes(status) : status === filter);

export function Log() {
  useLanguage();
  const route = useRoute();
  const [limit, setLimit] = useState(100);
  const runs = useRuns(limit);
  const names = useAgentNames();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (route.param) openRun(route.param);
  }, [route.param]);
  // Closing the inspector also leaves the deep link, so the address matches what you see.
  useEffect(
    () =>
      inspector.subscribe(() => {
        if (inspector.get().length === 0 && location.hash.startsWith("#log/")) go("log");
      }),
    [],
  );
  const all = runs.data ?? [];
  const needle = query.trim().toLowerCase();
  const shown = all.filter((run) => matches(run.status, filter) && (!needle || agentName(run.agent_id, names).toLowerCase().includes(needle)));
  const count = (value: Filter) => all.filter((run) => matches(run.status, value)).length;
  const total = shown.reduce((sum, run) => sum + run.cost_eur, 0);
  return (
    <div className="page">
      <PageHeader title={t("nav.log")} sub={t("log.lead")}>
        <SearchField value={query} onChange={setQuery} placeholder={t("log.search")} />
      </PageHeader>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <Seg<Filter>
          label={t("log.filter")}
          value={filter}
          onChange={setFilter}
          options={[["all", t("log.filterAll"), count("all")], ["running", t("status.running"), count("running")], ["failed", t("log.filterFailed"), count("failed")], ["succeeded", t("status.succeeded"), count("succeeded")]]}
        />
        <span className="grow" />
        <span className="faint tn" style={{ fontSize: 12 }}>{t("log.total", { count: shown.length, cost: euro(total) })}</span>
      </div>
      <Failure error={runs.error} />
      {runs.isPending ? (
        <Skeleton count={8} height={40} />
      ) : all.length === 0 ? (
        <div className="card"><Empty icon={<ScrollText />} title={t("log.empty")} sub={t("log.emptyHint")} /></div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t("agents.agent")}</th>
                <th>{t("log.started")}</th>
                <th className="r">{t("log.duration")}</th>
                <th className="r">{t("log.tokens")}</th>
                <th className="r">{t("log.cost")}</th>
                <th>{t("log.status")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((run) => (
                <tr
                  key={run.id}
                  className="click"
                  tabIndex={0}
                  aria-selected={route.param === run.id}
                  onClick={() => go("log", run.id)}
                  onKeyDown={(event) => event.key === "Enter" && go("log", run.id)}
                >
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <RunDot status={run.status} />
                      {agentName(run.agent_id, names)}
                    </span>
                  </td>
                  <td className="muted">{dayTime(run.started_at)}</td>
                  <td className="r">{seconds(runSeconds(run))}</td>
                  <td className="r">{tokens(run.input_tokens + run.output_tokens)}</td>
                  <td className="r">{euro(run.cost_eur)}</td>
                  <td><RunStatus status={run.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="ag-none" style={{ padding: 16, color: "var(--ink3)" }}>{t("log.noneInFilter")}</p>}
        </div>
      )}
      {all.length >= limit && (
        <div style={{ marginTop: 12 }}>
          <Btn onClick={() => setLimit(limit + 200)}>{t("log.more")}</Btn>
        </div>
      )}
    </div>
  );
}
