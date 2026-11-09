import { useMutation } from "@tanstack/react-query";
import { KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { t, tOr } from "../i18n";
import { toast } from "../shell/state";
import { Badge, Btn, Failure, Field, Modal, Seg, Skeleton } from "../ui";
import { Select } from "../ui/select";
import { SecretModal, SourceBadge, TargetPicker, targetOf, useEffective, useManage, usePresets, useRefresh, type Target, type View } from "./layers";
import { Group, ReadOnly, SettingRow } from "./settingsKit";

type Provider = View["providers"][number];
type Route = View["routing"][number];
type Preset = Schemas["PresetProvider"];

const euro = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const price = (input: number, output: number) => t("models.price", { input: euro(input), output: euro(output) });
const taskName = (task: string) => tOr(`settings.task.${task}`, task);
const keyText = (provider: Provider) =>
  !provider.needs_key ? t("models.noKeyNeeded") : provider.key ? tOr(`models.key.${provider.key}`, provider.key) : t("models.keyMissing");

/** One change, with a toast on failure and a reload after success. */
function useChange<T>(run: (value: T) => Promise<unknown>) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: run, onSuccess: refresh, onError: (error) => toast(error.message, "bad") });
}

function RouteModal({ view, route, task, onClose }: { view: View; route?: Route; task: string; onClose: () => void }) {
  const manage = useManage();
  const refresh = useRefresh();
  const candidates = view.providers.filter((provider) => provider.models.some((model) => model.task === task));
  const [target, setTarget] = useState<Target>(manage ? "tenant" : "me");
  const [primary, setPrimary] = useState(route?.provider ?? candidates[0]?.name ?? "");
  const [fallback, setFallback] = useState(route?.fallback ?? "");
  const save = useMutation({
    mutationFn: () =>
      must(api.PUT("/settings/{layer}/routing/{task}", { params: { path: { layer: target, task } }, body: { provider: primary, fallback: fallback || null } })),
    onSuccess: () => {
      toast(t("models.routeSaved"));
      refresh();
      onClose();
    },
  });
  const label = (provider: Provider) => `${provider.name} · ${provider.models.find((model) => model.task === task)?.model ?? ""}`;
  return (
    <Modal
      title={t("models.routeTitle", { task: taskName(task) })}
      sub={t("models.routeHint")}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="primary" disabled={!primary || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Btn>
        </>
      }
    >
      <div className="lay-form">
      <TargetPicker value={target} onChange={setTarget} />
      {candidates.length === 0 && <p className="faint lay-note">{t("models.noCandidates")}</p>}
      {candidates.length > 0 && (
        <>
          <label className="lay-label">{t("models.primary")}</label>
          <Select label={t("models.primary")} value={primary} onChange={setPrimary} options={candidates.map((provider) => [provider.name, label(provider)] as const)} />
          <label className="lay-label">{t("models.fallback")}</label>
          <Select
            label={t("models.fallback")}
            value={fallback}
            onChange={setFallback}
            options={[["", t("models.noFallback")] as const, ...candidates.filter((provider) => provider.name !== primary).map((provider) => [provider.name, label(provider)] as const)]}
          />
        </>
      )}
      <Failure error={save.error} />
      </div>
    </Modal>
  );
}

