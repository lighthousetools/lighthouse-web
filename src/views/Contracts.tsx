import { ExternalLink, FileText, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { dateTime, shortDate } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { Badge, Btn, Card, Empty, Failure, Seg, ServiceIcon, Skeleton, type Tone } from "../ui";
import { Markdown } from "../ui/markdown";
import { Freshness, NoSource, field, has, openItem, useAction, useDomains, useItem, useItems, useSources, type Item } from "./connected";
import "./contracts.css";

const STEPS = ["created", "sent", "opened", "signed"] as const;
type Step = (typeof STEPS)[number];

/** How far a contract got on its way to a signature, from its state text. */
export function contractStep(state: string | null | undefined): number {
  const value = (state ?? "").toLowerCase();
  if (/sign|unterschr|complet|executed/.test(value)) return 3;
  if (/open|view|gelesen|geöffnet/.test(value)) return 2;
  if (/sent|send|versend|await|pending/.test(value)) return 1;
  return 0;
}

const TONES: Tone[] = ["", "info", "info", "ok"];
const needsMe = (item: Item) => has(item, "mine") || has(item, "assigned") || /me|you|owner/i.test(field(item, "waiting_for") ?? "");

function Detail({ id }: { id: string }) {
  const detail = useItem(id);
  const sources = useSources();
  const action = useAction();
  if (!detail.data) return <div className="cdet">{detail.isPending ? <Skeleton count={5} /> : <Failure error={detail.error} />}</div>;
  const item = detail.data.item;
  const step = contractStep(item.state);
  const actions = ((sources.data ?? []).find((source) => source.name === item.source)?.actions ?? []).filter((name) => ["send", "remind", "sign", "update"].includes(name));
  const body = field(item, "body") ?? field(item, "content") ?? item.summary ?? "";
  const trail = [...detail.data.children].sort((a, b) => (b.occurred_at ?? "").localeCompare(a.occurred_at ?? ""));
  return (
    <div className="cdet" key={item.id}>
      <div className="cdh">
        <ServiceIcon name={item.source} fallback={item.source} size={32} />
        <div className="grow">
          <h2>{item.title}</h2>
          <p>{[field(item, "template"), item.assignee].filter(Boolean).join(" · ") || item.source}</p>
        </div>
        {has(item, "expiring") && <Badge tone="warn">{t("contracts.expiring")}</Badge>}
        <Badge tone={TONES[step]}>{item.state ?? t(`contracts.step.${STEPS[step]!}`)}</Badge>
      </div>
      <Card pad>
        <div className="dps" style={{ marginBottom: 10 }}>
          {STEPS.map((name: Step, index) => (
            <div key={name} className={index < step ? "past" : index === step ? "on" : ""} style={{ flex: 1, display: "grid", gap: 4, fontSize: 12 }}>
              <i style={{ display: "block", height: 4, borderRadius: 2, background: index <= step ? (index === step ? "var(--warn)" : "var(--ok)") : "var(--surface2)" }} />
              <span className={index <= step ? "" : "faint"}>{t(`contracts.step.${name}`)}</span>
            </div>
          ))}
        </div>
        <div className="cact" style={{ display: "flex", gap: 8 }}>
          {actions.map((name) => (
            <Btn key={name} variant={name === "sign" ? "primary" : ""} disabled={action.isPending} onClick={() => action.mutate({ item: item.id, action: name })}>{t(`contracts.action.${name as "send"}`)}</Btn>
          ))}
          {item.url && <Btn variant="ghost" onClick={() => openItem(item)}><ExternalLink />{t("connected.openIn")}</Btn>}
          {item.ends_at && <span className="faint" style={{ marginLeft: "auto", fontSize: 12, alignSelf: "center" }}>{t("contracts.expires", { date: shortDate(item.ends_at) })}</span>}
        </div>
        {actions.length > 0 && <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>{t("contracts.hint")}</p>}
      </Card>
      <div className="cdc">
        <div className="cpaper">
          <h3>{item.title}</h3>
          {body ? <Markdown source={body} /> : <p className="faint">{t("contracts.noText")}</p>}
        </div>
        <Card title={t("contracts.trail")} hint={trail.length}>
          <div className="caud">
            {trail.map((entry) => (
              <div key={entry.id} style={{ display: "flex", gap: 8, padding: "8px 0", fontSize: 13 }}>
                <i className="dot ok" style={{ marginTop: 6 }} />
                <div className="grow">
                  <div>{entry.title}</div>
                  {entry.summary && <div className="faint" style={{ fontSize: 12 }}>{entry.summary}</div>}
                </div>
                <span className="faint tn" style={{ fontSize: 12 }}>{entry.occurred_at ? dateTime(entry.occurred_at) : ""}</span>
              </div>
            ))}
            {trail.length === 0 && <p className="faint" style={{ fontSize: 12, padding: "8px 0" }}>{t("contracts.noTrail")}</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function Contracts() {
  useLanguage();
  const route = useRoute();
  const domains = useDomains();
  const sources = useSources();
  const contracts = useItems("/contracts", { limit: 300, open: false }, domains.has("documents"));
  const [filter, setFilter] = useState<"all" | "open" | "signed" | "expiring">("all");
  const [query, setQuery] = useState("");
  const all = useMemo(() => contracts.data?.items ?? [], [contracts.data]);
  const needle = query.trim().toLowerCase();
  const shown = all.filter(
    (item) =>
      (filter === "all" || (filter === "signed" ? contractStep(item.state) === 3 : filter === "expiring" ? has(item, "expiring") : contractStep(item.state) < 3)) &&
      (!needle || `${item.title} ${item.assignee ?? ""}`.toLowerCase().includes(needle)),
  );
  const current = shown.find((item) => item.id === route.param) ?? shown[0];
  const mine = all.filter((item) => needsMe(item) && contractStep(item.state) < 3);
  if (!sources.isPending && !domains.has("documents")) return <div className="page"><NoSource domain="documents" /></div>;
  return (
    <div className="page flush">
      <div className="cb">
        <header className="ph">
          <div className="grow">
            <h1>{t("nav.contracts")}</h1>
            <p>{t("contracts.lead")}</p>
          </div>
          <div className="acts"><Freshness domain="documents" /></div>
        </header>
        <div className="cbar">
          <Seg
            label={t("contracts.filter")}
            value={filter}
            onChange={setFilter}
            options={[["all", t("approvals.filterAll"), all.length], ["open", t("contracts.open")], ["signed", t("contracts.step.signed")], ["expiring", t("contracts.expiring"), all.filter((item) => has(item, "expiring")).length]]}
          />
          <span className="grow" />
          <div className="bz-cs"><label className="field"><Search /><input aria-label={t("ui.search")} placeholder={t("ui.search")} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        </div>
        <Failure error={contracts.error} />
        {contracts.isPending ? (
          <Skeleton count={5} height={60} />
        ) : all.length === 0 ? (
          <div className="card"><Empty icon={<FileText />} title={t("contracts.empty")} sub={t("contracts.emptyHint")} /></div>
        ) : (
          <div className="cg">
            <div className="bz-cl">
              {mine.length > 0 && <div className="cmine"><ShieldAlert size={14} className="warnc" />{t("contracts.yourTurn", { count: mine.length })}</div>}
              {shown.map((item) => {
                const step = contractStep(item.state);
                return (
                  <button type="button" key={item.id} className={`cli ${item.id === current?.id ? "on" : ""}`} onClick={() => go("contracts", item.id)}>
                    <span className="a clip">{item.title}</span>
                    <span className="b"><span className="grow clip">{item.assignee ?? item.source}</span><Badge tone={has(item, "expiring") ? "warn" : TONES[step]}>{has(item, "expiring") ? t("contracts.expiring") : item.state ?? t(`contracts.step.${STEPS[step]!}`)}</Badge></span>
                    <span className="pg">{STEPS.map((name, index) => <i key={name} style={{ flex: 1, height: 3, borderRadius: 2, background: index <= step ? "var(--chart)" : "var(--surface2)" }} />)}</span>
                  </button>
                );
              })}
              {shown.length === 0 && <p className="faint" style={{ padding: 12, fontSize: 13 }}>{t("palette.empty")}</p>}
            </div>
            {current ? <Detail key={current.id} id={current.id} /> : <Empty title={t("contracts.pick")} />}
          </div>
        )}
      </div>
    </div>
  );
}
