import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, must, storeToken } from "../api/client";
import { Failure, Loaded, when } from "../ui";

function Credentials() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const names = useQuery({
    queryKey: ["credentials"],
    queryFn: () => must(api.GET("/credentials")),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["credentials"] });
  const save = useMutation({
    mutationFn: () =>
      must(api.PUT("/credentials/{name}", { params: { path: { name } }, body: { value } })),
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
    <>
      <h2>Credentials</h2>
      <p className="muted">
        Values are stored encrypted and never shown again. Use the provider name, such as
        anthropic, or mcp:linear, smtp and slack:team.
      </p>
      <Loaded query={names} empty="No credentials yet.">
        {(items) =>
          items.map((item) => (
            <div className="card row" key={item}>
              <span className="mono">{item}</span>
              <button className="danger" onClick={() => remove.mutate(item)}>
                Delete
              </button>
            </div>
          ))
        }
      </Loaded>
      <div className="card">
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Value
          <input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <Failure error={save.error ?? remove.error} />
        <button className="primary" disabled={!name || !value} onClick={() => save.mutate()}>
          Store
        </button>
      </div>
    </>
  );
}

function Connectors() {
  const connectors = useQuery({
    queryKey: ["connectors"],
    queryFn: () => must(api.GET("/connectors")),
  });
  const connect = useMutation({
    mutationFn: (id: string) =>
      must(api.POST("/connectors/{id}/connect", { params: { path: { id } } })),
    onSuccess: (started) => window.open(started.authorize_url, "_blank", "noopener"),
  });
  return (
    <>
      <h2>Connectors</h2>
      <Failure error={connect.error} />
      <Loaded query={connectors} empty="No connectors configured.">
        {(items) =>
          items.map((item) => (
            <div className="card row" key={item.name}>
              <span>
                {item.name} <span className="muted">{item.connected ? "connected" : "not connected"}</span>
              </span>
              {item.auth === "oauth" && (
                <button className="plain" onClick={() => connect.mutate(item.name)}>
                  {item.connected ? "Reconnect" : "Connect"}
                </button>
              )}
            </div>
          ))
        }
      </Loaded>
    </>
  );
}

function Devices() {
  const client = useQueryClient();
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => must(api.GET("/auth/devices")),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["devices"] });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      must(api.DELETE("/auth/devices/{id}", { params: { path: { id } } })),
    onSuccess: refresh,
  });
  const [name, setName] = useState("");
  const pair = useMutation({
    mutationFn: () => must(api.POST("/auth/tokens", { body: { name, kind: "node" } })),
    onSuccess: refresh,
  });
  return (
    <>
      <h2>Devices</h2>
      <Loaded query={devices} empty="No devices.">
        {(items) =>
          items.map((device) => (
            <div className="card row" key={device.id}>
              <span>
                {device.name}{" "}
                <span className="muted">
                  {device.kind}, last seen {when(device.last_used_at)}
                </span>
              </span>
              <button className="danger" onClick={() => revoke.mutate(device.id)}>
                Sign out
              </button>
            </div>
          ))
        }
      </Loaded>
      <div className="card">
        <label>
          Add a machine with the desktop agent
          <input
            value={name}
            placeholder="MacBook"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <Failure error={pair.error ?? revoke.error} />
        <button className="primary" disabled={!name} onClick={() => pair.mutate()}>
          Create token
        </button>
        {pair.data && (
          <>
            <p className="notice">This token is shown once.</p>
            <pre>{pair.data.token}</pre>
          </>
        )}
      </div>
    </>
  );
}

export function Settings() {
  const client = useQueryClient();
  const logout = async () => {
    await api.POST("/auth/logout");
    storeToken(null);
    client.clear();
    location.reload();
  };
  return (
    <>
      <div className="row">
        <h1>Settings</h1>
        <button className="plain" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
      <Connectors />
      <Credentials />
      <Devices />
    </>
  );
}
