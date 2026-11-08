import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, LogOut, Plus, Settings as SettingsIcon, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { api, must, type LiveState } from "../api/client";
import { useMe } from "../data";
import { t, tOr } from "../i18n";
import { go } from "../router";
import { DEVICE, adopt, switchTenant, useAuthStatus, useTenants } from "../session";
import { Badge, Btn, Dot, Failure, Field, Modal, initials } from "../ui";
import { Popover, type Anchor } from "../ui/popover";
import { toast } from "./state";

/** Creates a tenant the user owns and moves this browser there. The server may refuse (403), and says why. */
export function NewTenantDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => must(api.POST("/tenants", { body: { name: name.trim(), ...DEVICE } })),
    onSuccess: (issued) => {
      onClose();
      adopt(issued, client);
      toast(t("tenant.created", { name: name.trim() }));
    },
  });
  const submit = () => name.trim() && !create.isPending && create.mutate();
  return (
    <Modal
      title={t("tenant.new")}
      sub={t("tenant.newHint")}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="primary" disabled={!name.trim() || create.isPending} onClick={submit}>{t("tenant.create")}</Btn>
        </>
      }
    >
      <Field autoFocus value={name} onChange={setName} label={t("tenant.name")} placeholder={t("tenant.namePlaceholder")} onEnter={submit} />
      <Failure error={create.error} />
    </Modal>
  );
}

/** The avatar at the bottom of the rail: who is signed in, in which tenant, the other tenants, and signing out. */
export function Profile({ live, onSignOut }: { live: LiveState; onSignOut: () => void }) {
  const me = useMe();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [creating, setCreating] = useState(false);
  const close = () => setAnchor(null);
  return (
    <>
      <button
        type="button"
        aria-label={t("menu.profile")}
        aria-expanded={!!anchor}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { left: box.left, right: box.right, top: box.top, bottom: box.bottom });
        }}
      >
        {initials(me.data?.name ?? "") || "·"}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={close} width={300} side="right" label={t("menu.profile")}>
          <ProfileCard live={live} close={close} onNew={() => { close(); setCreating(true); }} onSignOut={onSignOut} />
        </Popover>
      )}
      {creating && <NewTenantDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function ProfileCard({ live, close, onNew, onSignOut }: { live: LiveState; close: () => void; onNew: () => void; onSignOut: () => void }) {
  const client = useQueryClient();
  const me = useMe();
  const tenants = useTenants();
  const status = useAuthStatus();
  const switching = useMutation({
    mutationFn: (id: string) => switchTenant(id, client),
    onSuccess: close,
    onError: (error) => toast(error.message, "bad"),
  });
  const data = me.data;
  const list = tenants.data ?? [];
  const open = (section: string) => {
    close();
    go("settings", section);
  };
  return (
    <div className="pf">
      <div className="pf-h">
        <span className="pf-av">{initials(data?.name ?? "") || "·"}</span>
        <span className="grow">
          <b className="clip">{data?.name ?? t("common.loading")}</b>
          <small className="clip">{data?.email ?? location.host}</small>
        </span>
        {data?.email && data.email_verified === false && <Badge tone="warn">{t("account.unverified")}</Badge>}
      </div>
      {list.length > 0 && (
        <>
          <div className="bell-s">{t("tenant.workspaces")}</div>
          {list.map((tenant) => {
            const current = tenant.tenant_id === data?.tenant_id;
            return (
              <button
                type="button"
                key={tenant.tenant_id}
                className={`bell-r pf-t ${current ? "on" : ""}`}
                aria-current={current ? "true" : undefined}
                disabled={switching.isPending}
                onClick={() => (current ? open("workspace") : switching.mutate(tenant.tenant_id))}
              >
                <span className="pf-ti">{initials(tenant.tenant_name) || <Building2 size={13} />}</span>
                <span className="grow">
                  <b className="clip">{tenant.tenant_name}</b>
                  <small>{tOr(`role.${tenant.role}`, tenant.role)}</small>
                </span>
                {current && <Check size={14} />}
              </button>
            );
          })}
        </>
      )}
      {status.data?.signup === "open" && (
        <button type="button" className="bell-r pf-a" onClick={onNew}><Plus size={14} />{t("tenant.new")}</button>
      )}
      <Failure error={tenants.error} />
      <hr />
      <button type="button" className="bell-r pf-a" onClick={() => open("account")}><UserRound size={14} />{t("settings.account")}</button>
      <button type="button" className="bell-r pf-a" onClick={() => open("workspace")}><Users size={14} />{t("settings.workspace")}</button>
      <button type="button" className="bell-r pf-a" onClick={() => open("general")}><SettingsIcon size={14} />{t("nav.settings")}</button>
      <hr />
      <button type="button" className="bell-r pf-a" onClick={() => { close(); go("connections"); }}>
        <Dot tone={live === "live" ? "ok" : "warn"} />
        <span className="grow clip faint">{live === "live" ? t("status.live") : t("status.reconnecting")} · {location.host}</span>
      </button>
      <button type="button" className="bell-r pf-a" onClick={() => { close(); onSignOut(); }}><LogOut size={14} />{t("settings.signOut")}</button>
    </div>
  );
}
