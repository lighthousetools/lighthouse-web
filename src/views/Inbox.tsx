import { ArrowRight, Check, ExternalLink, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { dayTime } from "../format";
import { t, useLanguage } from "../i18n";
import { go } from "../router";
import { Badge, Btn, Empty, Failure, Seg, ServiceIcon, Skeleton, type Tone } from "../ui";
import { Freshness, NoSource, has, openItem, useItems, useSources, viewOfDomain, type Item } from "./connected";
import { age } from "./Ready";
import "./inbox.css";

type Filter = "all" | "mail" | "calendar" | "issues" | "code";
const GROUPS = ["review", "assigned", "mention", "mail", "other"] as const;
type Group = (typeof GROUPS)[number];

/** Why an item is in the inbox, by its strongest flag. */
export function groupOfItem(item: Pick<Item, "flags" | "domain">): Group {
  if (has(item, "review_requested") || has(item, "failed")) return "review";
  if (has(item, "assigned")) return "assigned";
  if (has(item, "mention")) return "mention";
  if (item.domain === "mail") return "mail";
  return "other";
}

function tagOf(item: Item): { label: string; tone: Tone } {
  if (has(item, "review_requested")) return { label: t("inbox.tag.review"), tone: "warn" };
  if (has(item, "failed")) return { label: t("inbox.tag.failed"), tone: "bad" };
  if (has(item, "assigned")) return { label: t("inbox.tag.assigned"), tone: "info" };
  if (has(item, "mention")) return { label: t("inbox.tag.mention"), tone: "vio" };
  if (has(item, "important")) return { label: t("inbox.tag.important"), tone: "warn" };
  if (has(item, "unread")) return { label: t("inbox.tag.unread"), tone: "" };
  return { label: item.kind, tone: "" };
}

export function Inbox() {
  useLanguage();
  const sources = useSources();
  const inbox = useItems("/inbox", { limit: 200 }, (sources.data ?? []).length > 0);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const items = inbox.data?.items ?? [];
  const shown = items.filter((item) => filter === "all" || item.domain === filter);
  const current = shown.find((item) => item.id === selected) ?? shown[0];
  const open = (item: Item) => go(viewOfDomain(item.domain), item.id);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea") || event.metaKey || event.ctrlKey || event.altKey || document.querySelector(".palbg, .modalbg")) return;
      const index = current ? shown.indexOf(current) : -1;
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        setSelected(shown[Math.min(shown.length - 1, index + 1)]?.id ?? null);
      }
      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        setSelected(shown[Math.max(0, index - 1)]?.id ?? null);
      }
      if (event.key === "Enter" && current && (event.target as HTMLElement).tagName !== "BUTTON") open(current);
      if (event.key.toLowerCase() === "o" && current) openItem(current);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  const count = (value: Filter) => items.filter((item) => value === "all" || item.domain === value).length;
  const options = (["all", "mail", "calendar", "issues", "code"] as Filter[])
    .filter((value) => value === "all" || count(value) > 0 || value === filter)
    .map((value) => [value, value === "all" ? t("approvals.filterAll") : t(`connected.domain.${value}`), count(value)] as [Filter, string, number]);
  if (!sources.isPending && (sources.data ?? []).length === 0) {
    return <div className="page"><NoSource domain="mail" /></div>;
  }
  return (
    <div className="page flush">
      <div className="ibx">
        <div className="ib-m">
          <header className="ib-h">
            <div className="grow">
              <h1>{t("nav.inbox")}</h1>
              <p>{items.length ? t("inbox.lead", { count: items.length }) : t("inbox.leadNone")}</p>
            </div>
            <Freshness domain="all" />
          </header>
          <div className="ib-f"><Seg<Filter> label={t("inbox.filter")} value={filter} onChange={setFilter} options={options} /></div>
          <Failure error={inbox.error} />
          {inbox.isPending ? (
            <Skeleton count={6} height={52} />
          ) : shown.length === 0 ? (
            items.length ? (
              <Empty icon={<Check size={20} />} title={t("approvals.nothingHere")} action={<Btn size="sm" onClick={() => setFilter("all")}>{t("connections.showAll")}</Btn>} />
            ) : (
              <div className="ib-zero">
                <Sparkles size={24} className="warnc" />
                <b>{t("inbox.zero")}</b>
                <span>{t("inbox.zeroHint")}</span>
                <Btn size="sm" onClick={() => go("brief")}>{t("nav.brief")}</Btn>
              </div>
            )
          ) : (
            <div className="ib-l">
              {GROUPS.map((group) => {
                const list = shown.filter((item) => groupOfItem(item) === group);
                if (!list.length) return null;
                return (
                  <section key={group}>
                    <div className={`ib-g ${group === "review" ? "fire" : ""}`}>{t(`inbox.group.${group}`)}<em>{list.length}</em></div>
                    {list.map((item) => {
                      const tag = tagOf(item);
                      return (
                        <div key={item.id} data-it={item.id} className={`ib-r ${current?.id === item.id ? "on" : ""}`} onClick={() => setSelected(item.id)} onDoubleClick={() => open(item)}>
                          <ServiceIcon name={item.source} fallback={item.source} size={24} />
                          <span className="grow tx">
                            <span className="t clip">{item.title ?? item.external_id}</span>
                            <span className="s clip">{[item.author, item.summary].filter(Boolean).join(" · ") || item.source}</span>
                          </span>
                          <span className="am tn">{age(item.occurred_at ?? item.synced_at)}</span>
                          <Badge tone={tag.tone}>{tag.label}</Badge>
                          <span className="ac">
                            {item.url && <Btn size="xs" variant="ghost" onClick={() => openItem(item)}><ExternalLink />{t("connected.openIn")}</Btn>}
                            <Btn size="xs" variant={current?.id === item.id ? "primary" : ""} onClick={() => open(item)}>{t("inbox.open")}<ArrowRight /></Btn>
                          </span>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          )}
        </div>
        <aside className="ib-a" aria-label={t("inbox.sources")}>
          <div className="ib-ah">
            <span className="n tn">{items.length}</span>
            <h2>{t("inbox.waiting")}</h2>
            <p>{t("inbox.asideHint")}</p>
          </div>
          {(sources.data ?? []).map((source) => (
            <div key={source.name} className={`ib-d ${source.status?.last_error ? "" : "mine"}`} title={source.status?.last_error ?? undefined}>
              <ServiceIcon name={source.connector} fallback={source.name} size={14} />
              <span className="grow">
                {source.name} · {t(`connected.domain.${source.domain as "mail"}`)}
                <br />
                <span className="faint">
                  {source.status?.last_error ? t("connected.failed", { source: source.name }) : source.status?.last_success_at ? t("connected.updated", { age: age(source.status.last_success_at) }) : t("connected.never")}
                  {source.status ? ` · ${t("inbox.items", { count: source.status.items })}` : ""}
                </span>
              </span>
            </div>
          ))}
          {current && <p className="ib-d"><span className="grow">{dayTime(current.occurred_at ?? current.synced_at)}</span></p>}
          <div className="ib-keys">
            <span><kbd>↑</kbd><kbd>↓</kbd> {t("palette.choose")}</span>
            <span><kbd>↵</kbd> {t("palette.open")}</span>
            <span><kbd>O</kbd> {t("connected.openIn")}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
