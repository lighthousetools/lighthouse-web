import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Globe, KeyRound, Laptop, LogOut, Monitor, Smartphone, Terminal, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, must, storeToken } from "../api/client";
import { useMe } from "../data";
import { dayTime } from "../format";
import { t, tOr, useLanguage, type Key } from "../i18n";
import { go, useRoute } from "../router";
import { lookChoice, setLook, type LookChoice } from "../shell/look";
import { toast } from "../shell/state";
import { Avatar, Btn, Confirm, Failure, Field, Seg, Skeleton } from "../ui";
import { LanguagePicker } from "./LanguagePicker";
import "./settings.css";

const SECTIONS: { id: string; label: Key; lead: Key; icon: LucideIcon }[] = [
  { id: "general", label: "settings.general", lead: "settings.generalLead", icon: Globe },
  { id: "devices", label: "settings.devices", lead: "settings.devicesLead", icon: Laptop },
  { id: "credentials", label: "settings.credentials", lead: "settings.credentialsLead", icon: KeyRound },
  { id: "account", label: "settings.account", lead: "settings.accountLead", icon: UserRound },
];

const DEVICE_ICONS: Record<string, LucideIcon> = { web: Globe, mac: Laptop, ios: Smartphone, node: Monitor, api: Terminal };

function Group({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="st-g">
      <div className="st-gh">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      <div className="card">{children}</div>
    </section>
  );
}

function SettingRow({ title, sub, children, icon }: { title: ReactNode; sub?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="st-row">
      {icon}
      <div className="grow">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </div>
      {children}
    </div>
  );
}

function General() {
  const choice = lookChoice.use();
  return (
    <>
      <Group title={t("settings.language")}>
        <SettingRow title={t("lang.label")} sub={t("settings.languageHint")}>
          <LanguagePicker />
        </SettingRow>
      </Group>
      <Group title={t("settings.appearance")}>
        <SettingRow title={t("settings.look")} sub={t("settings.lookHint")}>
          <Seg<LookChoice>
            label={t("settings.look")}
            value={choice}
            onChange={setLook}
            options={[["system", t("look.system")], ["glass", t("look.glass")], ["light", t("look.light")]]}
          />
        </SettingRow>
        <SettingRow title={t("settings.light")} sub={t("settings.lightHint")} />
      </Group>
    </>
  );
}

function Devices() {
  const client = useQueryClient();
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => must(api.GET("/auth/devices")) });
  const refresh = () => client.invalidateQueries({ queryKey: ["devices"] });
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => must(api.DELETE("/auth/devices/{id}", { params: { path: { id } } })),
    onSuccess: () => {
      toast(t("settings.revoked"));
      void refresh();
    },
  });
  const [name, setName] = useState("");
  const pair = useMutation({
    mutationFn: () => must(api.POST("/auth/tokens", { body: { name, kind: "node" } })),
    onSuccess: () => {
      setName("");
      void refresh();
    },
  });
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(t("settings.copied"));
    } catch {
      toast(t("settings.copyFailed"), "bad");
    }
  };
  return (
    <>
      <Group title={t("settings.devices")} hint={devices.data ? String(devices.data.length) : undefined}>
        {devices.isPending && <div className="st-pad"><Skeleton count={2} height={44} /></div>}
        {devices.data?.length === 0 && <p className="st-emp">{t("settings.devicesEmpty")}</p>}
        {devices.data?.map((device) => {
          const Icon = DEVICE_ICONS[device.kind] ?? Monitor;
          return (
            <SettingRow
              key={device.id}
              icon={<span className="st-ic"><Icon size={15} /></span>}
              title={device.name}
              sub={`${tOr(`device.${device.kind}`, device.kind)} · ${t("settings.lastSeen", { time: dayTime(device.last_used_at) })}`}
            >
              <Btn size="sm" variant="danger" onClick={() => setRevoking({ id: device.id, name: device.name })}>{t("settings.revoke")}</Btn>
            </SettingRow>
          );
        })}
        <Failure error={devices.error ?? revoke.error} />
      </Group>
      <Group title={t("settings.addMachine")} hint={t("settings.addMachineHint")}>
        {pair.data && (
          <div className="st-pad">
            <div className="st-once"><Check size={14} />{t("settings.tokenOnce")}</div>
            <div className="st-code mono">{pair.data.token}</div>
            <Btn size="sm" onClick={() => void copy(pair.data.token)}><Copy />{t("settings.copy")}</Btn>
          </div>
        )}
        <div className="st-add">
          <Field value={name} onChange={setName} label={t("settings.machineName")} placeholder={t("settings.machinePlaceholder")} onEnter={() => name && pair.mutate()} />
          <Btn variant="primary" disabled={!name || pair.isPending} onClick={() => pair.mutate()}>{t("settings.createToken")}</Btn>
        </div>
        {pair.error && <div className="st-pad"><Failure error={pair.error} /></div>}
      </Group>
      {revoking && (
        <Confirm
          title={t("settings.revokeConfirm", { name: revoking.name })}
          body={t("settings.revokeBody")}
          action={t("settings.revoke")}
          onConfirm={() => revoke.mutate(revoking.id)}
          onClose={() => setRevoking(null)}
        />
      )}
    </>
  );
}