function ModelModal({ view, provider, onClose }: { view: View; provider: Provider; onClose: () => void }) {
  const manage = useManage();
  const refresh = useRefresh();
  const presets = usePresets();
  const suggestions = presets.data?.providers.find((preset) => preset.kind === provider.kind)?.models ?? [];
  const [target, setTarget] = useState<Target>(manage ? "tenant" : "me");
  const [task, setTask] = useState(view.tasks[0] ?? "text");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const parse = (text: string) => Number(text.replace(",", "."));
  const valid = !!model.trim() && input !== "" && output !== "" && parse(input) >= 0 && parse(output) >= 0;
  const save = useMutation({
    mutationFn: () =>
      must(
        api.PUT("/settings/{layer}/providers/{name}/models/{task}", {
          params: { path: { layer: target, name: provider.name, task } },
          body: { model: model.trim(), input_eur_per_mtok: parse(input), output_eur_per_mtok: parse(output) },
        }),
      ),
    onSuccess: () => {
      toast(t("models.modelSaved"));
      refresh();
      onClose();
    },
  });
  return (
    <Modal
      title={t("models.modelTitle", { provider: provider.name })}
      sub={t("models.modelHint")}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Btn>
        </>
      }
    >
      <div className="lay-form">
      <TargetPicker value={target} onChange={setTarget} />
      {view.tasks.length > 1 && <Seg<string> label={t("models.task")} value={task} onChange={setTask} options={view.tasks.map((item) => [item, taskName(item)])} />}
      {suggestions.length > 0 && (
        <div className="lay-chips">
          {suggestions.map((suggestion) => (
            <Btn
              key={suggestion.model}
              size="xs"
              variant={model === suggestion.model ? "primary" : ""}
              onClick={() => {
                setModel(suggestion.model);
                setInput(String(suggestion.input_eur_per_mtok));
                setOutput(String(suggestion.output_eur_per_mtok));
              }}
            >
              {suggestion.label}
            </Btn>
          ))}
        </div>
      )}
      <Field value={model} onChange={setModel} label={t("models.modelName")} placeholder={t("models.modelName")} />
      <div className="lay-two">
        <Field value={input} onChange={setInput} label={t("models.inputPrice")} placeholder={t("models.inputPrice")} />
        <Field value={output} onChange={setOutput} label={t("models.outputPrice")} placeholder={t("models.outputPrice")} />
      </div>
      <small className="faint">{t("models.priceHint")}</small>
      <Failure error={save.error} />
      </div>
    </Modal>
  );
}

/** Adds a provider from a preset or by hand, with its first model and its key. */
function ProviderModal({ view, onClose }: { view: View; onClose: () => void }) {
  const manage = useManage();
  const refresh = useRefresh();
  const presets = usePresets();
  const list: Preset[] = presets.data?.providers ?? [];
  const [target, setTarget] = useState<Target>(manage ? "tenant" : "me");
  const [preset, setPreset] = useState<string>("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"anthropic" | "openai">("anthropic");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const chosen = list.find((item) => item.id === preset);
  const pick = (id: string) => {
    const item = list.find((entry) => entry.id === id);
    setPreset(id);
    if (!item) return;
    const taken = view.providers.some((provider) => provider.name === item.id);
    setName(taken ? `${item.id}-2` : item.id);
    setKind(item.kind === "openai" ? "openai" : "anthropic");
    setBaseUrl(item.base_url ?? "");
    setModel(item.models?.[0]?.model ?? "");
  };
  const add = useMutation({
    mutationFn: async () => {
      const layer = target;
      await must(api.PUT("/settings/{layer}/providers/{name}", { params: { path: { layer, name } }, body: { kind, base_url: baseUrl.trim() || null } }));
      const suggestion = chosen?.models?.find((item) => item.model === model);
      if (suggestion) {
        await must(
          api.PUT("/settings/{layer}/providers/{name}/models/{task}", {
            params: { path: { layer, name, task: suggestion.task } },
            body: { model: suggestion.model, input_eur_per_mtok: suggestion.input_eur_per_mtok, output_eur_per_mtok: suggestion.output_eur_per_mtok },
          }),
        );
      }
      if (key) {
        const credential = `provider:${name}`;
        await must(
          layer === "tenant"
            ? api.PUT("/credentials/{name}", { params: { path: { name: credential } }, body: { value: key } })
            : api.PUT("/me/credentials/{name}", { params: { path: { name: credential } }, body: { value: key } }),
        );
      }
    },
    onSuccess: () => {
      toast(t("models.providerAdded", { name }));
      refresh();
      onClose();
    },
    onError: () => refresh(),
  });
  const valid = /^[a-z][a-z0-9_-]{0,39}$/.test(name);
  return (
    <Modal
      wide
      title={t("models.addProvider")}
      sub={t("models.addProviderHint")}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="primary" disabled={!valid || add.isPending} onClick={() => add.mutate()}>{t("models.add")}</Btn>
        </>
      }
    >
      <div className="lay-form">
      <TargetPicker value={target} onChange={setTarget} />
      <div className="lay-chips">
        {list.map((item) => (
          <Btn key={item.id} size="sm" variant={preset === item.id ? "primary" : ""} onClick={() => pick(item.id)}>{item.label}</Btn>
        ))}
        <Btn size="sm" variant={preset === "custom" ? "primary" : ""} onClick={() => { setPreset("custom"); setModel(""); }}>{t("models.custom")}</Btn>
      </div>
      <Field value={name} onChange={setName} label={t("models.providerName")} placeholder={t("models.providerName")} />
      {name && !valid && <small className="faint">{t("models.nameRule")}</small>}
      <Seg<"anthropic" | "openai"> label={t("models.kind")} value={kind} onChange={setKind} options={[["anthropic", "Anthropic"], ["openai", t("models.openaiCompatible")]]} />
      <Field value={baseUrl} onChange={setBaseUrl} label={t("models.baseUrl")} placeholder={t("models.baseUrlHint")} />
      {chosen?.models && chosen.models.length > 0 && (
        <>
          <label className="lay-label">{t("models.firstModel")}</label>
          <Select
            label={t("models.firstModel")}
            value={model}
            onChange={setModel}
            options={[["", t("models.noModelYet")] as const, ...chosen.models.map((item) => [item.model, `${item.label} · ${price(item.input_eur_per_mtok, item.output_eur_per_mtok)}`] as const)]}
          />
        </>
      )}
      <Field type="password" value={key} onChange={setKey} label={t("models.apiKey")} placeholder={t("models.apiKey")} />
      {chosen?.key_url && <small className="faint">{t("models.keyWhere", { url: chosen.key_url })}</small>}
      <Failure error={add.error} />
      </div>
    </Modal>
  );
}

