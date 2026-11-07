import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { api, must, type Schemas } from "../api/client";
import { useAgentNames, useRun } from "../data";
import { agentName, dateTime, euro, humanize, statusLabel, time, toolName, tokens } from "../format";
import { t, tOr, type Key } from "../i18n";
import { InspectorPanel } from "../shell/Inspector";
import { inspect, toast } from "../shell/state";
import { Badge, Btn, Dot, Failure, Skeleton, type Tone } from "../ui";
import { Markdown } from "../ui/markdown";

export const RUN_TONES: Record<string, Tone> = {
  succeeded: "ok", running: "info", waiting: "warn", failed: "bad", rejected: "bad", limit_exceeded: "bad",
};

export function runSentence(run: Schemas["RunRecord"], names: Record<string, string>) {
  const agent = agentName(run.agent_id, names);
  const when = time(run.finished_at ?? run.started_at);
  const key = `run.${run.status}`;
  return tOr(key, "") ? t(key as Key, { agent, time: when }) : t("run.other", { agent, time: time(run.started_at) });
}

/** Seconds a run took, or has taken so far. */
export function runSeconds(run: Schemas["RunRecord"], now = Date.now()) {
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  return Math.max(0, Math.round((end - Date.parse(run.started_at)) / 1000));
}

export function seconds(value: number) {
  if (value < 60) return `${value} s`;
  const minutes = Math.floor(value / 60);
  return minutes < 60 ? `${minutes}:${String(value % 60).padStart(2, "0")} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function RunStatus({ status }: { status: string }) {
  return <Badge tone={RUN_TONES[status] ?? ""}>{statusLabel(status)}</Badge>;
}

export function RunDot({ status }: { status: string }) {
  return <Dot tone={status === "running" ? "live" : RUN_TONES[status] ?? ""} />;
}

function stepResult(status: string) {
  return tOr(`log.${status}`, statusLabel(status));
}

/** Everything about one run: what it did step by step, what it cost, and its report. */
export function RunInspector({ id }: { id: string }) {
  const detail = useRun(id);
  const names = useAgentNames();
  const client = useQueryClient();
  const again = useMutation({
    mutationFn: (agent: string) => must(api.POST("/agents/{id}/run", { params: { path: { id: agent } } })),
    onSuccess: () => {
      toast(t("agents.started"));
      void client.invalidateQueries({ queryKey: ["runs"] });
    },
  });
  const run = detail.data?.run;
  const steps = detail.data?.steps ?? [];
  const canRepeat = run && !["brain-ask", "agent-draft"].includes(run.agent_id);
  return (
    <InspectorPanel
      wide
      kind={t("log.run")}
      icon={run ? <RunDot status={run.status} /> : undefined}
      title={run ? agentName(run.agent_id, names) : t("common.loading")}
      facts={
        run
          ? [
              [t("log.status"), <RunStatus key="s" status={run.status} />],
              [t("log.started"), dateTime(run.started_at)],
              [t("log.duration"), seconds(runSeconds(run))],
              [t("log.trigger"), tOr(`trigger.${run.trigger}`, humanize(run.trigger))],
              [t("log.tokens"), tokens(run.input_tokens + run.output_tokens)],
              [t("log.cost"), euro(run.cost_eur)],
              ...(run.activity ? [[t("log.activity"), toolName(run.activity)] as [string, string]] : []),
            ]
          : []
      }
      actions={
        canRepeat ? (
          <Btn disabled={again.isPending} onClick={() => again.mutate(run.agent_id)}>
            <Play />
            {t("log.runAgain")}
          </Btn>
        ) : undefined
      }
    >
      {detail.isPending && <Skeleton count={4} height={36} />}
      <Failure error={detail.error ?? again.error} />
      {run?.reason && <p className="fail">{run.reason}</p>}
      {steps.length > 0 && (
        <>
          <div className="sh">{t("log.steps")}<small>{steps.length}</small></div>
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("log.step")}</th>
                  <th>{t("log.name")}</th>
                  <th>{t("log.result")}</th>
                  <th className="r">{t("log.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step) => (
                  <tr key={step.seq} title={step.detail ?? undefined}>
                    <td className="muted">{tOr(`log.kind.${step.kind}`, humanize(step.kind))}</td>
                    <td className="mono clip" style={{ fontSize: 12, maxWidth: 220 }}>{step.name}</td>
                    <td>{stepResult(step.status)}</td>
                    <td className="r">{euro(step.cost_eur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {run?.report && (
        <>
          <div className="sh">{t("log.report")}</div>
          <Markdown source={run.report} />
        </>
      )}
    </InspectorPanel>
  );
}

export function openRun(id: string) {
  inspect(`run:${id}`, <RunInspector id={id} />);
}