function Credentials() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const names = useQuery({ queryKey: ["credentials"], queryFn: () => must(api.GET("/credentials")) });
  const refresh = () => client.invalidateQueries({ queryKey: ["credentials"] });
  const save = useMutation({
    mutationFn: () => must(api.PUT("/credentials/{name}", { params: { path: { name } }, body: { value } })),
    onSuccess: () => {
      toast(t("settings.stored", { name }));
      setName("");
      setValue("");
      void refresh();
      void client.invalidateQueries({ queryKey: ["connectors"] });
    },
  });
  const remove = useMutation({
    mutationFn: (target: string) => must(api.DELETE("/credentials/{name}", { params: { path: { name: target } } })),
    onSuccess: () => {
      void refresh();
      void client.invalidateQueries({ queryKey: ["connectors"] });
    },
  });
  return (
    <>
      <Group title={t("settings.credentials")} hint={names.data ? String(names.data.length) : undefined}>
        {names.isPending && <div className="st-pad"><Skeleton count={2} height={44} /></div>}
        {names.data?.length === 0 && <p className="st-emp">{t("settings.credentialsEmpty")}</p>}
        {names.data?.map((item) => (
          <SettingRow key={item} icon={<span className="st-ic"><KeyRound size={15} /></span>} title={<span className="mono">{item}</span>} sub={t("settings.encrypted")}>
            <Btn size="sm" icon variant="ghost" aria-label={t("settings.deleteNamed", { name: item })} onClick={() => remove.mutate(item)}>
              <Trash2 />
            </Btn>
          </SettingRow>
        ))}
        <Failure error={names.error ?? remove.error} />
      </Group>
      <Group title={t("settings.addCredential")} hint={t("settings.credentialsHint")}>
        <div className="st-add">
          <Field value={name} onChange={setName} label={t("settings.name")} placeholder={t("settings.name")} />
          <Field type="password" value={value} onChange={setValue} label={t("settings.value")} placeholder={t("settings.value")} onEnter={() => name && value && save.mutate()} />
          <Btn variant="primary" disabled={!name || !value || save.isPending} onClick={() => save.mutate()}>{t("settings.store")}</Btn>
        </div>
        {save.error && <div className="st-pad"><Failure error={save.error} /></div>}
      </Group>
    </>
  );
}

function Account() {
  const me = useMe();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const logout = async () => {
    await api.POST("/auth/logout").catch(() => undefined);
    storeToken(null);
    client.clear();
    location.hash = "";
    location.reload();
  };
  return (
    <>
      <Group title={t("settings.profile")}>
        <div className="st-prof">
          <Avatar name={me.data?.name ?? "?"} size={40} />
          <div className="grow">
            <b>{me.data?.name ?? t("common.loading")}</b>
            <small>{t("settings.server", { host: location.host })}</small>
          </div>
        </div>
      </Group>
      <div className="st-dg">
        <div className="grow">
          <b>{t("settings.signOut")}</b>
          <small>{t("settings.signOutHint")}</small>
        </div>
        <Btn variant="danger" onClick={() => setConfirming(true)}><LogOut />{t("settings.signOut")}</Btn>
      </div>
      {confirming && (
        <Confirm title={t("settings.signOutConfirm")} action={t("settings.signOut")} onConfirm={() => void logout()} onClose={() => setConfirming(false)} />
      )}
    </>
  );
}

const CONTENT: Record<string, () => ReactNode> = { general: General, devices: Devices, credentials: Credentials, account: Account };

export function Settings() {
  useLanguage();
  const route = useRoute();
  const section = SECTIONS.find((item) => item.id === route.param) ?? SECTIONS[0]!;
  const Content = CONTENT[section.id]!;
  return (
    <div className="page flush">
      <div className="setx-st">
        <nav className="st-nav" aria-label={t("nav.settings")}>
          {SECTIONS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === section.id ? "on" : ""}
              aria-current={item.id === section.id ? "page" : undefined}
              onClick={() => go("settings", item.id)}
            >
              <item.icon size={15} strokeWidth={1.75} />
              {t(item.label)}
            </button>
          ))}
        </nav>
        <div className="st-main">
          <div className="st-in" key={section.id}>
            <header className="st-head">
              <div className="grow">
                <h1>{t(section.label)}</h1>
                <p>{t(section.lead)}</p>
              </div>
            </header>
            <Content />
          </div>
        </div>
      </div>
    </div>
  );
}

