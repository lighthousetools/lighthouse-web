import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, must } from "../api/client";
import { useSessions } from "../data";
import { dateTime, euro } from "../format";
import { t, useLanguage } from "../i18n";
import { Dot, Failure, Head, Loaded, Section, Status } from "../ui";

const EDGE: Record<string, string> = { waiting: "attn", running: "info", done: "ok" };

export function Sessions() {
  useLanguage();
  const client = useQueryClient();
  const nodes = useQuery({ queryKey: ["nodes"], queryFn: () => must(api.GET("/nodes")) });
  const sessions = useSessions();
  const pause = useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) =>
      must(api.PATCH("/nodes/{id}", { params: { path: { id } }, body: { paused } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["nodes"] }),
  });
  return (
    <div className="content narrow">
      <Head title={t("nav.sessions")} lead={t("sessions.lead")} />
      <Failure error={pause.error} />
      <Section title={t("sessions.machines")} count={nodes.data?.length}>
        <Loaded query={nodes} empty={t("sessions.none")} hint={t("sessions.noneHint")}>
          {(items) => (
            <div className="card">
              {items.map((node) => (
                <div className="qrow" key={node.id}>
                  <Dot tone={node.paused ? "attn" : node.online ? "ok" : "off"} />
                  <span className="l">
                    {node.name}{" "}
                    <span className="muted">
                      {node.paused ? t("sessions.paused") : node.online ? t("sessions.online") : t("sessions.offline")}
                    </span>
                  </span>
                  <button
                    className={`btn sm ${node.paused ? "" : "danger"}`}
                    onClick={() => pause.mutate({ id: node.id, paused: !node.paused })}
                  >
                    {node.paused ? t("sessions.resume") : t("sessions.pause")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Loaded>
      </Section>
      <Section title={t("sessions.claude")} count={sessions.data?.length}>
        <Loaded query={sessions} empty={t("sessions.empty")}>
          {(items) =>
            items.map((session) => (
              <article className={`edge ${EDGE[session.status] ?? ""}`} key={`${session.node_id}-${session.id}`}>
                <div className="spread">
                  <div className="top">
                    <span className="src">{session.node_name}</span>
                    {session.branch}
                  </div>
                  <Status value={session.status} />
                </div>
                <h3 className="ti">{session.project}</h3>
                {session.summary && <p className="de">{session.summary}</p>}
                <p className="muted">
                  {dateTime(session.updated_at)} · {euro(session.cost_eur)}
                </p>
              </article>
            ))
          }
        </Loaded>
      </Section>
    </div>
  );
}
