import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, must } from "../api/client";
import { Failure, Loaded, Markdown, Status, euro, when } from "../ui";

function Detail({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: ["runs", "detail", id],
    queryFn: () => must(api.GET("/runs/{id}", { params: { path: { id } } })),
  });
  if (!detail.data) return <Failure error={detail.error} />;
  const { run, steps } = detail.data;
  return (
    <>
      {run.reason && <p className="error">{run.reason}</p>}
      <table className="list">
        <thead>
          <tr>
            <th>Step</th>
            <th>Name</th>
            <th>Status</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.seq}>
              <td>{step.kind}</td>
              <td className="mono">{step.name}</td>
              <td>{step.status}</td>
              <td>{euro(step.cost_eur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {run.report && <Markdown text={run.report} />}
    </>
  );
}

export function Log() {
  const [open, setOpen] = useState<string | null>(null);
  const runs = useQuery({
    queryKey: ["runs", 100],
    queryFn: () => must(api.GET("/runs", { params: { query: { limit: 100 } } })),
  });
  return (
    <>
      <h1>Log</h1>
      <p className="muted">Every run with its tool calls, tokens and costs.</p>
      <Loaded query={runs} empty="No runs yet.">
        {(items) =>
          items.map((run) => (
            <div className="card" key={run.id}>
              <button
                className="plain"
                style={{ width: "100%", border: 0, padding: 0, textAlign: "left" }}
                aria-expanded={open === run.id}
                onClick={() => setOpen(open === run.id ? null : run.id)}
              >
                <div className="row">
                  <span>{run.agent_id}</span>
                  <span className="actions">
                    <span className="muted">
                      {when(run.started_at)}, {euro(run.cost_eur)}
                    </span>
                    <Status value={run.status} />
                  </span>
                </div>
              </button>
              {open === run.id && <Detail id={run.id} />}
            </div>
          ))
        }
      </Loaded>
    </>
  );
}
