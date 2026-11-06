import { useQuery } from "@tanstack/react-query";
import { api, must } from "../api/client";
import { useAgentNames, useRuns } from "../data";
import { agentName, dateTime, euro, humanize, statusLabel } from "../format";
import { t, tOr, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { Failure, Head, Loaded, Markdown, Status } from "../ui";

function stepResult(status: string) {
  return tOr(`log.${status}`, statusLabel(status));
}

function Detail({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: ["runs", "detail", id],
    queryFn: () => must(api.GET("/runs/{id}", { params: { path: { id } } })),
  });
  if (!detail.data) return <Failure error={detail.error} />;
  const { run, steps } = detail.data;
  return (
    <div className="fade">
      {run.reason && <p className="error">{run.reason}</p>}
      {steps.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="list">
            <thead>
              <tr>
                <th>{t("log.step")}</th>
                <th>{t("log.name")}</th>
                <th>{t("log.result")}</th>
                <th>{t("log.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr key={step.seq}>
                  <td>{tOr(`log.kind.${step.kind}`, humanize(step.kind))}</td>
                  <td className="mono">{step.name}</td>
                  <td>{stepResult(step.status)}</td>
                  <td>{euro(step.cost_eur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {run.report && (
        <div style={{ marginTop: 12 }}>
          <Markdown text={run.report} />
        </div>
      )}
    </div>
  );
}

export function Log() {
  useLanguage();
  const route = useRoute();
  const runs = useRuns(100);
  const names = useAgentNames();
  return (
    <div className="content narrow">
      <Head title={t("nav.log")} lead={t("log.lead")} />
      <Loaded query={runs} empty={t("log.empty")}>
        {(items) =>
          items.map((run) => (
            <div className="card" key={run.id}>
              <button
                className="rowbtn"
                aria-expanded={route.param === run.id}
                onClick={() => (route.param === run.id ? go("log") : go("log", run.id))}
              >
                <div className="spread">
                  <span>{agentName(run.agent_id, names)}</span>
                  <span className="actions">
                    <span className="muted">
                      {dateTime(run.started_at)} · {euro(run.cost_eur)}
                    </span>
                    <Status value={run.status} />
                  </span>
                </div>
              </button>
              {route.param === run.id && <Detail id={run.id} />}
            </div>
          ))
        }
      </Loaded>
    </div>
  );
}
