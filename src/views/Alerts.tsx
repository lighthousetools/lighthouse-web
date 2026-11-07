import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellOff, Check, CheckCheck, Clock, ExternalLink, Eye, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { useAlerts } from "../data";
import { dateTime, dayTime, humanize } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { openExternal } from "../shell/bridge";
import { toast } from "../shell/state";
import { Badge, Btn, Dot, Empty, Failure, Seg, ServiceIcon, Skeleton, Stat, brandOf, type Tone } from "../ui";
import { age } from "./Ready";
import "./alerts.css";

type Alert = Schemas["Alert"];
type View = "active" | "acknowledged" | "resolved";
const SEVERITIES = ["critical", "warning", "info"] as const;
const TONE: Record<string, Tone> = { critical: "bad", warning: "warn", info: "info" };

/** What to look at next for an alert, from its kind and key. */
export function nextStep(alert: Pick<Alert, "kind" | "key">): { label: string; view: "connections" | "agents" | "sessions" | "log"; param?: string } {
  const [, subject] = alert.key.split(/:(.*)/);
  switch (alert.kind) {
    case "connector":
      return { label: t("alerts.next.connector"), view: "connections", param: subject };
    case "run_failed":
    case "cost_limit":
      return { label: t("alerts.next.agent"), view: "agents", param: subject };
    case "node_offline":
      return { label: t("alerts.next.node"), view: "sessions" };
    default:
      return { label: t("alerts.next.log"), view: "log" };
  }
}

const severityLabel = (severity: string) => t(`alerts.severity.${severity as "critical"}`);
const statusLabel = (status: string) => t(`alerts.status.${status as "open"}`);

function serviceOf(alert: Alert) {
  if (alert.source?.kind) return alert.source.kind;
  const [, subject] = alert.key.split(/:(.*)/);
  return alert.kind === "connector" ? subject : alert.kind === "node_offline" ? "claude" : "lighthouse";
}

