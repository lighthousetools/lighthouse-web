import { useQuery } from "@tanstack/react-query";
import { api, must } from "../api/client";
import { usePendingCount } from "../App";
import { Status, euro, when } from "../ui";

export function Today() {
  const pending = usePendingCount();
  const runs = useQuery({
    queryKey: ["runs", 8],
    queryFn: () => must(api.GET("/runs", { params: { query: { limit: 8 } } })),
  });
  const costs = useQuery({
    queryKey: ["costs", 7],
    queryFn: () => must(api.GET("/costs", { params: { query: { days: 7 } } })),
  });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => must(api.GET("/sessions", { params: { query: {} } })),
  });
  const agents = useQuery({ queryKey: ["agents"], queryFn: () => must(api.GET("/agents")) });
  const today = new Date().toISOString().slice(0, 10);
  const spentToday = costs.data
    ?.filter((cost) => cost.day === today)
    .reduce((sum, cost) => sum + cost.cost_eur, 0);
  const active = sessions.data?.filter((session) => session.status !== "done").length ?? 0;
  const next = agents.data
    ?.filter((agent) => agent.next_run)
    .sort((a, b) => a.next_run!.localeCompare(b.next_run!))[0];
  return (
    <>
      <h1>Today</h1>
      <div className="stats">
        <button className="card stat plain" onClick={() => (location.hash = "approvals")}>
          <strong>{pending}</strong>
          <span className="muted">need you</span>
        </button>
        <div className="card stat">
          <strong>{active}</strong>
          <span className="muted">active sessions</span>
        </div>
        <div className="card stat">
          <strong>{euro(spentToday ?? 0)}</strong>
          <span className="muted">model costs today</span>
        </div>
      </div>
      {next && (
        <p className="muted">
          Next: {next.name}, {when(next.next_run)}
        </p>
      )}
      <h2>Latest runs</h2>
      {runs.data?.length === 0 && <p className="empty">No runs yet.</p>}
      {runs.data?.map((run) => (
        <div className="card row" key={run.id}>
          <span>{run.agent_id}</span>
          <span className="actions">
            <span className="muted">{when(run.started_at)}</span>
            <Status value={run.status} />
          </span>
        </div>
      ))}
    </>
  );
}
