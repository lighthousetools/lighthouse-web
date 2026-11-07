import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plug, RefreshCw } from "lucide-react";
import { api, must, type Schemas } from "../api/client";
import { dayTime } from "../format";
import { language, t } from "../i18n";
import { orgStore } from "../shell/org";
import { go } from "../router";
import { openExternal } from "../shell/bridge";
import { toast } from "../shell/state";
import { Btn, Empty, ServiceIcon, Skeleton, brandOf } from "../ui";
import { Markdown } from "../ui/markdown";
import { InspectorPanel } from "../shell/Inspector";
import { age } from "./Ready";

export type Item = Schemas["SyncedItem"];
export type Source = Schemas["SourceInfo"];
export type Domain = "mail" | "calendar" | "issues" | "code" | "deals" | "bank" | "invoices" | "documents" | "rooms" | "holdings";
type ListQuery = { q?: string; source?: string; state?: string; flags?: string; open?: boolean; from?: string; to?: string; snoozed?: boolean; limit?: number; offset?: number };
type ListPath =
  | "/inbox" | "/mail/threads" | "/calendar/events" | "/issues" | "/issues/projects" | "/issues/cycles" | "/pulls"
  | "/connected/search" | "/deals" | "/bank/accounts" | "/bank/transactions" | "/invoices" | "/contracts" | "/rooms"
  | "/holdings" | "/holdings/quotes";
export type Organization = Schemas["Organization"];

export function useOrganizations() {
  return useQuery({ queryKey: ["connected", "organizations"], queryFn: () => must(api.GET("/organizations")), staleTime: 60_000 });
}

/** The organization chosen in the menu bar, if it still exists. */
export function useOrg(): Organization | undefined {
  const org = orgStore.use();
  const list = useOrganizations();
  return (list.data ?? []).find((item) => item.id === org);
}

export function useSources() {
  return useQuery({ queryKey: ["connected", "sources"], queryFn: () => must(api.GET("/connected/sources")), staleTime: 30_000 });
}

/** Which domains have a configured source. The navigation shows a page only for these. */
export function useDomains(): Set<string> {
  const sources = useSources();
  const org = useOrg();
  // With an organization chosen, only its sources count.
  return new Set((sources.data ?? []).filter((source) => !org || org.sources.includes(source.name)).map((source) => source.domain));
}

/** A list of cached items, narrowed to the organization chosen in the menu bar. */
export function useItems(path: ListPath, query: ListQuery = {}, enabled = true) {
  const org = useOrg()?.id;
  const full = path === "/inbox" || !org ? query : { ...query, org };
  return useQuery({
    queryKey: ["connected", path, full, org ?? ""],
    enabled,
    queryFn: async () => {
      const page = await must(api.GET(path, { params: { query: full as never } }));
      // The inbox has no org filter, so it filters here.
      return org && path === "/inbox" ? { ...page, items: page.items.filter((item) => item.org === org) } : page;
    },
  });
}

/** Key numbers for the chosen organization, the first currency first. */
export function useNumbers(months = 12) {
  const org = useOrg()?.id;
  return useQuery({
    queryKey: ["connected", "numbers", org ?? "", months],
    queryFn: () => must(api.GET("/numbers", { params: { query: org ? { org, months } : { months } } })),
  });
}

