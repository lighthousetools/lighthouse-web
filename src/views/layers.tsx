import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { t, tOr } from "../i18n";
import { canManage, useRole } from "../session";
import { toast } from "../shell/state";
import { Badge, Btn, Failure, Field, Modal, Seg } from "../ui";
import "./layers.css";

export type View = Schemas["SettingsView"];
export type Layer = Schemas["Layer"];
/** The layer a change goes to: the whole workspace, or the caller's own settings. */
export type Target = "tenant" | "me";

export const EFFECTIVE = ["settings", "effective"] as const;

/** What applies to the caller: providers, models, routing and connectors with the layer each comes from. */
export function useEffective() {
  return useQuery({ queryKey: EFFECTIVE, queryFn: () => must(api.GET("/settings/effective")) });
}

export function usePresets() {
  return useQuery({ queryKey: ["settings", "presets"], queryFn: () => must(api.GET("/settings/presets")), staleTime: Infinity });
}

/** Reloads everything a settings change can touch. */
export function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["settings"] });
    void client.invalidateQueries({ queryKey: ["connectors"] });
    void client.invalidateQueries({ queryKey: ["credentials"] });
    void client.invalidateQueries({ queryKey: ["agents"] });
  };
}

/** The layer an entry of this source is changed in, if the caller may change it. */
export function targetOf(source: Layer, manage: boolean): Target | null {
  if (source === "personal") return "me";
  if (source === "tenant" && manage) return "tenant";
  return null;
}

export function useManage() {
  return canManage(useRole());
}

/** Where a value comes from: the server, the workspace or the caller. */
export function SourceBadge({ source }: { source: Layer }) {
  const tone = source === "personal" ? "vio" : source === "tenant" ? "info" : "";
  return <Badge tone={tone}>{tOr(`layers.${source}`, source)}</Badge>;
}

/** Chooses whether a change is for the whole workspace or only for the caller. Members only have their own. */
export function TargetPicker({ value, onChange }: { value: Target; onChange: (value: Target) => void }) {
  const manage = useManage();
  if (!manage) return <p className="faint lay-note">{t("layers.onlyMine")}</p>;
  return (
    <Seg<Target>
      label={t("layers.for")}
      value={value}
      onChange={onChange}
      options={[["tenant", t("layers.forWorkspace")], ["me", t("layers.forMe")]]}
    />
  );
}

/** Splits a list typed with commas, spaces or new lines. */
export const words = (text: string) => text.split(/[\s,]+/).map((word) => word.trim()).filter(Boolean);

/** Stores a key or token in the workspace vault or the caller's own one. */
export function SecretModal({ name, title, defaultTarget, onClose }: { name: string; title: string; defaultTarget: Target; onClose: () => void }) {
  const refresh = useRefresh();
  const manage = useManage();
  const [target, setTarget] = useState<Target>(manage ? defaultTarget : "me");
  const [value, setValue] = useState("");
  const save = useMutation({
    mutationFn: () =>
      target === "tenant"
        ? must(api.PUT("/credentials/{name}", { params: { path: { name } }, body: { value } }))
        : must(api.PUT("/me/credentials/{name}", { params: { path: { name } }, body: { value } })),
    onSuccess: () => {
      toast(t("settings.stored", { name }));
      refresh();
      onClose();
    },
  });
  return (
    <Modal
      title={title}
      sub={t("layers.secretHint", { name })}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="primary" disabled={!value || save.isPending} onClick={() => save.mutate()}>{t("settings.store")}</Btn>
        </>
      }
    >
      <div className="lay-form">
      <TargetPicker value={target} onChange={setTarget} />
      <Field type="password" value={value} onChange={setValue} label={t("settings.value")} placeholder={t("settings.value")} onEnter={() => value && save.mutate()} />
      <Failure error={save.error} />
      </div>
    </Modal>
  );
}
