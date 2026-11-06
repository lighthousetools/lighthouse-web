import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, must } from "../api/client";
import { Failure, Loaded, Status, euro, when } from "../ui";

export function Sessions() {
  const client = useQueryClient();
  const nodes = useQuery({ queryKey: ["nodes"], queryFn: () => must(api.GET("/nodes")) });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => must(api.GET("/sessions", { params: { query: {} } })),
  });
  const pause = useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) =>
      must(api.PATCH("/nodes/{id}", { params: { path: { id } }, body: { paused } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["nodes"] }),
  });
  return (
    <>
      <h1>Sessions</h1>
      <h2>Machines</h2>
      <Failure error={pause.error} />
      <Loaded query={nodes} empty="No machine is connected. See Settings to add one.">
        {(items) =>
          items.map((node) => (
            <div className="card row" key={node.id}>
              <span>
                {node.name} <span className="muted">{node.online ? "online" : "offline"}</span>
              </span>
              <button
                className={node.paused ? "primary" : "danger"}
                onClick={() => pause.mutate({ id: node.id, paused: !node.paused })}
              >
                {node.paused ? "Resume" : "Pause, deny all"}
              </button>
            </div>
          ))
        }
      </Loaded>
      <h2>Claude Code</h2>
      <Loaded query={sessions} empty="No sessions yet.">
        {(items) =>
          items.map((session) => (
            <div className="card" key={`${session.node_id}-${session.id}`}>
              <div className="row">
                <strong>{session.project}</strong>
                <Status value={session.status} />
              </div>
              <p className="muted">
                {session.node_name}
                {session.branch ? `, ${session.branch}` : ""}, {when(session.updated_at)},{" "}
                {euro(session.cost_eur)}
              </p>
              {session.summary && <p>{session.summary}</p>}
            </div>
          ))
        }
      </Loaded>
    </>
  );
}
