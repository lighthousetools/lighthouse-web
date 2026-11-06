import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { Failure, Loaded, Status, when } from "../ui";

function Editor({ initial, onClose }: { initial: string; onClose: () => void }) {
  const client = useQueryClient();
  const [source, setSource] = useState(initial);
  const save = useMutation({
    mutationFn: () => must(api.POST("/agents", { body: { source } })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["agents"] });
      onClose();
    },
  });
  return (
    <div className="card">
      <label>
        Agent file
        <textarea
          className="mono"
          rows={16}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
      </label>
      <Failure error={save.error} />
      <div className="actions">
        <button className="primary" disabled={save.isPending} onClick={() => save.mutate()}>
          Save
        </button>
        <button className="plain" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Creator() {
  const [description, setDescription] = useState("");
  const draft = useMutation({
    mutationFn: () => must(api.POST("/agents/draft", { body: { description } })),
  });
  if (draft.data) return <Editor initial={draft.data.source} onClose={() => draft.reset()} />;
  return (
    <div className="card">
      <label>
        What should the new agent do?
        <textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <Failure error={draft.error} />
      <button
        className="primary"
        disabled={draft.isPending || !description.trim()}
        onClick={() => draft.mutate()}
      >
        {draft.isPending ? "Writing…" : "Write agent"}
      </button>
    </div>
  );
}

function AgentCard({ agent }: { agent: Schemas["AgentInfo"] }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ["agents"] });
  const run = useMutation({
    mutationFn: () => must(api.POST("/agents/{id}/run", { params: { path: { id: agent.id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["runs"] }),
  });
  const remove = useMutation({
    mutationFn: () => must(api.DELETE("/agents/{id}", { params: { path: { id: agent.id } } })),
    onSuccess: refresh,
  });
  if (editing) return <Editor initial={agent.source} onClose={() => setEditing(false)} />;
  return (
    <div className="card">
      <div className="row">
        <strong>{agent.name}</strong>
        <span className="muted">
          {agent.schedule ? `Next ${when(agent.next_run)}` : "Manual"}
        </span>
      </div>
      <p className="actions">
        {agent.tools.map((tool) => (
          <span key={tool.name} className={`pill ${tool.level === "write" ? "warn" : ""}`}>
            {tool.name}
          </span>
        ))}
      </p>
      {agent.blocked.map((reason) => (
        <p className="error" key={reason}>
          {reason}
        </p>
      ))}
      <Failure error={run.error ?? remove.error} />
      <div className="actions">
        <button
          className="primary"
          disabled={run.isPending || agent.blocked.length > 0}
          onClick={() => run.mutate()}
        >
          Run now
        </button>
        {agent.editable ? (
          <>
            <button className="plain" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="danger" onClick={() => remove.mutate()}>
              Delete
            </button>
          </>
        ) : (
          <span className="muted">Managed as a file on the server</span>
        )}
        {run.isSuccess && <Status value="running" />}
      </div>
    </div>
  );
}

export function Agents() {
  const agents = useQuery({ queryKey: ["agents"], queryFn: () => must(api.GET("/agents")) });
  return (
    <>
      <h1>Agents</h1>
      <Creator />
      <h2>All agents</h2>
      <Loaded query={agents} empty="No agents yet.">
        {(items) => items.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
      </Loaded>
    </>
  );
}