function Detail({ alert }: { alert: Alert }) {
  const client = useQueryClient();
  const act = useMutation({
    mutationFn: (action: "acknowledge" | "resolve") =>
      action === "acknowledge"
        ? must(api.POST("/alerts/{id}/acknowledge", { params: { path: { id: alert.id } } }))
        : must(api.POST("/alerts/{id}/resolve", { params: { path: { id: alert.id } } })),
    onSuccess: (_, action) => {
      toast(action === "acknowledge" ? t("alerts.acknowledged") : t("alerts.resolved"));
      void client.invalidateQueries({ queryKey: ["alerts"] });
      void client.invalidateQueries({ queryKey: ["ready"] });
    },
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea") || event.metaKey || event.ctrlKey || event.altKey || document.querySelector(".palbg, .modalbg")) return;
      if (event.key.toLowerCase() === "b" && alert.status === "open") act.mutate("acknowledge");
      if (event.key.toLowerCase() === "e" && alert.status !== "resolved") act.mutate("resolve");
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  const next = nextStep(alert);
  const history = [
    { at: alert.first_seen_at, text: t("alerts.firstSeen"), tone: TONE[alert.severity] },
    ...(alert.count > 1 ? [{ at: alert.last_seen_at, text: t("alerts.again", { count: alert.count }), tone: TONE[alert.severity] }] : []),
    ...(alert.acknowledged_at ? [{ at: alert.acknowledged_at, text: t("alerts.acknowledged"), tone: "" as Tone }] : []),
    ...(alert.resolved_at ? [{ at: alert.resolved_at, text: t("alerts.resolved"), tone: "ok" as Tone }] : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="al-d" key={alert.id}>
      <div className="al-dh">
        <div className="grow">
          <div className="k">
            <ServiceIcon name={brandOf(serviceOf(alert))} fallback={alert.kind} size={16} />
            <Badge tone={TONE[alert.severity]}>{severityLabel(alert.severity)}</Badge>
            <Badge tone={alert.status === "resolved" ? "ok" : alert.status === "open" ? "bad" : ""}>{statusLabel(alert.status)}</Badge>
            <span className="faint tn">{t("alerts.since", { age: age(alert.first_seen_at) })}</span>
          </div>
          <h2>{alert.title}</h2>
          <p>{alert.detail ?? humanize(alert.kind)}</p>
        </div>
        <button type="button" className="al-how" onClick={() => go(next.view, next.param)}>
          <span className="lv"><Wrench size={14} /></span>
          <span className="grow">
            <b>{t("alerts.whatToDo")}</b>
            <small>{next.label}</small>
          </span>
        </button>
      </div>
      <div className="al-acts">
        {alert.status === "open" && (
          <Btn kbd="B" disabled={act.isPending} onClick={() => act.mutate("acknowledge")}><Eye />{t("alerts.acknowledge")}</Btn>
        )}
        {alert.status !== "resolved" && (
          <Btn variant="primary" kbd="E" disabled={act.isPending} onClick={() => act.mutate("resolve")}><CheckCheck />{t("alerts.resolve")}</Btn>
        )}
        <span className="grow" />
        {alert.source?.url && (
          <Btn variant="ghost" onClick={() => openExternal(alert.source!.url!)}><ExternalLink />{alert.source.label ?? alert.source.reference}</Btn>
        )}
        <Btn variant="ghost" onClick={() => go(next.view, next.param)}>{next.label}</Btn>
      </div>
      <Failure error={act.error} />
      <div className="al-g">
        <div className="col">
          <div className="al-stats">
            <Stat label={t("alerts.count")} value={alert.count} delta={alert.count > 1 ? t("alerts.repeats") : t("alerts.once")} />
            <Stat label={t("alerts.firstSeen")} value={<span style={{ fontSize: 15 }}>{dayTime(alert.first_seen_at)}</span>} />
            <Stat label={t("alerts.lastSeen")} value={<span style={{ fontSize: 15 }}>{dayTime(alert.last_seen_at)}</span>} />
          </div>
          <div className="card">
            <div className="al-nd">
              <ShieldCheck size={16} className="faint" />
              <div className="grow">
                <b>{t(`alerts.kind.${alert.kind as "connector"}`)}</b>
                <p>{t(`alerts.explain.${alert.kind as "connector"}`)}</p>
              </div>
            </div>
            <div className="al-nd">
              <Clock size={16} className="faint" />
              <div className="grow">
                <b className="mono" style={{ fontSize: 12 }}>{alert.key}</b>
                <p>{t("alerts.keyHint")}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="card al-tl">
          <div className="ch">{t("alerts.history")}<small>{history.length}</small></div>
          <ol>
            {history.map((entry, index) => (
              <li key={index} className={entry.tone ?? ""}>
                <i />
                <span className="faint tn" style={{ fontSize: 12 }}>{dateTime(entry.at)}</span>
                <div>{entry.text}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export function Alerts() {
  useLanguage();
  const route = useRoute();
  const [view, setView] = useState<View>("active");
  const active = useAlerts("active");
  const acknowledged = useAlerts("acknowledged");
  const resolved = useAlerts("resolved");
  const query = view === "active" ? active : view === "acknowledged" ? acknowledged : resolved;
  const list = query.data ?? [];
  const current = list.find((alert) => alert.id === route.param) ?? list[0];
  const open = (active.data ?? []).filter((alert) => alert.status === "open").length;
  return (
    <div className="page flush">
      <div className="alv">
        <header className="al-h">
          <h1>{t("nav.alerts")}</h1>
          <p>{open ? t("alerts.lead", { count: open }) : t("alerts.leadNone")}</p>
        </header>
        <div className="al-b0">
          <div className="al-l">
            <div className="top">
              <Seg<View>
                label={t("alerts.view")}
                value={view}
                onChange={setView}
                options={[
                  ["active", t("alerts.active"), active.data?.length ?? 0],
                  ["acknowledged", t("alerts.status.acknowledged"), acknowledged.data?.length ?? 0],
                  ["resolved", t("alerts.status.resolved"), resolved.data?.length ?? 0],
                ]}
              />
            </div>
            <div className="ls">
              {query.isPending && <Skeleton count={4} height={60} />}
              <Failure error={query.error} />
              {SEVERITIES.map((severity) => {
                const group = list.filter((alert) => alert.severity === severity);
                if (!group.length) return null;
                return (
                  <div key={severity}>
                    <div className="gr"><Dot tone={TONE[severity]} />{severityLabel(severity)}<em>{group.length}</em></div>
                    {group.map((alert) => (
                      <button
                        type="button"
                        key={alert.id}
                        className={`al-r ${alert.id === current?.id ? "on" : ""} ${alert.status === "open" ? "open" : ""}`}
                        onClick={() => go("alerts", alert.id)}
                      >
                        <ServiceIcon name={brandOf(serviceOf(alert))} fallback={alert.kind} size={20} />
                        <span className="grow">
                          <span className="tt">{alert.title}</span>
                          <span className="z-st clip">{t("alerts.since", { age: age(alert.first_seen_at) })}{alert.count > 1 ? ` · ${t("alerts.times", { count: alert.count })}` : ""}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {!query.isPending && list.length === 0 && (
                <p className="al-none faint" style={{ padding: 12, fontSize: 13 }}>{view === "active" ? t("alerts.noneActive") : t("approvals.nothingHere")}</p>
              )}
            </div>
          </div>
          {current ? (
            <Detail alert={current} />
          ) : (
            <div className="al-d">
              <Empty icon={view === "active" ? <Check /> : <BellOff />} title={t("alerts.allQuiet")} sub={t("alerts.allQuietHint")} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