function Routing({ view }: { view: View }) {
  const manage = useManage();
  const [editing, setEditing] = useState<string | null>(null);
  const reset = useChange((route: { layer: Target; task: string }) => must(api.DELETE("/settings/{layer}/routing/{task}", { params: { path: route } })));
  const tasks = [...new Set([...view.tasks, ...view.routing.map((route) => route.task)])];
  return (
    <Group title={t("settings.modelsTitle")} hint={t("models.routingHint")}>
      {tasks.map((task) => {
        const route = view.routing.find((item) => item.task === task);
        const target = route ? targetOf(route.source, manage) : null;
        return (
          <SettingRow
            key={task}
            title={<>{taskName(task)}{route && <SourceBadge source={route.source} />}</>}
            sub={route?.problem ? <span className="lay-bad">{route.problem}</span> : route?.fallback ? t("settings.fallback", { fallback: [route.fallback, route.fallback_model].filter(Boolean).join(" · ") }) : !route ? t("models.noRoute") : undefined}
          >
            {route && <span className="st-model"><b>{route.model ?? "–"}</b><small>{route.provider}</small></span>}
            <Btn size="sm" onClick={() => setEditing(task)}>{t("models.change")}</Btn>
            {route && target && (
              <Btn size="sm" icon variant="ghost" aria-label={t("models.resetRoute", { task: taskName(task) })} onClick={() => reset.mutate({ layer: target, task })}>
                <RotateCcw />
              </Btn>
            )}
          </SettingRow>
        );
      })}
      {editing && <RouteModal view={view} task={editing} route={view.routing.find((item) => item.task === editing)} onClose={() => setEditing(null)} />}
    </Group>
  );
}

