import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, Copy, Cpu, Globe, KeyRound, Wallet, Laptop, LogOut, Monitor, Smartphone, Terminal, Trash2, UserRound, Users, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, currentDevice, must, storeToken } from "../api/client";
import { useMe } from "../data";
import { dayTime } from "../format";
import { t, tOr, useLanguage, type Key } from "../i18n";
import { go, useRoute } from "../router";
import { canManage, signOut, useRole, useTenants, type Role } from "../session";
import { lookChoice, setLook, type LookChoice } from "../shell/look";
import { toast } from "../shell/state";
import { Avatar, Badge, Btn, Confirm, Failure, Field, Modal, Progress, Seg, Skeleton } from "../ui";
import { LanguagePicker } from "./LanguagePicker";
import { MIN_PASSWORD } from "./Login";
import { Group, ReadOnly, SettingRow, copy } from "./settingsKit";
import { Costs, Workspace } from "./Workspace";
import "./settings.css";

type Section = { id: string; label: Key; lead: Key; icon: LucideIcon; manage?: boolean };

const SECTIONS: Section[] = [
  { id: "general", label: "settings.general", lead: "settings.generalLead", icon: Globe },
  { id: "account", label: "settings.account", lead: "settings.accountLead", icon: UserRound },
  { id: "workspace", label: "settings.workspace", lead: "settings.workspaceLead", icon: Users },
  { id: "devices", label: "settings.devices", lead: "settings.devicesLead", icon: Laptop },
  { id: "credentials", label: "settings.credentials", lead: "settings.credentialsLead", icon: KeyRound },
  { id: "models", label: "settings.models", lead: "settings.modelsLead", icon: Cpu },
  { id: "budget", label: "settings.budget", lead: "settings.budgetLead", icon: Wallet },
  { id: "costs", label: "settings.costs", lead: "settings.costsLead", icon: BarChart3, manage: true },
];

/** The sections a role sees: members miss the ones only owners and admins can read. */
export const sectionsFor = (role: Role | null) => SECTIONS.filter((section) => !section.manage || canManage(role));

