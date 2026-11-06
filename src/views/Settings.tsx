import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, must, storeToken } from "../api/client";
import { useConnectors } from "../data";
import { dateTime } from "../format";
import { t, tOr, useLanguage } from "../i18n";
import { Dot, Failure, Head, Loaded, Section } from "../ui";
import { LanguagePicker } from "./LanguagePicker";

function Credentials() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const names = useQuery({ queryKey: ["credentials"], queryFn: () => must(api.GET("/credentials")) });
  const refresh = () => client.invalidateQueries({ queryKey: ["credentials"] });
  const save = useMutation({
    mutationFn: () => must(api.PUT("/credentials/{name}", { params: { path: { name } }, body: { value } })),
    onSuccess: () => {
      setName("");
      setValue("");
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (target: string) =>
      must(api.DELETE("/credentials/{name}", { params: { path: { name: target } } })),
    onSuccess: refresh,
  });
  return (
    <Section title={t("settings.credentials")} count={names.data?.length}>
      <p className="muted" style={{ marginBottom: 8 }}>{t("settings.credentialsHint")}</p>
      <div className="card">
        <Loaded query={names} empty={t("settings.credentialsEmpty")}>
          {(items) =>
            items.map((item) => (
              <div className="qrow" key={item}>
                <span className="l mono">{item}</span>
                <button className="btn sm danger" onClick={() => remove.mutate(item)}>{t("common.delete")}</button>
              </div>
            ))
          }
        </Loaded>
      </div>
      <div className="card">
        <label className="lab">
          {t("settings.name")}
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="lab">
          {t("settings.value")}
          <input className="field" type="password" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <Failure error={save.error ?? remove.error} />
        <button className="btn primary" disabled={!name || !value} onClick={() => save.mutate()}>
          {t("settings.store")}
        </button>
      </div>
    </Section>
  );
}

function Connectors() {
  const connectors = useConnectors();
  const connect = useMutation({
    mutationFn: (id: string) => must(api.POST("/connectors/{id}/connect", { params: { path: { id } } })),
    onSuccess: (started) => window.open(started.authorize_url, "_blank", "noopener"),
  });
  return (
    <Section title={t("settings.connectors")} count={connectors.data?.length}>
      <Failure error={connect.error} />
      <Loaded query={connectors} empty={t("settings.connectorsEmpty")}>
        {(items) => (
          <div className="card">
            {items.map((item) => (
              <div className="qrow" key={item.name}>
                <Dot tone={item.connected ? "ok" : "err"} />
                <span className="l">
                  {item.name}{" "}
                  <span className="muted">
                    {item.connected ? t("settings.connected") : t("settings.notConnected")}
                  </span>
                </span>
                {item.auth === "oauth" && (
                  <button className="btn sm" onClick={() => connect.mutate(item.name)}>
                    {item.connected ? t("settings.reconnect") : t("settings.connect")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Loaded>
    </Section>
  );
}

function Devices() {
  const client = useQueryClient();
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => must(api.GET("/auth/devices")) });
  const refresh = () => client.invalidateQueries({ queryKey: ["devices"] });
  const revoke = useMutation({
    mutationFn: (id: string) => must(api.DELETE("/auth/devices/{id}", { params: { path: { id } } })),
    onSuccess: refresh,
  });
  const [name, setName] = useState("");
  const pair = useMutation({
    mutationFn: () => must(api.POST("/auth/tokens", { body: { name, kind: "node" } })),
    onSuccess: refresh,
  });
  return (
    <Section title={t("settings.devices")} count={devices.data?.length}>
      <div className="card">
        <Loaded query={devices} empty={t("settings.devicesEmpty")}>
          {(items) =>
            items.map((device) => (
              <div className="qrow" key={device.id}>
                <span className="l">
                  {device.name}{" "}
                  <span className="muted">
                    {tOr(`device.${device.kind}`, device.kind)} ·{" "}
                    {t("settings.lastSeen", { time: dateTime(device.last_used_at) })}
                  </span>
                </span>
                <button className="btn sm danger" onClick={() => revoke.mutate(device.id)}>
                  {t("settings.revoke")}
                </button>
              </div>
            ))
          }
        </Loaded>
      </div>
      <div className="card">
        <label className="lab">
          {t("settings.addMachine")}
          <input className="field" value={name} placeholder={t("settings.machinePlaceholder")} onChange={(event) => setName(event.target.value)} />
        </label>
        <Failure error={pair.error ?? revoke.error} />
        <button className="btn" disabled={!name} onClick={() => pair.mutate()}>
          {t("settings.createToken")}
        </button>
        {pair.data && (
          <>
            <p className="note">{t("settings.tokenOnce")}</p>
            <pre className="code">{pair.data.token}</pre>
          </>
        )}
      </div>
    </Section>
  );
}

export function Settings() {
  useLanguage();
  const client = useQueryClient();
  const logout = async () => {
    await api.POST("/auth/logout");
    storeToken(null);
    client.clear();
    location.reload();
  };
  return (
    <div className="content narrow">
      <Head title={t("nav.settings")}>
        <button className="btn" onClick={() => void logout()}>{t("settings.signOut")}</button>
      </Head>
      <Section title={t("settings.appearance")}>
        <div className="card">
          <LanguagePicker />
        </div>
      </Section>
      <Connectors />
      <Credentials />
      <Devices />
    </div>
  );
}
