import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Building2, Copy, LogOut, Mail, Plus, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { api, must, storeToken, type Schemas } from "../api/client";
import { useMe } from "../data";
import { dayTime } from "../format";
import { t, tOr } from "../i18n";
import { DEVICE, adopt, canManage, isOwner, useAuthStatus, useRole, useTenants, type Role } from "../session";
import { NewTenantDialog } from "../shell/Profile";
import { toast } from "../shell/state";
import { Avatar, Btn, Confirm, Failure, Field, Modal, Seg, Skeleton } from "../ui";
import { Select } from "../ui/select";
import { Group, ReadOnly, SettingRow, copy } from "./settingsKit";

const ROLES: Role[] = ["owner", "admin", "member"];
export const roleLabel = (role: string) => tOr(`role.${role}`, role);

/** Roles the caller may hand out: owners every role, admins admin and member. */
export const grantable = (mine: Role | null) => ROLES.filter((role) => role !== "owner" || isOwner(mine));

/** Whether the caller may change or remove this member: never themselves here, and owners only by owners. */
export const mayChange = (mine: Role | null, member: Schemas["Member"], self: string | null | undefined) =>
  canManage(mine) && member.user_id !== self && (member.role !== "owner" || isOwner(mine));

/**
 * Leaves the current tenant through `action` (leaving or deleting it). The token of this tenant stops working, so a
 * token for another tenant of the user is fetched first; without one, this browser signs out.
 */