const DEVICE_ICONS: Record<string, LucideIcon> = { web: Globe, mac: Laptop, ios: Smartphone, node: Monitor, api: Terminal };

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
  const tenants = useTenants();
  const tenantNames = Object.fromEntries((tenants.data ?? []).map((item) => [item.tenant_id, item.tenant_name]));
  const several = (tenants.data?.length ?? 0) > 1;
  const refresh = () => client.invalidateQueries({ queryKey: ["devices"] });
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => must(api.DELETE("/auth/devices/{id}", { params: { path: { id } } })),
    onSuccess: (_, id) => {
      toast(t("settings.revoked"));
      // Signing out this browser from the list ends the session here too.
      if (id === currentDevice()) {
        storeToken(null);
        client.clear();
        return;
      }
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
  return (
    <>
      <Group title={t("settings.devices")} hint={devices.data ? String(devices.data.length) : undefined}>
        {devices.isPending && <div className="st-pad"><Skeleton count={2} height={44} /></div>}
        {devices.data?.length === 0 && <p className="st-emp">{t("settings.devicesEmpty")}</p>}
        {devices.data?.map((device) => {
          const Icon = DEVICE_ICONS[device.kind] ?? Monitor;
          const where = several && device.tenant_id ? tenantNames[device.tenant_id] : undefined;
          return (
            <SettingRow
              key={device.id}
              icon={<span className="st-ic"><Icon size={15} /></span>}
              title={<>{device.name}{device.id === currentDevice() && <span className="st-me">{t("settings.thisBrowser")}</span>}</>}
              sub={[tOr(`device.${device.kind}`, device.kind), where, t("settings.lastSeen", { time: dayTime(device.last_used_at) })].filter(Boolean).join(" · ")}
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

/** Provider names the routing uses, offered as names for a model key. */
function useProviders() {
  const models = useQuery({ queryKey: ["settings", "models"], queryFn: () => must(api.GET("/settings/models")) });
  return [...new Set((models.data ?? []).flatMap((route) => [route.provider, route.fallback]).filter((item): item is string => !!item))];
}

function Credentials() {
  const client = useQueryClient();
  const manage = canManage(useRole());
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const names = useQuery({ queryKey: ["credentials"], queryFn: () => must(api.GET("/credentials")) });
  const providers = useProviders();
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
          <SettingRow key={item} icon={<span className="st-ic"><KeyRound size={15} /></span>} title={<span className="mono">{item}</span>} sub={providers.includes(item) ? t("settings.modelKey") : t("settings.encrypted")}>
            {manage && (
              <Btn size="sm" icon variant="ghost" aria-label={t("settings.deleteNamed", { name: item })} onClick={() => remove.mutate(item)}>
                <Trash2 />
              </Btn>
            )}
          </SettingRow>
        ))}
        <Failure error={names.error ?? remove.error} />
      </Group>
      {!manage && <ReadOnly>{t("roles.keysAdmin")}</ReadOnly>}
      {manage && <Group title={t("settings.addCredential")} hint={t("settings.credentialsHint")}>
        {providers.length > 0 && (
          <div className="st-pad" style={{ paddingBottom: 0 }}>
            <small className="faint">{t("settings.modelKeysHint")}</small>
          </div>
        )}
        {providers.length > 0 && (
          <div className="st-chips" style={{ paddingTop: "var(--s2)" }}>
            {providers.map((provider) => (
              <Btn key={provider} size="xs" variant={name === provider ? "primary" : ""} onClick={() => setName(provider)}>{provider}</Btn>
            ))}
          </div>
        )}
        <div className="st-add">
          <Field value={name} onChange={setName} label={t("settings.name")} placeholder={t("settings.name")} />
          <Field type="password" value={value} onChange={setValue} label={t("settings.value")} placeholder={t("settings.value")} onEnter={() => name && value && save.mutate()} />
          <Btn variant="primary" disabled={!name || !value || save.isPending} onClick={() => save.mutate()}>{t("settings.store")}</Btn>
        </div>
        {save.error && <div className="st-pad"><Failure error={save.error} /></div>}
      </Group>}
    </>
  );
}

function Account() {
  const me = useMe();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const rename = useMutation({
    mutationFn: (value: string) => must(api.PATCH("/me", { body: { name: value } })),
    onSuccess: () => {
      setName(null);
      toast(t("account.renamed"));
      void client.invalidateQueries({ queryKey: ["me"] });
      void client.invalidateQueries({ queryKey: ["tenant", "members"] });
    },
  });
  const resend = useMutation({
    mutationFn: () => must(api.POST("/auth/verify/resend")),
    onSuccess: () => toast(t("verify.sent")),
    onError: (error) => toast(error.message, "bad"),
  });
  const logout = async () => {
    await signOut(client);
    location.hash = "";
    location.reload();
  };
  const data = me.data;
  const value = name ?? data?.name ?? "";
  // The admin token has no account of its own: no name, email or password to change.
  const person = !!data?.email;
  return (
    <>
      <Group title={t("settings.profile")}>
        <div className="st-prof">
          <Avatar name={data?.name ?? "?"} size={40} />
          <div className="grow">
            <b>{data?.name ?? t("common.loading")}</b>
            <small>{data?.email ?? t("settings.server", { host: location.host })}</small>
          </div>
          {person && (data?.email_verified ? <Badge tone="ok">{t("account.verified")}</Badge> : <Badge tone="warn">{t("account.unverified")}</Badge>)}
        </div>
        {person && (
          <SettingRow title={t("account.name")} sub={t("account.nameHint")}>
            <span className="st-inline">
              <span className="st-f"><Field value={value} onChange={setName} label={t("account.name")} autoComplete="name" onEnter={() => value.trim() && rename.mutate(value.trim())} /></span>
              {name !== null && name !== data?.name && (
                <Btn size="sm" variant="primary" disabled={!value.trim() || rename.isPending} onClick={() => rename.mutate(value.trim())}>{t("common.save")}</Btn>
              )}
            </span>
          </SettingRow>
        )}
        {person && (
          <SettingRow title={t("login.email")} sub={data?.email_verified ? t("account.emailVerified") : t("account.emailUnverified")}>
            {!data?.email_verified && <Btn size="sm" disabled={resend.isPending} onClick={() => resend.mutate()}>{t("verify.resend")}</Btn>}
          </SettingRow>
        )}
        <SettingRow title={t("settings.serverTitle")} sub={data?.timezone ? t("account.timezone", { zone: data.timezone }) : undefined}>
          <span className="st-cnt">{location.host}</span>
        </SettingRow>
        {rename.error && <div className="st-pad"><Failure error={rename.error} /></div>}
      </Group>
      {person && <Password />}
      <div className="st-dg">
        <div className="grow">
          <b>{t("settings.signOut")}</b>
          <small>{t("settings.signOutHint")}</small>
        </div>
        <Btn variant="danger" onClick={() => setConfirming(true)}><LogOut />{t("settings.signOut")}</Btn>
      </div>
      {person && (
        <div className="st-dg">
          <div className="grow">
            <b>{t("account.delete")}</b>
            <small>{t("account.deleteHint")}</small>
          </div>
          <Btn variant="danger" onClick={() => setDeleting(true)}><Trash2 />{t("account.delete")}</Btn>
        </div>
      )}
      {confirming && (
        <Confirm title={t("settings.signOutConfirm")} action={t("settings.signOut")} onConfirm={() => void logout()} onClose={() => setConfirming(false)} />
      )}
      {deleting && data?.email && <DeleteAccount email={data.email} onClose={() => setDeleting(false)} />}
    </>
  );
}

function Password() {
  const client = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => must(api.POST("/auth/password", { body: { current, new: next } })),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast(t("account.passwordChanged"));
      void client.invalidateQueries({ queryKey: ["devices"] });
    },
  });
  const ready = !!current && next.length >= MIN_PASSWORD && !change.isPending;
  return (
    <Group title={t("account.password")} hint={t("account.passwordHint")}>
      <div className="st-add">
        <Field type="password" value={current} onChange={setCurrent} autoComplete="current-password" label={t("account.currentPassword")} placeholder={t("account.currentPassword")} />
        <Field type="password" value={next} onChange={setNext} autoComplete="new-password" label={t("account.newPassword")} placeholder={t("login.newPassword", { count: MIN_PASSWORD })} onEnter={() => ready && change.mutate()} />
        <Btn variant="primary" disabled={!ready} onClick={() => change.mutate()}>{t("account.changePassword")}</Btn>
      </div>
      {next && next.length < MIN_PASSWORD && <div className="st-pad" style={{ paddingTop: 0 }}><small className="faint">{t("login.passwordShort", { count: MIN_PASSWORD })}</small></div>}
      {change.error && <div className="st-pad"><Failure error={change.error} /></div>}
    </Group>
  );
}

