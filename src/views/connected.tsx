import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug, RefreshCw } from "lucide-react";
import { api, must, type Schemas } from "../api/client";
import { dayTime } from "../format";
import { t } from "../i18n";
import { go } from "../router";
import { openExternal } from "../shell/bridge";
import { toast } from "../shell/state";
import { Btn, Empty } from "../ui";
import { age } from "./Ready";

export type Item = Schemas["SyncedItem"];
export type Source = Schemas["SourceInfo"];
export type Domain = "mail" | "calendar" | "issues" | "code";
type ListQuery = { q?: string; source?: string; state?: string; flags?: string; open?: boolean; from?: string; to?: string; limit?: number; offset?: number };
type ListPath = "/inbox" | "/mail/threads" | "/calendar/events" | "/issues" | "/issues/projects" | "/issues/cycles" | "/pulls" | "/connected/search";

export function useSources() {
  return useQuery({ queryKey: ["connected", "sources"], queryFn: () => must(api.GET("/connected/sources")), staleTime: 30_000 });
}

/** Which domains have a configured source. The navigation shows a page only for these. */
export function useDomains(): Set<string> {
  const sources = useSources();
  return new Set((sources.data ?? []).map((source) => source.domain));
}

export function useItems(path: ListPath, query: ListQuery = {}, enabled = true) {
  return useQuery({
    queryKey: ["connected", path, query],
    enabled,
    queryFn: () => must(api.GET(path, { params: { query: query as never } })),
  });
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

/** Opens an item in its service, when it has a link. */
export function openItem(item: Pick<Item, "url">) {
  if (item.url) openExternal(item.url);
}

/** The page that shows items of a domain. */
export const viewOfDomain = (domain: string): "mail" | "calendar" | "issues" | "code" =>
  domain === "mail" ? "mail" : domain === "calendar" ? "calendar" : domain === "issues" ? "issues" : "code";
