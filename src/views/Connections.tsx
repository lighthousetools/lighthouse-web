import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, KeyRound, PencilLine, Plug, Plus, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import { api, must } from "../api/client";
import { humanize } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { openExternal } from "../shell/bridge";
import { toast } from "../shell/state";
import { Badge, Btn, Confirm, Empty, Failure, Field, Modal, PageHeader, SearchField, Seg, ServiceIcon, Skeleton, Toggle } from "../ui";
import { SecretModal, SourceBadge, TargetPicker, targetOf, useEffective, useManage, usePresets, useRefresh, words, type Target, type View } from "./layers";
import { ConnectorCatalog } from "./ConnectorCatalog";
import { ConnectorTools } from "./ConnectorTools";
import "./connections.css";

type Connector = View["connectors"][number];
type Filter = "all" | "connected" | "open";
type Auth = "none" | "bearer" | "oauth";
type Kind = "mcp" | "rest";
type Key = "none" | "bearer" | "header" | "query";

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
  const [kind, setKind] = useState<Kind>(existing?.transport === "openapi" ? "rest" : "mcp");
  const [key, setKey] = useState<Key>((existing?.api?.key as Key | undefined) ?? "bearer");
  const [keyName, setKeyName] = useState(existing?.api?.key_name ?? "");
  const [baseUrl, setBaseUrl] = useState(existing?.api?.base_url ?? "");
  const [operations, setOperations] = useState(existing?.api?.operations?.join(", ") ?? "");
  const rest = kind === "rest";
  const save = useMutation({
    mutationFn: () =>
      must(
        api.PUT("/settings/{layer}/connectors/{name}", {
          params: { path: { layer: target, name } },
          body: {
            url: url.trim(),
            auth: rest ? (key === "none" ? "none" : "bearer") : auth,
            client_id: rest ? null : clientId.trim() || null,
            scopes: rest ? [] : words(scopes),
            read_tools: words(reads),
            draft_tools: words(drafts),
            enabled: existing?.enabled ?? true,
            api: rest
              ? {
                  key,
                  key_name: key === "header" || key === "query" ? keyName.trim() : null,
                  base_url: baseUrl.trim() || null,
                  operations: words(operations),
                }
              : null,
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
  const needsKeyName = rest && (key === "header" || key === "query");
  const valid =
    /^[a-z][a-z0-9_-]{0,39}$/.test(name) &&
    /^https?:\/\//.test(url.trim()) &&
    !url.includes("{") &&
    (!needsKeyName || /^[A-Za-z0-9_.-]+$/.test(keyName.trim())) &&
    (!rest || !baseUrl.trim() || /^https?:\/\//.test(baseUrl.trim()));
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
            setKind(preset.api ? "rest" : "mcp");
            setKey((preset.api?.key as Key | undefined) ?? "bearer");
            setKeyName(preset.api?.key_name ?? "");
            setBaseUrl(preset.api?.base_url ?? "");
            setOperations((preset.api?.operations ?? []).join(", "));
            setReads((preset.read_tools ?? []).join(", "));
            setDrafts((preset.draft_tools ?? []).join(", "));
          }}
        />
      )}
      <Field value={name} onChange={setName} disabled={!!existing} label={t("connections.name")} placeholder={t("connections.name")} />
      {name && !/^[a-z][a-z0-9_-]{0,39}$/.test(name) && <small className="faint">{t("models.nameRule")}</small>}
      <Seg<Kind> label={t("connections.kind")} value={kind} onChange={setKind} options={[["mcp", t("connections.kindMcp")], ["rest", t("connections.kindRest")]]} />
      <Field value={url} onChange={setUrl} label={rest ? t("connections.specUrl") : t("connections.url")} placeholder="https://" />
      {rest ? (
        <>
          <small className="faint">{t("connections.restHint")}</small>
          <Seg<Key>
            label={t("connections.key")}
            value={key}
            onChange={setKey}
            options={[["bearer", t("connections.keyBearer")], ["header", t("connections.keyHeader")], ["query", t("connections.keyQuery")], ["none", t("connections.keyNone")]]}
          />
          <div className="lay-two">
            {needsKeyName && <Field value={keyName} onChange={setKeyName} label={t("connections.keyName")} placeholder="x-api-key" />}
            <Field value={baseUrl} onChange={setBaseUrl} label={t("connections.baseUrl")} placeholder={t("connections.baseUrlHint")} />
          </div>
          <Field value={operations} onChange={setOperations} label={t("connections.operations")} placeholder={t("connections.operationsHint")} />
        </>
      ) : (
        <Seg<Auth> label={t("connections.auth")} value={auth} onChange={setAuth} options={[["oauth", t("connections.authOauth")], ["bearer", t("connections.authBearer")], ["none", t("connections.authNone")]]} />
      )}
      {!rest && auth === "oauth" && (
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
  const [clientSecret, setClientSecret] = useState(false);
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
    connector.transport === "openapi"
      ? connector.auth === "bearer"
        ? t("connections.rest", { name: connector.token_name ?? "" })
        : t("connections.restOpen")
      : connector.auth === "oauth"
        ? t("connections.oauth")
        : connector.auth === "bearer"
          ? t("connections.bearer", { name: connector.token_name ?? "" })
          : connector.auth === "process"
            ? t("connections.process")
            : t("connections.open");
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
          {connector.auth === "oauth" && connector.client_id && connector.enabled && (
            <Btn onClick={() => setClientSecret(true)}><KeyRound />{t("connections.clientSecret")}</Btn>
          )}
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
      <ConnectorTools connector={connector} editable={own != null} layer={own} />
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
      {clientSecret && (
        <SecretModal
          name={`oauth-client:${connector.name}`}
          title={t("connections.clientSecretTitle", { name: humanize(connector.name) })}
          defaultTarget="me"
          onClose={() => setClientSecret(false)}
        />
      )}
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
