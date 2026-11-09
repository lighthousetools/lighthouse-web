import { useMutation } from "@tanstack/react-query";
import { PencilLine, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { dayTime } from "../format";
import { t } from "../i18n";
import { toast } from "../shell/state";
import { Btn, Confirm, Failure, Field, Modal, Skeleton, Toggle } from "../ui";
import { Select } from "../ui/select";
import { useSources } from "./connected";
import { SourceBadge, TargetPicker, targetOf, useEffective, useManage, usePresets, useRefresh, type Target, type View } from "./layers";
import { Group, SettingRow } from "./settingsKit";

type Source = View["sources"][number];
type Status = Schemas["SourceInfo"];

const NAME = /^[a-z][a-z0-9_-]{0,39}$/;

/** Adds or changes a source. Its collections are JSON, in the shape of `docs/connected.md`. */
function SourceModal({ view, existing, onClose }: { view: View; existing?: Source; onClose: () => void }) {
  const manage = useManage();
  const refresh = useRefresh();
  const presets = usePresets();
  const fixed = existing ? targetOf(existing.source, manage) : null;
  const [target, setTarget] = useState<Target>(fixed ?? "me");
  const [name, setName] = useState(existing?.name ?? "");
  const [connector, setConnector] = useState(existing?.connector ?? "");
  const [definition, setDefinition] = useState(existing?.definition ? JSON.stringify(existing.definition, null, 2) : "");
  const connectors = view.connectors.filter((item) => item.enabled && (target === "me" || item.source !== "personal"));
  const parsed = (() => {
    try {
      const value = JSON.parse(definition || "{}") as Record<string, unknown>;
      return typeof value === "object" && value ? value : null;
    } catch {
      return null;
    }
  })();
  const save = useMutation({
    mutationFn: () =>
      must(
        api.PUT("/settings/{layer}/sources/{name}", {
          params: { path: { layer: target, name } },
          body: { definition: { ...parsed, connector }, enabled: existing?.enabled ?? true },
        }),
      ),
    onSuccess: () => {
      toast(t("sources.saved"));
      refresh();
      onClose();
    },
  });
  const ready = NAME.test(name) && !!connector && !!parsed;
  return (
    <Modal
      wide
      title={existing ? t("sources.editTitle", { name: existing.name }) : t("sources.addTitle")}
      sub={t("sources.addHint")}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="primary" disabled={!ready || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Btn>
        </>
      }
    >
      <div className="lay-form">
        {!existing && <TargetPicker value={target} onChange={setTarget} />}
        {!existing && (
          <div className="lay-chips">
            {(presets.data?.sources ?? []).map((preset) => (
              <Btn
                key={preset.id}
                size="sm"
                variant={name === preset.id ? "primary" : ""}
                onClick={() => {
                  setName(preset.id);
                  setDefinition(JSON.stringify(preset.definition, null, 2));
                }}
              >
                {preset.label}
              </Btn>
            ))}
          </div>
        )}
        <Field value={name} onChange={setName} disabled={!!existing} label={t("sources.name")} placeholder={t("sources.name")} />
        <label className="lay-label">{t("sources.connector")}</label>
        <Select label={t("sources.connector")} value={connector} onChange={setConnector} options={[["", t("sources.chooseConnector")] as const, ...connectors.map((item) => [item.name, item.name] as const)]} />
        <label className="lay-label">{t("sources.definition")}</label>
        <textarea className="ta mono lay-ta" aria-label={t("sources.definition")} spellCheck={false} rows={12} value={definition} onChange={(event) => setDefinition(event.target.value)} />
        {!parsed && <small className="lay-bad">{t("sources.badJson")}</small>}
        <small className="faint">{t("sources.readOnlyHint")}</small>
        <Failure error={save.error} />
      </div>
    </Modal>
  );
}

function SourceRow({ view, source, status }: { view: View; source: Source; status?: Status }) {
  const manage = useManage();
  const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const own = targetOf(source.source, manage);
  const layer: Target | null = own ?? (source.source === "instance" && manage ? "tenant" : null);
  const fail = (error: Error) => toast(error.message, "bad");
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => must(api.PUT("/settings/{layer}/sources/{name}/enabled", { params: { path: { layer: layer!, name: source.name } }, body: { enabled } })),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => must(api.DELETE("/settings/{layer}/sources/{name}", { params: { path: { layer: own!, name: source.name } } })),
    onSuccess: refresh,
    onError: fail,
  });
  const sync = useMutation({
    mutationFn: () => must(api.POST("/connected/sources/{name}/refresh", { params: { path: { name: source.key } } })),
    onSuccess: (result) => {
      if (result.errors.length) toast(result.errors[0]!, "bad");
      else toast(t("sources.refreshed", { count: result.items }));
      refresh();
    },
    onError: fail,
  });
  const last = status?.status?.last_success_at;
  const problem = status?.problem ?? status?.status?.last_error;
  const details = [source.connector, source.domain ?? source.preset, last ? t("sources.lastRefresh", { time: dayTime(last) }) : t("sources.never")].filter(Boolean).join(" · ");
  return (
    <SettingRow title={<>{source.name}<SourceBadge source={source.source} /></>} sub={problem ? <span className="lay-bad">{problem}</span> : details}>
      {source.enabled && <Btn size="sm" icon variant="ghost" aria-label={t("sources.refresh", { name: source.name })} disabled={sync.isPending} onClick={() => sync.mutate()}><RefreshCw /></Btn>}
      {own && <Btn size="sm" icon variant="ghost" aria-label={t("sources.edit", { name: source.name })} onClick={() => setEditing(true)}><PencilLine /></Btn>}
      {own && <Btn size="sm" icon variant="ghost" aria-label={t("sources.remove", { name: source.name })} onClick={() => setDeleting(true)}><Trash2 /></Btn>}
      {layer && <Toggle label={t("sources.enabled", { name: source.name })} on={source.enabled} onChange={(enabled) => toggle.mutate(enabled)} />}
      {editing && <SourceModal view={view} existing={source} onClose={() => setEditing(false)} />}
      {deleting && <Confirm title={t("sources.deleteConfirm", { name: source.name })} body={t("sources.deleteBody")} action={t("common.delete")} onConfirm={() => remove.mutate()} onClose={() => setDeleting(false)} />}
    </SettingRow>
  );
}

