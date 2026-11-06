import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { Failure, when } from "../ui";

function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["approvals"] });
    void client.invalidateQueries({ queryKey: ["permissions"] });
  };
}

function Proposal({ approval }: { approval: Schemas["Approval"] }) {
  const refresh = useRefresh();
  const [text, setText] = useState(JSON.stringify(approval.input, null, 2));
  const [editing, setEditing] = useState(false);
  const decide = useMutation({
    mutationFn: (approve: boolean) => {
      const input = editing && approve ? (JSON.parse(text) as unknown) : undefined;
      return must(
        api.POST("/approvals/{id}/decision", {
          params: { path: { id: approval.id } },
          body: { approve, input },
        }),
      );
    },
    onSuccess: refresh,
  });
  return (
    <div className="card">
      <div className="row">
        <strong>{approval.tool}</strong>
        <span className="muted">{approval.agent_id}</span>
      </div>
      {approval.quotes_external && (
        <p className="notice">
          This run read external content, which may have shaped the proposal. Check it carefully.
        </p>
      )}
      {editing ? (
        <textarea
          aria-label="Arguments"
          className="mono"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      ) : (
        <pre>{text}</pre>
      )}
      <Failure error={decide.error} />
      <div className="actions">
        <button className="primary" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
          Approve
        </button>
        <button className="plain" onClick={() => setEditing(!editing)}>
          {editing ? "Stop editing" : "Edit"}
        </button>
        <button className="danger" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
          Deny
        </button>
      </div>
      <p className="muted">Expires {when(approval.expires_at)}</p>
    </div>
  );
}

function SessionRequest({ request }: { request: Schemas["Permission"] }) {
  const refresh = useRefresh();
  const decide = useMutation({
    mutationFn: (allow: boolean) =>
      must(
        api.POST("/permissions/{id}/decision", {
          params: { path: { id: request.id } },
          body: { allow },
        }),
      ),
    onSuccess: refresh,
  });
  return (
    <div className="card">
      <div className="row">
        <strong>{request.tool}</strong>
        <span className="muted">Claude Code, {request.project}</span>
      </div>
      <pre>{JSON.stringify(request.input, null, 2)}</pre>
      <Failure error={decide.error} />
      <div className="actions">
        <button className="primary" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
          Allow
        </button>
        <button className="danger" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
          Deny
        </button>
      </div>
    </div>
  );
}

export function Approvals() {
  const refresh = useRefresh();
  const approvals = useQuery({
    queryKey: ["approvals", "pending"],
    queryFn: () => must(api.GET("/approvals", { params: { query: { status: "pending" } } })),
  });
  const permissions = useQuery({
    queryKey: ["permissions", "pending"],
    queryFn: () => must(api.GET("/permissions", { params: { query: { status: "pending" } } })),
    refetchInterval: 5_000,
  });
  const batch = useMutation({
    mutationFn: (approve: boolean) =>
      must(
        api.POST("/approvals/decisions", {
          body: { approve, ids: approvals.data?.map((item) => item.id) ?? [] },
        }),
      ),
    onSuccess: refresh,
  });
  const none = approvals.data?.length === 0 && permissions.data?.length === 0;
  return (
    <>
      <h1>Approvals</h1>
      <p className="muted">Nothing with external effect happens without your decision.</p>
      <Failure error={approvals.error ?? permissions.error ?? batch.error} />
      {none && <p className="empty">Nothing is waiting for you.</p>}
      {permissions.data?.map((request) => (
        <SessionRequest key={request.id} request={request} />
      ))}
      {(approvals.data?.length ?? 0) > 1 && (
        <div className="actions">
          <button className="plain" onClick={() => batch.mutate(true)}>
            Approve all {approvals.data?.length}
          </button>
          <button className="danger" onClick={() => batch.mutate(false)}>
            Deny all
          </button>
        </div>
      )}
      {approvals.data?.map((approval) => (
        <Proposal key={approval.id} approval={approval} />
      ))}
    </>
  );
}