/** An amount in its currency, without decimals from 1000 on. */
export function money(amount: number | null | undefined, currency?: string | null, cents = false) {
  if (amount == null || Number.isNaN(amount)) return "–";
  const code = currency && /^[A-Z]{3}$/.test(currency) && currency !== "XXX" ? currency : undefined;
  const digits = cents || Math.abs(amount) < 1000 ? 2 : 0;
  const locale = language() === "de" ? "de-DE" : "en-GB";
  return code
    ? new Intl.NumberFormat(locale, { style: "currency", currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount)
    : amount.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 386k, 1.2M: amounts in tight places. */
export function short(amount: number) {
  const value = Math.abs(amount);
  if (value >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(amount / 1000)}k`;
  return String(Math.round(amount));
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: ["connected", "item", id],
    enabled: !!id,
    queryFn: () => must(api.GET("/connected/items/{id}", { params: { path: { id: id! } } })),
  });
}

/** A field from an item's `data`, as text. */
export function field(item: Pick<Item, "data"> | undefined, key: string): string | undefined {
  const value = (item?.data as Record<string, unknown> | null | undefined)?.[key];
  if (value == null || value === "") return undefined;
  return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value);
}

export const has = (item: Pick<Item, "flags">, flag: string) => item.flags.includes(flag);

/**
 * Runs an action on an item or a source. The server answers 202 when the action needs an approval, and 200 when it ran
 * (a read or draft tool). The toast says which.
 */
export function useAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, source, action, input }: { item?: string; source?: string; action: string; input?: Record<string, unknown> }) => {
      const call = item
        ? api.POST("/connected/items/{id}/actions/{action}", { params: { path: { id: item, action } }, body: { input } })
        : api.POST("/connected/sources/{name}/actions/{action}", { params: { path: { name: source!, action } }, body: { input } });
      const { data, error, response } = await call;
      if (error !== undefined || !data) throw new Error((error as unknown as { error?: string } | undefined)?.error ?? t("error.server", { status: response.status }));
      return { result: data, waits: response.status === 202 };
    },
    onSuccess: ({ waits }) => {
      toast(waits ? t("connected.waitsForApproval") : t("connected.done"));
      void client.invalidateQueries({ queryKey: ["connected"] });
      void client.invalidateQueries({ queryKey: ["ready"] });
      void client.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
}

/** Hides an item until a time ("later"), or shows it again. Nothing changes in the service. */
export function useSnooze() {
  const client = useQueryClient();
  const done = (text: string) => {
    toast(text);
    void client.invalidateQueries({ queryKey: ["connected"] });
  };
  const fail = (error: Error) => toast(error.message, "bad");
  return {
    snooze: (ids: string[], until: Date) =>
      Promise.all(ids.map((id) => must(api.POST("/connected/items/{id}/snooze", { params: { path: { id } }, body: { until: until.toISOString() } }))))
        .then(() => done(t("connected.snoozed", { count: ids.length, time: dayTime(until.toISOString()) })), fail),
    unsnooze: (id: string) => must(api.DELETE("/connected/items/{id}/snooze", { params: { path: { id } } })).then(() => done(t("connected.unsnoozed")), fail),
  };
}

export const isSnoozed = (item: Pick<Item, "snoozed_until">, now = Date.now()) => !!item.snoozed_until && Date.parse(item.snoozed_until) > now;

export type Split = Schemas["Split"];

/** Saved filters of a domain, shown as tabs. */
export function useSplits(domain: Domain) {
  return useQuery({
    queryKey: ["connected", "splits"],
    queryFn: () => must(api.GET("/connected/splits")),
    select: (splits) => splits.filter((split) => !split.domain || split.domain === domain).sort((a, b) => a.position - b.position),
  });
}

export function useSplitItems(id: string | undefined) {
  return useQuery({
    queryKey: ["connected", "splits", id, "items"],
    enabled: !!id,
    queryFn: () => must(api.GET("/connected/splits/{id}/items", { params: { path: { id: id! }, query: { limit: 300 } } })),
  });
}

export function useSplitActions() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: ["connected", "splits"] });
  return {
    save: (id: string, body: Schemas["SplitInput"]) => must(api.PUT("/connected/splits/{id}", { params: { path: { id } }, body })).then((split) => (refresh(), split)),
    remove: (id: string) => must(api.DELETE("/connected/splits/{id}", { params: { path: { id } } })).then(refresh, (error: Error) => toast(error.message, "bad")),
  };
}

/** The same action on many items. Each writing call gets its own approval, decided together in Ready. */
export function useBulk() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: string[]; action: string; input?: Record<string, unknown> }) => must(api.POST("/connected/actions/bulk", { body: { ...body, input: body.input ?? {} } })),
    onSuccess: (outcomes) => {
      const failed = outcomes.filter((outcome) => outcome.error).length;
      const waiting = outcomes.filter((outcome) => outcome.result?.status === "proposed").length;
      toast(failed ? t("connected.bulkFailed", { failed, count: outcomes.length }) : waiting ? t("connected.bulkWaits", { count: waiting }) : t("connected.bulkDone", { count: outcomes.length }), failed ? "bad" : undefined);
      for (const key of ["connected", "ready", "approvals"]) void client.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
}

/** True when a source of this domain offers an action of that name. */
export function canDo(sources: Source[] | undefined, domain: Domain, action: string, source?: string) {
  return (sources ?? []).some((item) => item.domain === domain && (!source || item.name === source) && item.actions.includes(action));
}

/** How fresh the data of a domain is, with a button to refresh its sources now. */
export function Freshness({ domain }: { domain: Domain | "all" }) {
  const sources = useSources();
  const client = useQueryClient();
  const mine = (sources.data ?? []).filter((source) => domain === "all" || source.domain === domain);
  const refresh = useMutation({
    mutationFn: async () => {
      if (domain === "all") return must(api.POST("/connected/refresh"));
      return Promise.all(mine.map((source) => must(api.POST("/connected/sources/{name}/refresh", { params: { path: { name: source.name } } }))));
    },
    onSuccess: () => {
      toast(t("connected.refreshed"));
      void client.invalidateQueries({ queryKey: ["connected"] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
  if (!mine.length) return null;
  const last = mine.map((source) => source.status?.last_success_at).filter(Boolean).sort().at(0);
  const stale = mine.some((source) => source.stale);
  const failed = mine.find((source) => source.status?.last_error);
  const label = last ? t("connected.updated", { age: age(last) }) : t("connected.never");
  return (
    <span className="cn-fresh" title={failed?.status?.last_error ?? (last ? dayTime(last) : undefined)}>
      <i className={`dot ${failed ? "bad" : stale ? "warn" : "ok"}`} />
      <span className="tn">{failed ? t("connected.failed", { source: failed.name }) : label}</span>
      <Btn icon size="xs" variant="ghost" aria-label={t("connected.refresh")} title={t("connected.refresh")} disabled={refresh.isPending} onClick={() => refresh.mutate()}>
        <RefreshCw className={refresh.isPending ? "spin" : ""} />
      </Btn>
    </span>
  );
}

/** What to do when a domain has no source: add one to the server configuration. */
export function NoSource({ domain }: { domain: Domain }) {
  return (
    <Empty
      icon={<Plug />}
      title={t(`connected.none.${domain}`)}
      sub={t("connected.howTo", { domain })}
      action={<Btn size="sm" onClick={() => go("connections")}>{t("nav.connections")}</Btn>}
    />
  );
}

/** "Jane Doe <jane@example.com>" as Jane Doe. */
export function personName(author: string | null | undefined) {
  if (!author) return "";
  const match = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(author);
  return (match ? match[1]! : author).trim();
}

/** A connected item in the inspector: who, when, its text and its latest messages, with a link to the service. */
export function ItemInspector({ id }: { id: string }) {
  const detail = useItem(id);
  const item = detail.data?.item;
  if (!item) return <InspectorPanel kind={t("connected.item")} title="…">{detail.isPending ? <Skeleton count={3} /> : <Empty title={t("connected.gone")} />}</InspectorPanel>;
  const messages = (detail.data?.children ?? []).filter((child) => child.kind === "message").slice(-3);
  return (
    <InspectorPanel
      kind={t(`connected.domain.${item.domain as "mail"}`)}
      icon={<ServiceIcon name={brandOf(item.source) ?? item.source} size={16} fallback={item.source} />}
      title={item.title ?? item.external_id}
      facts={[
        ...(item.author ? [[t("connected.from"), personName(item.author)] as [string, string]] : []),
        ...(item.occurred_at ? [[t("connected.when"), dayTime(item.occurred_at)] as [string, string]] : []),
        ...(item.state ? [[t("connected.state"), item.state] as [string, string]] : []),
      ]}
      actions={item.url ? <Btn onClick={() => openItem(item)}><ExternalLink />{t("connected.openIn")}</Btn> : undefined}
    >
      {(messages.length ? messages : [item]).map((message) => (
        <div key={message.id} className="insp-msg">
          {messages.length > 0 && <b>{personName(message.author) || message.source}</b>}
          <Markdown source={field(message, "body") ?? field(message, "text") ?? message.summary ?? ""} />
        </div>
      ))}
    </InspectorPanel>
  );
}

/** Opens an item in its service, when it has a link. */
export function openItem(item: Pick<Item, "url">) {
  if (item.url) openExternal(item.url);
}

/** The page that shows items of a domain. */
export const viewOfDomain = (domain: string): "mail" | "calendar" | "issues" | "code" =>
  domain === "mail" ? "mail" : domain === "calendar" ? "calendar" : domain === "issues" ? "issues" : "code";
