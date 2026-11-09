import { useMutation } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, must, type Schemas } from "../api/client";
import { useAgents } from "../data";
import { setLanguage, t, type Language } from "../i18n";
import { toast } from "../shell/state";
import { Btn, Failure, Field, Seg, Skeleton, Toggle } from "../ui";
import { Select } from "../ui/select";
import { SourceBadge, TargetPicker, useManage, useRefresh, useValues, words, type Target } from "./layers";
import { Group, SettingRow } from "./settingsKit";

type Value = Schemas["ValueView"];
type Notifications = { deliver: string[]; decisions: boolean; done: boolean; alerts: string };
type Publishing = { connector: string; tool: string; service?: string | null; input?: unknown };
type BrainModels = { provider?: string | null; embedding_model?: string | null; vision_model?: string | null; transcription_model?: string | null };
type Place = { latitude: number; longitude: number; location?: string | null };

/** The layer an entry can be reset in: the one being edited, if the value comes from there. */
const resettable = (value: Value | undefined, target: Target) =>
  !!value && ((target === "me" && value.source === "personal") || (target === "tenant" && value.source === "tenant"));

/** Single settings with their source: for the whole workspace or for the caller. */
export function Preferences() {
  const manage = useManage();
  const values = useValues();
  const agents = useAgents();
  const refresh = useRefresh();
  const [target, setTarget] = useState<Target>("me");
  const layer = manage ? target : "me";
  const set = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      must(api.PUT("/settings/{layer}/values/{key}", { params: { path: { layer, key } }, body: value as never })),
    onSuccess: () => {
      toast(t("prefs.saved"));
      refresh();
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const reset = useMutation({
    mutationFn: (key: string) => must(api.DELETE("/settings/{layer}/values/{key}", { params: { path: { layer, key } } })),
    onSuccess: refresh,
    onError: (error) => toast(error.message, "bad"),
  });
  if (values.isPending) return <Skeleton count={4} height={52} />;
  if (!values.data) return <Failure error={values.error} />;
  const value = (key: string) => values.data.find((item) => item.key === key);
  const save = (key: string, next: unknown) => set.mutate({ key, value: next });
  const trail = (key: string): ReactNode => {
    const current = value(key);
    return (
      <>
        {current && <SourceBadge source={current.source} />}
        {resettable(current, layer) && (
          <Btn size="sm" icon variant="ghost" aria-label={t("prefs.reset")} onClick={() => reset.mutate(key)}><RotateCcw /></Btn>
        )}
      </>
    );
  };
  const push: Notifications = { deliver: [], decisions: true, done: false, alerts: "critical", ...(value("notifications")?.value as Partial<Notifications> | undefined) };
  const place = value("weather")?.value as Place | undefined;
  const agent = value("talk.agent")?.value as string | null | undefined;
  return (
    <>
      <TargetPicker value={layer} onChange={setTarget} />
      <Group title={t("prefs.general")}>
        <SettingRow title={t("prefs.language")} sub={t("prefs.languageHint")}>
          {trail("language")}
          <Seg<string> label={t("prefs.language")} value={(value("language")?.value as string) ?? ""} onChange={(next) => {
            save("language", next);
            if (layer === "me") setLanguage(next as Language);
          }} options={[["de", "Deutsch"], ["en", "English"]]} />
        </SettingRow>
        <TimeZone key={String(value("timezone")?.value)} current={(value("timezone")?.value as string) ?? ""} trail={trail("timezone")} onSave={(next) => save("timezone", next)} />
        <SettingRow title={t("prefs.talkAgent")} sub={t("prefs.talkAgentHint")}>
          {trail("talk.agent")}
          <Select
            size="sm"
            width={200}
            label={t("prefs.talkAgent")}
            value={agent ?? ""}
            onChange={(next) => save("talk.agent", next || null)}
            options={[["", t("prefs.brainAnswers")] as const, ...(agents.data ?? []).map((item) => [item.id, item.name] as const)]}
          />
        </SettingRow>
      </Group>
      <Group title={t("prefs.notifications")} hint={t("prefs.notificationsHint")}>
        <SettingRow title={t("prefs.decisions")}>
          {trail("notifications")}
          <Toggle label={t("prefs.decisions")} on={push.decisions} onChange={(decisions) => save("notifications", { ...push, decisions })} />
        </SettingRow>
        <SettingRow title={t("prefs.done")}>
          <Toggle label={t("prefs.done")} on={push.done} onChange={(done) => save("notifications", { ...push, done })} />
        </SettingRow>
        <SettingRow title={t("prefs.alerts")}>
          <Seg<string> label={t("prefs.alerts")} value={push.alerts} onChange={(alerts) => save("notifications", { ...push, alerts })} options={[["info", t("prefs.alertInfo")], ["warning", t("prefs.alertWarning")], ["critical", t("prefs.alertCritical")]]} />
        </SettingRow>
        <Targets key={push.deliver.join()} current={push.deliver} onSave={(deliver) => save("notifications", { ...push, deliver })} />
      </Group>
      {layer === "me" && (
        <Identity
          key={JSON.stringify([value("accounts")?.value, value("addresses")?.value])}
          accounts={(value("accounts")?.value as Record<string, string> | undefined) ?? {}}
          addresses={(value("addresses")?.value as string[] | undefined) ?? []}
          onAccounts={(next) => save("accounts", next)}
          onAddresses={(next) => save("addresses", next)}
        />
      )}
      <Advanced
        key={JSON.stringify([value("publishing")?.value, value("slack_channels")?.value, value("brain")?.value])}
        target={layer}
        publishing={value("publishing")?.value as Publishing | null | undefined}
        slack={(value("slack_channels")?.value as string[] | undefined) ?? []}
        brain={(value("brain")?.value as BrainModels | undefined) ?? {}}
        badges={{ publishing: trail("publishing"), slack: trail("slack_channels"), brain: trail("brain") }}
        onSave={save}
      />
      <Weather key={JSON.stringify(place)} place={place} trail={trail("weather")} onSave={(next) => save("weather", next)} />
      <Failure error={set.error ?? reset.error} />
    </>
  );
}

/** A person's names in services and further addresses, so their sources recognize what is theirs. */
function Identity({ accounts, addresses, onAccounts, onAddresses }: { accounts: Record<string, string>; addresses: string[]; onAccounts: (next: Record<string, string>) => void; onAddresses: (next: string[]) => void }) {
  const [names, setNames] = useState(Object.entries(accounts).map(([service, account]) => `${service}=${account}`).join(", "));
  const [mails, setMails] = useState(addresses.join(", "));
  const parsed = () => Object.fromEntries(words(names).map((pair) => pair.split("=", 2) as [string, string]).filter(([service, account]) => service && account));
  return (
    <Group title={t("prefs.identity")} hint={t("prefs.identityHint")}>
      <SettingRow title={t("prefs.accounts")} sub={t("prefs.accountsHint")}>
        <span className="st-inline">
          <span className="st-f"><Field value={names} onChange={setNames} label={t("prefs.accounts")} placeholder="linear=alex, github=alex-example" onEnter={() => onAccounts(parsed())} /></span>
          <Btn size="sm" onClick={() => onAccounts(parsed())}>{t("common.save")}</Btn>
        </span>
      </SettingRow>
      <SettingRow title={t("prefs.addresses")} sub={t("prefs.addressesHint")}>
        <span className="st-inline">
          <span className="st-f"><Field value={mails} onChange={setMails} label={t("prefs.addresses")} placeholder="alex@example.com" onEnter={() => onAddresses(words(mails))} /></span>
          <Btn size="sm" onClick={() => onAddresses(words(mails))}>{t("common.save")}</Btn>
        </span>
      </SettingRow>
    </Group>
  );
}

/** What publishes posts, Slack aliases and the Brain's models. */
function Advanced({ target, publishing, slack, brain, badges, onSave }: { target: Target; publishing?: Publishing | null; slack: string[]; brain: BrainModels; badges: Record<"publishing" | "slack" | "brain", ReactNode>; onSave: (key: string, value: unknown) => void }) {
  const [connector, setConnector] = useState(publishing?.connector ?? "");
  const [tool, setTool] = useState(publishing?.tool ?? "");
  const [service, setService] = useState(publishing?.service ?? "");
  const [aliases, setAliases] = useState(slack.join(", "));
  const [provider, setProvider] = useState(brain.provider ?? "");
  const [embedding, setEmbedding] = useState(brain.embedding_model ?? "");
  const [vision, setVision] = useState(brain.vision_model ?? "");
  const [transcription, setTranscription] = useState(brain.transcription_model ?? "");
  const optional = (text: string) => text.trim() || undefined;
  return (
    <>
      <Group title={t("prefs.publishing")} hint={t("prefs.publishingHint")}>
        <SettingRow title={t("prefs.publishingTool")}>{badges.publishing}</SettingRow>
        <div className="st-add">
          <Field value={connector} onChange={setConnector} label={t("prefs.connector")} placeholder={t("prefs.connector")} />
          <Field value={tool} onChange={setTool} label={t("prefs.tool")} placeholder={t("prefs.tool")} />
          <Field value={service} onChange={setService} label={t("prefs.service")} placeholder={t("prefs.service")} />
          <Btn disabled={!connector || !tool} onClick={() => onSave("publishing", { connector, tool, input: publishing?.input ?? undefined, service: optional(service) })}>{t("common.save")}</Btn>
        </div>
      </Group>
      <Group title={t("prefs.slack")} hint={t("prefs.slackHint")}>
        <SettingRow title={t("prefs.slackAliases")}>
          {badges.slack}
          <span className="st-inline">
            <span className="st-f"><Field value={aliases} onChange={setAliases} label={t("prefs.slackAliases")} placeholder="#team" onEnter={() => onSave("slack_channels", words(aliases))} /></span>
            <Btn size="sm" onClick={() => onSave("slack_channels", words(aliases))}>{t("common.save")}</Btn>
          </span>
        </SettingRow>
      </Group>
      <Group title={t("prefs.brain")} hint={target === "tenant" ? t("prefs.brainHintWorkspace") : t("prefs.brainHintMine")}>
        <SettingRow title={t("prefs.brainModels")}>{badges.brain}</SettingRow>
        <div className="st-add">
          <Field value={provider} onChange={setProvider} label={t("prefs.brainProvider")} placeholder={t("prefs.brainProvider")} />
          {target === "tenant" && <Field value={embedding} onChange={setEmbedding} label={t("prefs.embedding")} placeholder={t("prefs.embedding")} />}
          <Field value={vision} onChange={setVision} label={t("prefs.vision")} placeholder={t("prefs.vision")} />
          <Field value={transcription} onChange={setTranscription} label={t("prefs.transcription")} placeholder={t("prefs.transcription")} />
          <Btn onClick={() => onSave("brain", { provider: optional(provider), embedding_model: target === "tenant" ? optional(embedding) : undefined, vision_model: optional(vision), transcription_model: optional(transcription) })}>{t("common.save")}</Btn>
        </div>
      </Group>
    </>
  );
}

function TimeZone({ current, trail, onSave }: { current: string; trail: ReactNode; onSave: (zone: string) => void }) {
  const [zone, setZone] = useState(current);
  return (
    <SettingRow title={t("prefs.timezone")} sub={t("prefs.timezoneHint")}>
      {trail}
      <span className="st-inline">
        <span className="st-f sm"><Field value={zone} onChange={setZone} label={t("prefs.timezone")} onEnter={() => zone && onSave(zone)} /></span>
        {zone !== current && <Btn size="sm" variant="primary" disabled={!zone} onClick={() => onSave(zone)}>{t("common.save")}</Btn>}
      </span>
    </SettingRow>
  );
}

function Targets({ current, onSave }: { current: string[]; onSave: (targets: string[]) => void }) {
  const [text, setText] = useState(current.join(", "));
  const changed = words(text).join() !== current.join();
  return (
    <SettingRow title={t("prefs.targets")} sub={t("prefs.targetsHint")}>
      <span className="st-inline">
        <span className="st-f"><Field value={text} onChange={setText} label={t("prefs.targets")} placeholder="owner, slack:#team" onEnter={() => onSave(words(text))} /></span>
        {changed && <Btn size="sm" variant="primary" onClick={() => onSave(words(text))}>{t("common.save")}</Btn>}
      </span>
    </SettingRow>
  );
}

function Weather({ place, trail, onSave }: { place?: Place; trail: ReactNode; onSave: (place: Place) => void }) {
  const [location, setLocation] = useState(place?.location ?? "");
  const [latitude, setLatitude] = useState(place ? String(place.latitude) : "");
  const [longitude, setLongitude] = useState(place ? String(place.longitude) : "");
  const number = (text: string) => Number(text.replace(",", "."));
  const valid = latitude !== "" && longitude !== "" && !Number.isNaN(number(latitude)) && !Number.isNaN(number(longitude));
  const commit = () => onSave({ latitude: number(latitude), longitude: number(longitude), location: location.trim() || null });
  return (
    <Group title={t("prefs.weather")} hint={t("prefs.weatherHint")}>
      <SettingRow title={t("prefs.place")}>{trail}</SettingRow>
      <div className="st-add">
        <Field value={location} onChange={setLocation} label={t("prefs.location")} placeholder={t("prefs.location")} />
        <Field value={latitude} onChange={setLatitude} label={t("prefs.latitude")} placeholder={t("prefs.latitude")} />
        <Field value={longitude} onChange={setLongitude} label={t("prefs.longitude")} placeholder={t("prefs.longitude")} />
        <Btn variant="primary" disabled={!valid} onClick={commit}>{t("common.save")}</Btn>
      </div>
    </Group>
  );
}
