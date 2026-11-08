import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, Eye, PencilLine, Plug, Plus } from "lucide-react";
import { Fragment, useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { useConnectors } from "../data";
import { humanize, toolName } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { openExternal } from "../shell/bridge";
import { toast } from "../shell/state";
import { Badge, Btn, Empty, Failure, PageHeader, SearchField, Seg, ServiceIcon, Skeleton } from "../ui";
import { canManage, useRole } from "../session";
import "./connections.css";

type Connector = Schemas["ConnectorInfo"];
type Filter = "all" | "connected" | "open";

function useConnect() {
  return useMutation({
    mutationFn: (id: string) => must(api.POST("/connectors/{id}/connect", { params: { path: { id } } })),
    onSuccess: (started) => {
      openExternal(started.authorize_url);
      toast(t("connections.continueThere"));
    },
    onError: (error) => toast(error.message, "bad"),
  });
}

function describe(connector: Connector) {
  const reads = connector.read_tools.length;
  const drafts = connector.draft_tools.length;
  return [
    reads ? (reads === 1 ? t("connections.readOne") : t("connections.reads", { count: reads })) : null,
    drafts ? (drafts === 1 ? t("connections.draftOne") : t("connections.drafts", { count: drafts })) : null,
  ].filter(Boolean).join(" · ") || t("connections.noTools");
}

function StateBadge({ connector }: { connector: Connector }) {
  return connector.connected ? <Badge tone="ok">{t("settings.connected")}</Badge> : <Badge tone="warn">{t("settings.notConnected")}</Badge>;
}

function Detail({ connector }: { connector: Connector }) {
  const connect = useConnect();
  const manage = canManage(useRole());
  return (
    <div className="cn">
      <button type="button" className="cn-back" onClick={() => go("connections")}>
        <ArrowLeft size={14} />
        {t("nav.connections")}
      </button>
      <header className="cn-head">
        <span className="cn-logo" style={{ width: 48, height: 48 }}><ServiceIcon name={connector.name} size={48} /></span>
        <div className="grow">
          <div className="t">
            <h1>{humanize(connector.name)}</h1>
            <StateBadge connector={connector} />
          </div>
          <p>{connector.auth === "oauth" ? t("connections.oauth") : t("connections.credential", { name: connector.name })}</p>
        </div>
        <div className="acts">
          {!manage ? (
            <small className="faint">{t("roles.connectorsAdmin")}</small>
          ) : connector.auth === "oauth" ? (
            <Btn variant={connector.connected ? "" : "primary"} disabled={connect.isPending} onClick={() => connect.mutate(connector.name)}>
              <ExternalLink />
              {connector.connected ? t("settings.reconnect") : t("settings.connect")}
            </Btn>
          ) : (
            <Btn onClick={() => go("settings", "credentials")}>{t("connections.toCredentials")}</Btn>
          )}
        </div>
      </header>
      <Failure error={connect.error} />
      <div className="sh">{t("connections.whatItMay")}<small>{connector.read_tools.length + connector.draft_tools.length}</small></div>
      <div className="card cn-tools">
        {connector.read_tools.map((tool) => (
          <div key={tool}>
            <Eye size={14} className="faint" />
            <span className="grow clip">{toolName(tool)} <span className="faint mono" style={{ fontSize: 12 }}>{tool}</span></span>
            <Badge>{t("connections.readsBadge")}</Badge>
          </div>
        ))}
        {connector.draft_tools.map((tool) => (
          <div key={tool}>
            <PencilLine size={14} className="faint" />
            <span className="grow clip">{toolName(tool)} <span className="faint mono" style={{ fontSize: 12 }}>{tool}</span></span>
            <Badge tone="info">{t("agents.asksFirst")}</Badge>
          </div>
        ))}
        {connector.read_tools.length + connector.draft_tools.length === 0 && <p className="st-emp">{t("connections.noTools")}</p>}
      </div>
      <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>{t("connections.guard")}</p>
    </div>
  );
}

export function Connections() {
  useLanguage();
  const route = useRoute();
  const connectors = useConnectors();
  const connect = useConnect();
  const manage = canManage(useRole());
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const all = connectors.data ?? [];
  const current = route.param ? all.find((connector) => connector.name === route.param) : undefined;
  if (current) {
    return <div className="page"><Detail connector={current} /></div>;
  }
  const needle = query.trim().toLowerCase();
  const shown = all.filter(
    (connector) =>
      (filter === "all" || (filter === "connected" ? connector.connected : !connector.connected)) &&
      (!needle || `${connector.name} ${connector.read_tools.join(" ")} ${connector.draft_tools.join(" ")}`.toLowerCase().includes(needle)),
  );
  const connected = all.filter((connector) => connector.connected).length;
  const groups: [string, Connector[]][] = [
    [t("settings.connected"), shown.filter((connector) => connector.connected)],
    [t("settings.notConnected"), shown.filter((connector) => !connector.connected)],
  ];
  return (
    <div className="page">
      <div className="cn">
        <PageHeader title={t("nav.connections")} sub={t("connections.lead", { count: connected, total: all.length })} />
        <div className="cn-bar">
          <Seg<Filter>
            label={t("connections.filter")}
            value={filter}
            onChange={setFilter}
            options={[["all", t("connections.filterAll"), all.length], ["connected", t("settings.connected"), connected], ["open", t("settings.notConnected"), all.length - connected]]}
          />
          <span className="grow" />
          <div className="cn-q"><SearchField value={query} onChange={setQuery} placeholder={t("connections.search")} /></div>
        </div>
        <Failure error={connectors.error ?? connect.error} />
        {connectors.isPending && <Skeleton count={4} height={58} />}
        {!connectors.isPending && all.length === 0 && (
          <div className="card"><Empty icon={<Plug />} title={t("settings.connectorsEmpty")} sub={t("connections.emptyHint")} /></div>
        )}
        {all.length > 0 && shown.length === 0 && (
          <div className="cn-none"><b>{t("palette.empty")}</b><Btn size="sm" onClick={() => { setFilter("all"); setQuery(""); }}>{t("connections.showAll")}</Btn></div>
        )}
        {groups.map(([title, list]) =>
          list.length ? (
            <Fragment key={title}>
              <div className="sh">{title}<small>{list.length}</small></div>
              <div className="cn-grid">
                {list.map((connector) => (
                  <div key={connector.name} className="cn-row" role="button" tabIndex={0} onClick={() => go("connections", connector.name)} onKeyDown={(event) => event.key === "Enter" && go("connections", connector.name)}>
                    <span className="cn-logo" style={{ width: 32, height: 32 }}><ServiceIcon name={connector.name} size={32} /></span>
                    <span className="grow">
                      <span className="n"><b>{humanize(connector.name)}</b><StateBadge connector={connector} /></span>
                      <span className="d">{describe(connector)}</span>
                    </span>
                    {connector.connected ? (
                      <span className="cn-add on" title={t("settings.connected")}><Check size={14} /></span>
                    ) : !manage ? null : connector.auth === "oauth" ? (
                      <button
                        type="button"
                        className="cn-add"
                        aria-label={t("connections.connectNamed", { name: connector.name })}
                        onClick={(event) => {
                          event.stopPropagation();
                          connect.mutate(connector.name);
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cn-add"
                        aria-label={t("connections.toCredentials")}
                        onClick={(event) => {
                          event.stopPropagation();
                          go("settings", "credentials");
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Fragment>
          ) : null,
        )}
      </div>
    </div>
  );
}
