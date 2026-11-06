import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { useAgents } from "../data";
import { dateTime } from "../format";
import { t, useLanguage } from "../i18n";
import { Confirm, Failure, Head, Loaded, Section } from "../ui";

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
    <div className="card fade">
      <label className="lab">
        {t("agents.file")}
        <textarea
          className="field code"
          rows={16}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
      </label>
      <Failure error={save.error} />
      <div className="actions">
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {t("common.save")}
        </button>
        <button className="btn" onClick={onClose}>
          {t("common.cancel")}
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
      <label className="lab">
        {t("agents.createLabel")}
        <textarea
          className="field"
          placeholder={t("agents.createPlaceholder")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <Failure error={draft.error} />
      <button className="btn primary" disabled={draft.isPending || !description.trim()} onClick={() => draft.mutate()}>
        {draft.isPending ? t("agents.writing") : t("agents.write")}
      </button>
    </div>
  );
}

function AgentCard({ agent }: { agent: Schemas["AgentInfo"] }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const run = useMutation({
    mutationFn: () => must(api.POST("/agents/{id}/run", { params: { path: { id: agent.id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["runs"] }),
  });
  const remove = useMutation({
    mutationFn: () => must(api.DELETE("/agents/{id}", { params: { path: { id: agent.id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["agents"] }),
  });
  if (editing) return <Editor initial={agent.source} onClose={() => setEditing(false)} />;
  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ fontSize: 15, marginBottom: 0 }}>{agent.name}</h2>
        <span className="muted">
          {agent.schedule ? t("agents.next", { time: dateTime(agent.next_run) }) : t("agents.manual")}
        </span>
      </div>
      {agent.tools.length > 0 && (
        <div className="tools">
          {agent.tools.map((tool) => (
            <span key={tool.name} className={`src ${tool.level === "write" ? "write" : ""}`}>
              {tool.name}
            </span>
          ))}
        </div>
      )}
      {agent.blocked.map((reason) => (
        <p className="error" key={reason}>{reason}</p>
      ))}
      <Failure error={run.error ?? remove.error} />
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn" disabled={run.isPending || agent.blocked.length > 0} onClick={() => run.mutate()}>
          {t("agents.run")}
        </button>
        {agent.editable ? (
          <>
            <button className="btn" onClick={() => setEditing(true)}>{t("agents.edit")}</button>
            <button className="btn danger" onClick={() => setConfirming(true)}>{t("common.delete")}</button>
          </>
        ) : (
          <span className="muted">{t("agents.managed")}</span>
        )}
        {run.isSuccess && <span className="pill run">{t("agents.started")}</span>}
      </div>
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

export function Agents() {
  useLanguage();
  const agents = useAgents();
  return (
    <div className="content narrow">
      <Head title={t("nav.agents")} lead={t("agents.lead")} />
      <Creator />
      <Section title={t("agents.all")} count={agents.data?.length}>
        <Loaded query={agents} empty={t("agents.empty")} hint={t("agents.emptyHint")}>
          {(items) => items.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
        </Loaded>
      </Section>
    </div>
  );
}