/** Deleting the account needs its email address typed again, as the server asks. */
function DeleteAccount({ email, onClose }: { email: string; onClose: () => void }) {
  const client = useQueryClient();
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => must(api.DELETE("/me", { body: { confirm: typed.trim() } })),
    onSuccess: () => {
      storeToken(null);
      client.clear();
      location.hash = "";
    },
  });
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <Modal
      title={t("account.deleteConfirm")}
      sub={t("account.deleteBody")}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="danger" disabled={!matches || remove.isPending} onClick={() => remove.mutate()}>{t("account.delete")}</Btn>
        </>
      }
    >
      <Field autoFocus type="email" value={typed} onChange={setTyped} label={t("account.typeEmail")} placeholder={email} onEnter={() => matches && remove.mutate()} />
      <Failure error={remove.error} />
    </Modal>
  );
}

/** Which provider and model serve each task, with the fallback. Read-only: routing lives in the configuration. */
function Models() {
  const models = useQuery({ queryKey: ["settings", "models"], queryFn: () => must(api.GET("/settings/models")) });
  if (models.isPending) return <Skeleton count={3} height={52} />;
  return (
    <Group title={t("settings.modelsTitle")} hint={t("settings.modelsHint")}>
      {(models.data ?? []).map((route) => (
        <SettingRow key={route.task} title={tOr(`settings.task.${route.task}`, route.task)} sub={route.fallback ? t("settings.fallback", { fallback: [route.fallback, route.fallback_model].filter(Boolean).join(" · ") }) : undefined}>
          <span className="st-model"><b>{route.model ?? "–"}</b><small>{route.provider}</small></span>
        </SettingRow>
      ))}
      {models.data?.length === 0 && <SettingRow title={t("settings.noModels")} />}
    </Group>
  );
}

