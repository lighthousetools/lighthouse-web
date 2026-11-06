import { useAgentNames, useRuns } from "../data";
import { agentName, dateTime } from "../format";
import { t, useLanguage } from "../i18n";
import { Empty, Failure, Head, Markdown, Skeleton } from "../ui";

/** Shows the latest finished run of an agent whose ID mentions the week. */
export function Weekly() {
  useLanguage();
  const runs = useRuns(200);
  const names = useAgentNames();
  const report = runs.data?.find((run) => /week/.test(run.agent_id) && run.report);
  return (
    <div className="content narrow">
      <Head
        title={t("nav.weekly")}
        lead={report ? `${agentName(report.agent_id, names)}, ${dateTime(report.finished_at)}` : undefined}
      />
      <Failure error={runs.error} />
      {runs.isPending && <Skeleton />}
      {runs.data && !report && <Empty title={t("weekly.empty")} hint={t("weekly.emptyHint")} />}
      {report?.report && (
        <div className="card">
          <Markdown text={report.report} />
        </div>
      )}
    </div>
  );
}