async function depart(action: () => Promise<unknown>, next: string | undefined, client: QueryClient) {
  const issued = next ? await must(api.POST("/tenants/{id}/switch", { params: { path: { id: next } }, body: DEVICE })) : null;
  try {
    await action();
  } catch (error) {
    if (issued) void globalThis.fetch("/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${issued.token}` } }).catch(() => undefined);
    throw error;
  }
  if (issued) adopt(issued, client);
  else {
    storeToken(null);
    client.clear();
  }
}

function useMembers() {
  return useQuery({ queryKey: ["tenant", "members"], queryFn: () => must(api.GET("/tenant/members")) });
}

export function Workspace() {
  const client = useQueryClient();
  const role = useRole();
  const me = useMe();
  const manage = canManage(role);
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: () => must(api.GET("/tenant")) });
  const tenants = useTenants();
  const status = useAuthStatus();
  const [name, setName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const rename = useMutation({
    mutationFn: (value: string) => must(api.PATCH("/tenant", { body: { name: value } })),
    onSuccess: () => {
      setName(null);
      toast(t("tenant.renamed"));
      for (const key of [["tenant"], ["tenants"], ["me"]]) void client.invalidateQueries({ queryKey: key });
    },
  });
  if (!tenant.data) return tenant.isPending ? <Skeleton count={3} height={52} /> : <Failure error={tenant.error} />;
  const value = name ?? tenant.data.name;
  const other = tenants.data?.find((item) => item.tenant_id !== tenant.data.id)?.tenant_id;
  return (
    <>
      <Group title={t("tenant.title")}>
        <SettingRow icon={<span className="st-ic"><Building2 size={15} /></span>} title={t("tenant.name")} sub={t("tenant.since", { time: dayTime(tenant.data.created_at) })}>
          {manage ? (
            <span className="st-inline">
              <span className="st-f"><Field value={value} onChange={setName} label={t("tenant.name")} onEnter={() => value.trim() && rename.mutate(value.trim())} /></span>
              {name !== null && name !== tenant.data.name && (
                <Btn size="sm" variant="primary" disabled={!value.trim() || rename.isPending} onClick={() => rename.mutate(value.trim())}>{t("common.save")}</Btn>
              )}
            </span>
          ) : (
            <b>{tenant.data.name}</b>
          )}
        </SettingRow>
        <SettingRow title={t("tenant.yourRole")} sub={t(manage ? "tenant.roleManage" : "tenant.roleMember")}>
          <b>{roleLabel(tenant.data.role)}</b>
        </SettingRow>
        {rename.error && <div className="st-pad"><Failure error={rename.error} /></div>}
      </Group>
      {!manage && <ReadOnly>{t("roles.workspaceAdmin")}</ReadOnly>}
      <Members role={role} self={me.data?.user_id} />
      {manage && <Invite role={role} />}
      {manage && <Invitations />}
      {status.data?.signup === "open" && (
        <Group title={t("tenant.workspaces")} hint={t("tenant.newHint")}>
          <SettingRow icon={<span className="st-ic"><Plus size={15} /></span>} title={t("tenant.new")} sub={t("tenant.count", { count: tenants.data?.length ?? 1 })}>
            <Btn size="sm" onClick={() => setCreating(true)}>{t("tenant.create")}</Btn>
          </SettingRow>
        </Group>
      )}
      <Danger tenant={tenant.data} role={role} self={me.data?.user_id} other={other} />
      {creating && <NewTenantDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function Members({ role, self }: { role: Role | null; self: string | null | undefined }) {
  const client = useQueryClient();
  const members = useMembers();
  const [removing, setRemoving] = useState<Schemas["Member"] | null>(null);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["tenant"] });
  };
  const change = useMutation({
    mutationFn: ({ user, next }: { user: string; next: Role }) => must(api.PATCH("/tenant/members/{user}", { params: { path: { user } }, body: { role: next } })),
    onSuccess: () => {
      toast(t("members.roleChanged"));
      refresh();
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const remove = useMutation({
    mutationFn: (user: string) => must(api.DELETE("/tenant/members/{user}", { params: { path: { user } } })),
    onSuccess: () => {
      toast(t("members.removed"));
      refresh();
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const list = members.data ?? [];
  return (
    <Group title={t("members.title")} hint={members.data ? String(list.length) : undefined}>
      {members.isPending && <div className="st-pad"><Skeleton count={2} height={44} /></div>}
      {list.map((member) => {
        const editable = mayChange(role, member, self);
        return (
          <SettingRow
            key={member.user_id}
            icon={<Avatar name={member.name} size={28} />}
            title={<>{member.name}{member.user_id === self && <span className="st-me">{t("members.you")}</span>}</>}
            sub={`${member.email} · ${t("members.joined", { time: dayTime(member.joined_at) })}`}
          >
            {editable ? (
              <>
                <Select<Role>
                  size="sm"
                  width={120}
                  label={t("members.roleOf", { name: member.name })}
                  value={member.role}
                  onChange={(next) => next !== member.role && change.mutate({ user: member.user_id, next })}
                  options={grantable(role).map((item) => [item, roleLabel(item)] as const)}
                />
                <Btn size="sm" icon variant="ghost" aria-label={t("members.removeNamed", { name: member.name })} onClick={() => setRemoving(member)}>
                  <Trash2 />
                </Btn>
              </>
            ) : (
              <span className="st-cnt">{roleLabel(member.role)}</span>
            )}
          </SettingRow>
        );
      })}
      <Failure error={members.error} />
      {removing && (
        <Confirm
          title={t("members.removeConfirm", { name: removing.name })}
          body={t("members.removeBody")}
          action={t("members.remove")}
          onConfirm={() => remove.mutate(removing.user_id)}
          onClose={() => setRemoving(null)}
        />
      )}
    </Group>
  );
}

function Invite({ role }: { role: Role | null }) {
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [as, setAs] = useState<Role>("member");
  const invite = useMutation({
    mutationFn: () => must(api.POST("/tenant/invitations", { body: { email: email.trim(), role: as } })),
    onSuccess: (created) => {
      setEmail("");
      if (created.mailed) toast(t("invite.mailed", { email: created.invitation.email }));
      void client.invalidateQueries({ queryKey: ["tenant", "invitations"] });
    },
  });
  const submit = () => email.trim() && !invite.isPending && invite.mutate();
  const link = invite.data?.accept_url;
  return (
    <Group title={t("invite.new")} hint={t("invite.newHint")}>
      {link && (
        <>
          <div className="st-once"><Mail size={14} />{t("invite.linkOnce", { email: invite.data!.invitation.email })}</div>
          <div className="st-link-row">
            <div className="st-code mono">{link}</div>
            <Btn size="sm" onClick={() => void copy(link)}><Copy />{t("settings.copy")}</Btn>
          </div>
        </>
      )}
      <div className="st-add">
        <Field type="email" value={email} onChange={setEmail} label={t("login.email")} placeholder={t("invite.emailPlaceholder")} onEnter={submit} />
        <Select<Role> width={120} label={t("invite.role")} value={as} onChange={setAs} options={grantable(role).map((item) => [item, roleLabel(item)] as const)} />
        <Btn variant="primary" disabled={!email.trim() || invite.isPending} onClick={submit}><UserPlus />{t("invite.send")}</Btn>
      </div>
      {invite.error && <div className="st-pad"><Failure error={invite.error} /></div>}
    </Group>
  );
}

function Invitations() {
  const client = useQueryClient();
  const invitations = useQuery({ queryKey: ["tenant", "invitations"], queryFn: () => must(api.GET("/tenant/invitations")) });
  const revoke = useMutation({
    mutationFn: (id: string) => must(api.DELETE("/tenant/invitations/{id}", { params: { path: { id } } })),
    onSuccess: () => {
      toast(t("invite.revoked"));
      void client.invalidateQueries({ queryKey: ["tenant", "invitations"] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const list = invitations.data ?? [];
  if (!invitations.isPending && !list.length && !invitations.error) return null;
  return (
    <Group title={t("invite.pending")} hint={invitations.data ? String(list.length) : undefined}>
      {invitations.isPending && <div className="st-pad"><Skeleton count={1} height={44} /></div>}
      {list.map((item) => (
        <SettingRow
          key={item.id}
          icon={<span className="st-ic"><Mail size={15} /></span>}
          title={item.email}
          sub={`${roleLabel(item.role)} · ${t("common.expires", { time: dayTime(item.expires_at) })}`}
        >
          <Btn size="sm" variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate(item.id)}>{t("invite.revoke")}</Btn>
        </SettingRow>
      ))}
      <Failure error={invitations.error} />
    </Group>
  );
}

function Danger({ tenant, role, self, other }: { tenant: Schemas["TenantInfo"]; role: Role | null; self: string | null | undefined; other: string | undefined }) {
  const client = useQueryClient();
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const leave = useMutation({
    mutationFn: () => depart(() => must(api.DELETE("/tenant/members/{user}", { params: { path: { user: self! } } })), other, client),
    onError: (error) => toast(error.message, "bad"),
  });
  const remove = useMutation({
    mutationFn: () => depart(() => must(api.DELETE("/tenant", { body: { confirm: typed } })), other, client),
    onSuccess: () => toast(t("tenant.deleted", { name: tenant.name })),
  });
  const closeDelete = () => {
    setDeleting(false);
    setTyped("");
    remove.reset();
  };
  return (
    <div className="st-dgs">
      {self && (
        <div className="st-dg">
          <div className="grow">
            <b>{t("tenant.leave")}</b>
            <small>{other ? t("tenant.leaveHint") : t("tenant.leaveLast")}</small>
          </div>
          <Btn variant="danger" disabled={leave.isPending} onClick={() => setLeaving(true)}><LogOut />{t("tenant.leave")}</Btn>
        </div>
      )}
      {isOwner(role) && (
        <div className="st-dg">
          <div className="grow">
            <b>{t("tenant.delete")}</b>
            <small>{t("tenant.deleteHint")}</small>
          </div>
          <Btn variant="danger" onClick={() => setDeleting(true)}><Trash2 />{t("tenant.delete")}</Btn>
        </div>
      )}
      {leaving && (
        <Confirm
          title={t("tenant.leaveConfirm", { name: tenant.name })}
          body={t("tenant.leaveBody")}
          action={t("tenant.leave")}
          onConfirm={() => leave.mutate()}
          onClose={() => setLeaving(false)}
        />
      )}
      {deleting && (
        <Modal
          title={t("tenant.deleteConfirm", { name: tenant.name })}
          sub={t("tenant.deleteBody", { name: tenant.name })}
          onClose={closeDelete}
          actions={
            <>
              <Btn onClick={closeDelete}>{t("common.cancel")}</Btn>
              <Btn variant="danger" disabled={typed !== tenant.name || remove.isPending} onClick={() => remove.mutate()}>{t("tenant.delete")}</Btn>
            </>
          }
        >
          <Field autoFocus value={typed} onChange={setTyped} label={t("tenant.typeName")} placeholder={tenant.name} onEnter={() => typed === tenant.name && remove.mutate()} />
          <Failure error={remove.error} />
        </Modal>
      )}
    </div>
  );
}

const DAYS = ["7", "30", "90"] as const;

/** Run costs per user of the tenant, for owners and admins. */
export function Costs() {
  const [days, setDays] = useState<(typeof DAYS)[number]>("30");
  const costs = useQuery({
    queryKey: ["costs", "users", days],
    queryFn: () => must(api.GET("/costs/users", { params: { query: { days: Number(days) } } })),
  });
  const members = useMembers();
  const names = Object.fromEntries((members.data ?? []).map((member) => [member.user_id, member.name]));
  const list = costs.data ?? [];
  const total = list.reduce((sum, item) => sum + item.cost_eur, 0);
  const runs = list.reduce((sum, item) => sum + item.runs, 0);
  const top = Math.max(...list.map((item) => item.cost_eur), 0) || 1;
  const euro = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "EUR" });
  const tokens = (value: number) => value.toLocaleString();
  return (
    <>
      <Group title={t("costs.total")}>
        <SettingRow title={euro(total)} sub={t("costs.runs", { count: runs })}>
          <Seg<(typeof DAYS)[number]> label={t("costs.period")} value={days} onChange={setDays} options={DAYS.map((item) => [item, t("costs.days", { count: item })] as [typeof item, string])} />
        </SettingRow>
      </Group>
      <Group title={t("costs.byUser")} hint={t("costs.byUserHint")}>
        {costs.isPending && <div className="st-pad"><Skeleton count={2} height={44} /></div>}
        {costs.data?.length === 0 && <p className="st-emp">{t("costs.empty")}</p>}
        {list.map((item) => {
          const label = item.user_id ? names[item.user_id] ?? t("costs.formerMember") : t("costs.noUser");
          return (
            <SettingRow
              key={item.user_id ?? "none"}
              icon={item.user_id ? <Avatar name={label} size={28} /> : <span className="st-ic"><Building2 size={15} /></span>}
              title={label}
              sub={`${t("costs.runs", { count: item.runs })} · ${t("costs.tokens", { input: tokens(item.input_tokens), output: tokens(item.output_tokens) })}`}
            >
              <span className="st-cost">
                <span className="st-bar"><span className="st-stack" style={{ flex: 1, marginTop: 0 }}><i className="p0" style={{ width: `${(item.cost_eur / top) * 100}%` }} /></span></span>
                <b className="tn">{euro(item.cost_eur)}</b>
              </span>
            </SettingRow>
          );
        })}
        <Failure error={costs.error} />
      </Group>
    </>
  );
}
