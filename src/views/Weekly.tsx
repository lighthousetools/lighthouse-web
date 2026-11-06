import { useQuery } from "@tanstack/react-query";
import { api, must } from "../api/client";
import { Failure, Markdown, when } from "../ui";

/** Shows the latest finished run of an agent whose ID mentions the week. */
export function Weekly() {
  const runs = useQuery({
    queryKey: ["runs", 200],
    queryFn: () => must(api.GET("/runs", { params: { query: { limit: 200 } } })),
  });
  const report = runs.data?.find((run) => /week/.test(run.agent_id) && run.report);
  return (
    <>
      <h1>Weekly report</h1>
      <Failure error={runs.error} />
      {runs.data && !report && <p className="empty">No weekly report yet.</p>}
      {report?.report && (
        <>
          <p className="muted">
            {report.agent_id}, {when(report.finished_at)}
          </p>
          <div className="card">
            <Markdown text={report.report} />
          </div>
        </>
      )}
    </>
  );
}
