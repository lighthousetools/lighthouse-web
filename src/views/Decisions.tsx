import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { agentName, dateTime, toolName } from "../format";
import { t, tOr } from "../i18n";
import { Failure } from "../ui";

type Field = { key: string; label: string; value: string };

/** Reads like the thing it describes, so a mail starts with its recipient. */
const FIELD_ORDER = [
  "from", "to", "cc", "bcc", "channel", "subject", "title", "command", "path", "file_path", "url",
  "query", "message", "description", "comment", "body", "text", "content",
];

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(", ");
  return JSON.stringify(value);
}

/** Lists tool arguments as labeled text. Names we don't know keep their own. */
export function plainFields(input: unknown): Field[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input === null || input === undefined ? [] : [{ key: "value", label: "", value: asText(input) }];
  }
  const rank = (key: string) => {
    const index = FIELD_ORDER.indexOf(key);
    return index === -1 ? FIELD_ORDER.length : index;
  };
  return Object.entries(input)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([key, value]) => ({
      key,
      label: tOr(`field.${key}`, key.replace(/[-_]+/g, " ")),
      value: asText(value),
    }));
}

function Fields({ input }: { input: unknown }) {
  const fields = plainFields(input);
  return (
    <>
      {fields.length > 0 && (
        <dl className="fields">
          {fields.map((field) => (
            <div key={field.key} style={{ display: "contents" }}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <details className="tech">
        <summary>{t("approvals.details")}</summary>
        <pre className="code">{JSON.stringify(input, null, 2)}</pre>
      </details>
    </>
  );
}

function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["approvals"] });
    void client.invalidateQueries({ queryKey: ["permissions"] });
  };
}

export function ProposalCard({
  approval,
  names,
}: {
  approval: Schemas["Approval"];
  names?: Record<string, string>;
}) {
  const refresh = useRefresh();
  const [text, setText] = useState(JSON.stringify(approval.input, null, 2));
  const [editing, setEditing] = useState(false);
  const decide = useMutation({
    mutationFn: (approve: boolean) => {
      let input: unknown;
      if (editing && approve) {
        try {
          input = JSON.parse(text);
        } catch {
          throw new Error(t("approvals.invalidJson"));
        }
      }
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
    <article className="edge attn fade">
      <div className="top">
        <span className="src">{approval.tool.split(".")[0]}</span>
        {t("approvals.proposes", { agent: agentName(approval.agent_id, names) })}
      </div>
      <h3 className="ti">{toolName(approval.tool)}</h3>
      {approval.reason && (
        <p className="why">
          <strong>{t("approvals.why")}: </strong>
          {approval.reason}
        </p>
      )}
      {approval.quotes_external && <p className="note">{t("approvals.external")}</p>}
      {editing ? (
        <label className="lab" style={{ marginTop: 8 }}>
          {t("approvals.arguments")}
          <textarea
            className="field code"
            rows={8}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
      ) : (
        <Fields input={approval.input} />
      )}
      {approval.consulted.length > 0 && (
        <p className="muted" style={{ marginTop: 6 }}>
          {t("approvals.consulted")}: {approval.consulted.map(toolName).join(", ")}
        </p>
      )}
      <Failure error={decide.error} />
      <div className="spread" style={{ marginTop: 10 }}>
        <div className="actions">
          <button className="btn primary" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
            {t("approvals.approve")}
          </button>
          <button className="btn" onClick={() => setEditing(!editing)}>
            {editing ? t("approvals.stopEdit") : t("approvals.edit")}
          </button>
          <button className="btn danger" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
            {t("approvals.deny")}
          </button>
        </div>
        <span className="muted">{t("common.expires", { time: dateTime(approval.expires_at) })}</span>
      </div>
    </article>
  );
}

export function PermissionCard({ request }: { request: Schemas["Permission"] }) {
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
    <article className="edge attn fade">
      <div className="top">
        <span className="src">Claude Code</span>
        {request.project}
      </div>
      <h3 className="ti">{t("approvals.claudeWants", { tool: request.tool })}</h3>
      <Fields input={request.input} />
      <Failure error={decide.error} />
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
          {t("approvals.allow")}
        </button>
        <button className="btn danger" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
          {t("approvals.deny")}
        </button>
      </div>
    </article>
  );
}