function Providers({ view }: { view: View }) {
  const manage = useManage();
  const [adding, setAdding] = useState(false);
  const [modelFor, setModelFor] = useState<Provider | null>(null);
  const [keyFor, setKeyFor] = useState<Provider | null>(null);
  const removeModel = useChange((model: { layer: Target; name: string; task: string }) =>
    must(api.DELETE("/settings/{layer}/providers/{name}/models/{task}", { params: { path: model } })),
  );
  const removeProvider = useChange((provider: { layer: Target; name: string }) =>
    must(api.DELETE("/settings/{layer}/providers/{name}", { params: { path: provider } })),
  );
  return (
    <>
      {view.providers.map((provider) => {
        const own = provider.defined_at !== "instance" ? targetOf(provider.defined_at, manage) : null;
        return (
          <Group
            key={provider.name}
            title={<span className="lay-title">{provider.name}<SourceBadge source={provider.defined_at} /></span>}
            hint={[provider.kind === "openai" ? t("models.openaiCompatible") : "Anthropic", provider.base_url].filter(Boolean).join(" · ")}
          >
            <SettingRow icon={<span className="st-ic"><KeyRound size={15} /></span>} title={keyText(provider)} sub={provider.needs_key ? <span className="mono">{provider.key_name}</span> : undefined}>
              {provider.needs_key && <Btn size="sm" onClick={() => setKeyFor(provider)}>{provider.key ? t("models.replaceKey") : t("models.addKey")}</Btn>}
            </SettingRow>
            {provider.models.map((model) => {
              const target = targetOf(model.source, manage);
              return (
                <SettingRow key={model.task} title={<>{model.model}<SourceBadge source={model.source} /></>} sub={`${taskName(model.task)} · ${price(model.input_eur_per_mtok, model.output_eur_per_mtok)}`}>
                  {target && (
                    <Btn size="sm" icon variant="ghost" aria-label={t("models.removeModel", { model: model.model })} onClick={() => removeModel.mutate({ layer: target, name: provider.name, task: model.task })}>
                      {provider.defined_at !== model.source ? <RotateCcw /> : <Trash2 />}
                    </Btn>
                  )}
                </SettingRow>
              );
            })}
            {provider.models.length === 0 && <p className="st-emp">{t("models.noModelsYet")}</p>}
            <div className="st-add">
              <Btn size="sm" onClick={() => setModelFor(provider)}><Plus />{t("models.addModel")}</Btn>
              {provider.defined_at === "instance" && <small className="faint">{t("models.fromServer")}</small>}
              <span className="grow" />
              {own && (
                <Btn size="sm" variant="danger" onClick={() => removeProvider.mutate({ layer: own, name: provider.name })}>
                  <Trash2 />{t("models.removeProvider")}
                </Btn>
              )}
            </div>
          </Group>
        );
      })}
      <div className="lay-cta">
        <Btn variant="primary" onClick={() => setAdding(true)}><Plus />{t("models.addProvider")}</Btn>
        <small className="faint">{manage ? t("models.addProviderLead") : t("models.addProviderMine")}</small>
      </div>
      {adding && <ProviderModal view={view} onClose={() => setAdding(false)} />}
      {modelFor && <ModelModal view={view} provider={modelFor} onClose={() => setModelFor(null)} />}
      {keyFor && (
        <SecretModal name={keyFor.key_name} title={t("models.keyTitle", { provider: keyFor.name })} defaultTarget={keyFor.defined_at === "personal" ? "me" : "tenant"} onClose={() => setKeyFor(null)} />
      )}
    </>
  );
}

/** Which provider and model serve each task, and the providers with their models, keys and prices. */
export function ModelSettings() {
  const view = useEffective();
  const manage = useManage();
  if (view.isPending) return <Skeleton count={3} height={52} />;
  if (!view.data) return <Failure error={view.error} />;
  return (
    <>
      <Routing view={view.data} />
      {!manage && <ReadOnly>{t("models.memberNote")}</ReadOnly>}
      <div className="sh">{t("models.providers")}<small>{view.data.providers.length}</small></div>
      {view.data.providers.length === 0 && <p className="st-emp">{t("settings.noModels")}</p>}
      <Providers view={view.data} />
      <p className="faint lay-legend">
        <Badge>{t("layers.instance")}</Badge> {t("layers.instanceHint")} <Badge tone="info">{t("layers.tenant")}</Badge> {t("layers.tenantHint")} <Badge tone="vio">{t("layers.personal")}</Badge> {t("layers.personalHint")}
      </p>
    </>
  );
}
