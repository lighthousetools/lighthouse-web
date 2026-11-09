import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, Eye, KeyRound, PencilLine, Plug, Plus, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import { api, must } from "../api/client";
import { humanize, toolName } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { openExternal } from "../shell/bridge";
import { toast } from "../shell/state";
import { Badge, Btn, Confirm, Empty, Failure, Field, Modal, PageHeader, SearchField, Seg, ServiceIcon, Skeleton, Toggle } from "../ui";
import { SecretModal, SourceBadge, TargetPicker, targetOf, useEffective, useManage, usePresets, useRefresh, words, type Target, type View } from "./layers";
import { ConnectorCatalog } from "./ConnectorCatalog";
import "./connections.css";

type Connector = View["connectors"][number];
type Filter = "all" | "connected" | "open";
type Auth = "none" | "bearer" | "oauth";

const isConnected = (connector: Connector) => connector.enabled && connector.connected != null;
const canConnect = (connector: Connector) => connector.auth === "oauth" || connector.auth === "bearer";

function useConnect() {
  return useMutation({
    mutationFn: ({ name, scope }: { name: string; scope: Target }) =>
      must(api.POST("/connectors/{id}/connect", { params: { path: { id: name }, query: { scope: scope === "me" ? "personal" : "tenant" } } })),
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
  if (!connector.enabled) return <Badge>{t("connections.off")}</Badge>;
  if (!isConnected(connector)) return <Badge tone="warn">{t("settings.notConnected")}</Badge>;
  if (connector.connected === "personal") return <Badge tone="ok">{t("connections.connectedMine")}</Badge>;
  return <Badge tone="ok">{t("settings.connected")}</Badge>;
}

/** Adds or changes a connector over HTTP, for the workspace or for the caller alone. */
function ConnectorModal({ existing, onClose }: { existing?: Connector; onClose: () => void }) {
  const manage = useManage();
  const refresh = useRefresh();
  const presets = usePresets();
  const fixed = existing ? targetOf(existing.source, manage) : null;
  const [target, setTarget] = useState<Target>(fixed ?? (manage ? "tenant" : "me"));
  const [name, setName] = useState(existing?.name ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [auth, setAuth] = useState<Auth>((existing?.auth as Auth | undefined) ?? "oauth");
  const [clientId, setClientId] = useState(existing?.client_id ?? "");
  const [scopes, setScopes] = useState(existing?.scopes.join(" ") ?? "");
  const [reads, setReads] = useState(existing?.read_tools.join(", ") ?? "");
  const [drafts, setDrafts] = useState(existing?.draft_tools.join(", ") ?? "");
  const save = useMutation({
    mutationFn: () =>
      must(
        api.PUT("/settings/{layer}/connectors/{name}", {
          params: { path: { layer: target, name } },
          body: {
            url: url.trim(),
            auth,
            client_id: clientId.trim() || null,
            scopes: words(scopes),
            read_tools: words(reads),
            draft_tools: words(drafts),
            enabled: existing?.enabled ?? true,
          },
        }),
      ),
    onSuccess: () => {
      toast(existing ? t("connections.saved") : t("connections.added", { name }));
      refresh();
      onClose();
      if (!existing) go("connections", name);
    },
  });
  const valid = /^[a-z][a-z0-9_-]{0,39}$/.test(name) && /^https?:\/\//.test(url.trim()) && !url.includes("{");
  return (
    <Modal
      wide
      title={existing ? t("connections.editTitle", { name: humanize(existing.name) }) : t("connections.addTitle")}
      sub={t("connections.addHint")}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{existing ? t("common.save") : t("connections.add")}</Btn>
        </>
      }
    >
      <div className="lay-form">
      {!existing && <TargetPicker value={target} onChange={setTarget} />}
      {!existing && (presets.data?.connectors?.length ?? 0) > 0 && (
        <ConnectorCatalog
          presets={presets.data?.connectors ?? []}
          selected={name}
          onPick={(preset) => {
            setName(preset.id);
            setUrl(preset.url);
            setAuth((preset.auth as Auth) ?? "oauth");
            setReads((preset.read_tools ?? []).join(", "));
            setDrafts((preset.draft_tools ?? []).join(", "));
          }}
        />
      )}
      <Field value={name} onChange={setName} disabled={!!existing} label={t("connections.name")} placeholder={t("connections.name")} />
      {name && !/^[a-z][a-z0-9_-]{0,39}$/.test(name) && <small className="faint">{t("models.nameRule")}</small>}
      <Field value={url} onChange={setUrl} label={t("connections.url")} placeholder="https://" />
      <Seg<Auth> label={t("connections.auth")} value={auth} onChange={setAuth} options={[["oauth", t("connections.authOauth")], ["bearer", t("connections.authBearer")], ["none", t("connections.authNone")]]} />
      {auth === "oauth" && (
        <div className="lay-two">
          <Field value={clientId} onChange={setClientId} label={t("connections.clientId")} placeholder={t("connections.clientIdHint")} />
          <Field value={scopes} onChange={setScopes} label={t("connections.scopes")} placeholder={t("connections.scopes")} />
        </div>
      )}
      <Field value={reads} onChange={setReads} label={t("connections.readTools")} placeholder={t("connections.readTools")} />
      <Field value={drafts} onChange={setDrafts} label={t("connections.draftTools")} placeholder={t("connections.draftTools")} />
      <small className="faint">{t("connections.toolsHint")}</small>
      <Failure error={save.error} />
      </div>
    </Modal>
  );
}

function Detail({ connector }: { connector: Connector }) {
  const connect = useConnect();
  const manage = useManage();
  const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [token, setToken] = useState<Target | null>(null);
  const own = targetOf(connector.source, manage);
  const personal = connector.source === "personal";
  const toggle = useMutation({
    mutationFn: ({ layer, enabled }: { layer: Target; enabled: boolean }) =>
      must(api.PUT("/settings/{layer}/connectors/{name}/enabled", { params: { path: { layer, name: connector.name } }, body: { enabled } })),
    onSuccess: refresh,
    onError: (error) => toast(error.message, "bad"),
  });
  const remove = useMutation({
    mutationFn: (layer: Target) => must(api.DELETE("/settings/{layer}/connectors/{name}", { params: { path: { layer, name: connector.name } } })),
    onSuccess: () => {
      refresh();
      go("connections");
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const start = (scope: Target) => (connector.auth === "oauth" ? connect.mutate({ name: connector.name, scope }) : setToken(scope));
  const sub =
    connector.auth === "oauth" ? t("connections.oauth") : connector.auth === "bearer" ? t("connections.bearer", { name: connector.token_name ?? "" }) : connector.auth === "process" ? t("connections.process") : t("connections.open");
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
            <SourceBadge source={connector.source} />
          </div>
          <p>{sub}</p>
          {connector.url && <p className="faint mono lay-url">{connector.url}</p>}
        </div>
        <div className="acts">
          {canConnect(connector) && connector.enabled && (
            <Btn variant={connector.connected === "personal" ? "" : "primary"} disabled={connect.isPending} onClick={() => start("me")}>
              {connector.auth === "oauth" ? <ExternalLink /> : <KeyRound />}
              {connector.connected === "personal" ? t("connections.reconnectMine") : t("connections.connectMine")}
            </Btn>
          )}
          {canConnect(connector) && connector.enabled && !personal && manage && (
            <Btn disabled={connect.isPending} onClick={() => start("tenant")}>{t("connections.connectShared")}</Btn>
          )}
        </div>
      </header>
      <Failure error={connect.error} />
      {!personal && (
        <div className="card lay-switches">
          {manage && connector.source === "instance" && (
            <div className="cn-perm">
              <div className="grow"><b>{t("connections.useInWorkspace")}</b><small>{t("connections.useInWorkspaceHint")}</small></div>
              <Toggle
                label={t("connections.useInWorkspace")}
                on={connector.disabled_by !== "tenant"}
                onChange={() => toggle.mutate({ layer: "tenant", enabled: connector.disabled_by === "tenant" })}
              />
            </div>
          )}
          <div className="cn-perm">
            <div className="grow"><b>{t("connections.useForMe")}</b><small>{connector.disabled_by === "tenant" ? t("connections.offForWorkspace") : t("connections.useForMeHint")}</small></div>
            <Toggle
              label={t("connections.useForMe")}
              disabled={connector.disabled_by === "tenant"}
              on={connector.disabled_by !== "personal"}
              onChange={() => toggle.mutate({ layer: "me", enabled: connector.disabled_by === "personal" })}
            />
          </div>
        </div>
      )}
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
      {connector.source === "instance" && <p className="faint" style={{ fontSize: 12 }}>{t("connections.fromServer")}</p>}
      {connector.source === "tenant" && !manage && <p className="faint" style={{ fontSize: 12 }}>{t("roles.connectorsAdmin")}</p>}
      {own && (
        <div className="cn-danger">
          <div className="grow">
            <b>{personal ? t("connections.mineTitle") : t("connections.sharedTitle")}</b>
            <small>{personal ? t("connections.mineHint") : t("connections.sharedHint")}</small>
          </div>
          <Toggle label={t("connections.enabled")} on={connector.disabled_by !== connector.source} onChange={() => toggle.mutate({ layer: own, enabled: connector.disabled_by === connector.source })} />
          <Btn onClick={() => setEditing(true)}><PencilLine />{t("connections.edit")}</Btn>
          <Btn variant="danger" onClick={() => setDeleting(true)}><Trash2 />{t("common.delete")}</Btn>
        </div>
      )}
      {editing && <ConnectorModal existing={connector} onClose={() => setEditing(false)} />}
      {token && connector.token_name && (
        <SecretModal name={connector.token_name} title={t("connections.tokenTitle", { name: humanize(connector.name) })} defaultTarget={token} onClose={() => setToken(null)} />
      )}
      {deleting && own && (
        <Confirm
          title={t("connections.deleteConfirm", { name: humanize(connector.name) })}
          body={t("connections.deleteBody")}
          action={t("common.delete")}
          onConfirm={() => remove.mutate(own)}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}

export function Connections() {
  useLanguage();
  const route = useRoute();
  const view = useEffective();
  const manage = useManage();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const all = view.data?.connectors ?? [];
  const current = route.param ? all.find((connector) => connector.name === route.param) : undefined;
  if (current) {
    return <div className="page"><Detail connector={current} /></div>;
  }
  const needle = query.trim().toLowerCase();
  const shown = all.filter(
    (connector) =>
      (filter === "all" || (filter === "connected" ? isConnected(connector) : !isConnected(connector))) &&
      (!needle || `${connector.name} ${connector.read_tools.join(" ")} ${connector.draft_tools.join(" ")}`.toLowerCase().includes(needle)),
  );
  const connected = all.filter(isConnected).length;
  const groups: [string, Connector[]][] = [
    [t("connections.mine"), shown.filter((connector) => connector.source === "personal")],
    [t("connections.shared"), shown.filter((connector) => connector.source !== "personal")],
  ];
  return (
    <div className="page">
      <div className="cn">
        <PageHeader title={t("nav.connections")} sub={t("connections.lead", { count: connected, total: all.length })}>
          <Btn variant="primary" onClick={() => setAdding(true)}><Plus />{t("connections.add")}</Btn>
        </PageHeader>
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
        <Failure error={view.error} />
        {view.isPending && <Skeleton count={4} height={58} />}
        {!view.isPending && all.length === 0 && (
          <div className="card">
            <Empty
              icon={<Plug />}
              title={t("connections.emptyTitle")}
              sub={manage ? t("connections.emptyHint") : t("connections.emptyHintMine")}
              action={<Btn variant="primary" onClick={() => setAdding(true)}><Plus />{t("connections.add")}</Btn>}
            />
          </div>
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
                    {isConnected(connector) ? (
                      <span className="cn-add on" title={t("settings.connected")}><Check size={14} /></span>
                    ) : connector.enabled && canConnect(connector) ? (
                      <button
                        type="button"
                        className="cn-add"
                        aria-label={t("connections.connectNamed", { name: connector.name })}
                        onClick={(event) => {
                          event.stopPropagation();
                          go("connections", connector.name);
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </Fragment>
          ) : null,
        )}
      </div>
      {adding && <ConnectorModal onClose={() => setAdding(false)} />}
    </div>
  );
}