/** A monthly budget: an alert when it is nearly used up. It never stops runs; the limit per run does that. */
function Budget() {
  const client = useQueryClient();
  const manage = canManage(useRole());
  const budget = useQuery({ queryKey: ["settings", "budget"], queryFn: () => must(api.GET("/settings/budget")) });
  const [monthly, setMonthly] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: { monthly_eur: number | null; alert_at_percent: number }) => must(api.PUT("/settings/budget", { body })),
    onSuccess: () => {
      setMonthly(null);
      toast(t("settings.budgetSaved"));
      void client.invalidateQueries({ queryKey: ["settings", "budget"] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const raw = budget.data;
  if (!raw) return budget.isPending ? <Skeleton count={3} height={52} /> : <Failure error={budget.error} />;
  const data = { ...raw, alert_at_percent: raw.alert_at_percent ?? 80 };
  const euro = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "EUR" });
  const share = data.monthly_eur ? Math.min(100, (data.spent_this_month_eur / data.monthly_eur) * 100) : 0;
  const value = monthly ?? (data.monthly_eur != null ? String(data.monthly_eur) : "");
  const commit = () => {
    const parsed = value.trim() ? Number(value.replace(",", ".")) : null;
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) return toast(t("settings.budgetInvalid"), "bad");
    save.mutate({ monthly_eur: parsed, alert_at_percent: data.alert_at_percent });
  };
  return (
    <>
      <Group title={t("settings.thisMonth")}>
        <SettingRow title={euro(data.spent_this_month_eur)} sub={data.monthly_eur ? t("settings.ofBudget", { budget: euro(data.monthly_eur), remaining: euro(data.remaining_eur ?? 0) }) : t("settings.noBudget")}>
          {data.monthly_eur ? <span style={{ width: 180 }}><Progress value={share} color={share >= data.alert_at_percent ? "var(--warn)" : undefined} /></span> : null}
        </SettingRow>
      </Group>
      {!manage && <ReadOnly>{t("roles.budgetAdmin")}</ReadOnly>}
      {!manage && (
        <Group title={t("settings.budget")} hint={t("settings.budgetHint")}>
          <SettingRow title={t("settings.monthly")}><b className="tn">{data.monthly_eur != null ? euro(data.monthly_eur) : t("common.none")}</b></SettingRow>
          <SettingRow title={t("settings.alertAt")}><b className="tn">{data.alert_at_percent} %</b></SettingRow>
        </Group>
      )}
      {manage && <Group title={t("settings.budget")} hint={t("settings.budgetHint")}>
        <SettingRow title={t("settings.monthly")} sub={t("settings.monthlyHint")}>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input className="field" style={{ width: 110, height: "var(--h-sm)" }} inputMode="decimal" aria-label={t("settings.monthly")} placeholder="–" value={value} onChange={(event) => setMonthly(event.target.value)} onKeyDown={(event) => event.key === "Enter" && commit()} />
            <span className="faint">€</span>
            {monthly !== null && <Btn size="sm" variant="primary" disabled={save.isPending} onClick={commit}>{t("common.save")}</Btn>}
          </span>
        </SettingRow>
        <SettingRow title={t("settings.alertAt")} sub={t("settings.alertAtHint")}>
          <Seg<string> label={t("settings.alertAt")} value={String(data.alert_at_percent)} onChange={(percent) => save.mutate({ monthly_eur: data.monthly_eur ?? null, alert_at_percent: Number(percent) })} options={[["50", "50 %"], ["80", "80 %"], ["90", "90 %"]]} />
        </SettingRow>
      </Group>}
      {data.run_limits.length > 0 && (
        <Group title={t("settings.runLimits")} hint={t("settings.runLimitsHint")}>
          {data.run_limits.map((limit) => (
            <SettingRow key={limit.agent_id} title={limit.agent_id}><b className="tn">{euro(limit.max_cost_eur)}</b></SettingRow>
          ))}
        </Group>
      )}
    </>
  );
}

const CONTENT: Record<string, () => ReactNode> = { models: Models, budget: Budget, general: General, devices: Devices, credentials: Credentials, account: Account, workspace: Workspace, costs: Costs };

export function Settings() {
  useLanguage();
  const route = useRoute();
  const sections = sectionsFor(useRole());
  const section = sections.find((item) => item.id === route.param) ?? sections[0]!;
  const Content = CONTENT[section.id]!;
  return (
    <div className="page flush">
      <div className="setx-st">
        <nav className="st-nav" aria-label={t("nav.settings")}>
          {sections.map((item) => (
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