/** Connected sources: the person's own, whose items reach only them, and the workspace's. */
export function SourceSettings() {
  const view = useEffective();
  const statuses = useSources();
  const [adding, setAdding] = useState(false);
  if (view.isPending) return <Skeleton count={3} height={52} />;
  if (!view.data) return <Failure error={view.error} />;
  const all = view.data.sources;
  const mine = all.filter((source) => source.source === "personal");
  const shared = all.filter((source) => source.source !== "personal");
  const status = (key: string) => statuses.data?.find((item) => item.name === key);
  return (
    <>
      <Group title={t("sources.mine")} hint={t("sources.mineHint")}>
        {mine.map((source) => <SourceRow key={source.key} view={view.data} source={source} status={status(source.key)} />)}
        {mine.length === 0 && <p className="st-emp">{t("sources.noneMine")}</p>}
      </Group>
      <Group title={t("sources.shared")} hint={t("sources.sharedHint")}>
        {shared.map((source) => <SourceRow key={source.key} view={view.data} source={source} status={status(source.key)} />)}
        {shared.length === 0 && <p className="st-emp">{t("sources.noneShared")}</p>}
      </Group>
      <div className="lay-cta"><Btn variant="primary" onClick={() => setAdding(true)}><Plus />{t("sources.add")}</Btn></div>
      {adding && <SourceModal view={view.data} onClose={() => setAdding(false)} />}
    </>
  );
}
