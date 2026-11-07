import { ExternalLink, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { shortDate } from "../format";
import { t, useLanguage } from "../i18n";
import { useRoute } from "../router";
import { InspectorPanel } from "../shell/Inspector";
import { inspect } from "../shell/state";
import { Badge, Btn, Card, Empty, Failure, Seg, Skeleton, type Tone } from "../ui";
import { Freshness, NoSource, field, has, money, openItem, useAction, useDomains, useItems, useNumbers, useSources, type Item } from "./connected";
import "./invoices.css";

type Side = "out" | "in";

/** The state of an invoice as the apps show it. Overdue wins over open. */
export function invoiceState(item: Pick<Item, "state" | "flags">): "overdue" | "draft" | "paid" | "void" | "open" {
  if (item.flags.includes("overdue")) return "overdue";
  const state = (item.state ?? "").toLowerCase();
  if (state.includes("draft") || state.includes("entwurf")) return "draft";
  if (state.includes("paid") || state.includes("bezahlt")) return "paid";
  if (state.includes("void") || state.includes("cancel") || state.includes("storn")) return "void";
  return "open";
}

const TONE: Record<ReturnType<typeof invoiceState>, Tone> = { overdue: "bad", draft: "warn", paid: "ok", void: "", open: "info" };
const number = (item: Item) => field(item, "number") ?? item.title ?? item.external_id;
const party = (item: Item) => item.author ?? field(item, "customer") ?? field(item, "counterparty") ?? item.summary ?? "–";
const daysLate = (item: Item) => (item.ends_at ? Math.max(0, Math.round((Date.now() - Date.parse(item.ends_at)) / 86_400_000)) : 0);

/** The actions of invoices, except reading ones, in a fixed order. */
const ACTIONS = ["remind", "send", "finalize", "pay", "update"];

function InvoicePanel({ item }: { item: Item }) {
  const sources = useSources();
  const action = useAction();
  const available = (sources.data ?? []).find((source) => source.name === item.source)?.actions ?? [];
  const state = invoiceState(item);
  return (
    <InspectorPanel
      kind={has(item, "payable") ? t("invoices.in") : t("invoices.out")}
      title={number(item)}
      facts={[
        [t("invoices.party"), party(item)],
        [t("invoices.state"), <Badge key="s" tone={TONE[state]}>{t(`invoices.state.${state}`)}</Badge>],
        [t("invoices.amount"), money(item.amount, item.currency, true)],
        [t("invoices.due"), item.ends_at ? shortDate(item.ends_at) : "–"],
        [t("invoices.issued"), item.starts_at || item.occurred_at ? shortDate((item.starts_at ?? item.occurred_at)!) : "–"],
        ...(field(item, "einvoice") ? [[t("invoices.einvoice"), field(item, "einvoice")!] as [string, string]] : []),
      ]}
      actions={
        <>
          {ACTIONS.filter((name) => available.includes(name)).map((name) => (
            <Btn key={name} disabled={action.isPending} onClick={() => action.mutate({ item: item.id, action: name })}>{t(`invoices.action.${name as "send"}`)}</Btn>
          ))}
          {item.url && <Btn variant="ghost" onClick={() => openItem(item)}><ExternalLink />{t("connected.openIn")}</Btn>}
        </>
      }
    >
      <p className="faint" style={{ fontSize: 12 }}>{t("invoices.actionHint")}</p>
    </InspectorPanel>
  );
}

export function Invoices() {
  useLanguage();
  const route = useRoute();
  const domains = useDomains();
  const sources = useSources();
  const numbers = useNumbers();
  const invoices = useItems("/invoices", { limit: 500, open: false }, domains.has("invoices"));
  const [side, setSide] = useState<Side>("out");
  const [filter, setFilter] = useState<"all" | ReturnType<typeof invoiceState>>("all");
  const [query, setQuery] = useState("");
  const all = useMemo(() => (invoices.data?.items ?? []).filter((item) => item.kind === "invoice"), [invoices.data]);
  const mine = all.filter((item) => (side === "in" ? has(item, "payable") : !has(item, "payable")));
  const needle = query.trim().toLowerCase();
  const shown = mine.filter((item) => (filter === "all" || invoiceState(item) === filter) && (!needle || `${number(item)} ${party(item)}`.toLowerCase().includes(needle)));
  const first = numbers.data?.currencies[0];
  const currency = first?.currency ?? all.find((item) => item.currency)?.currency;
  const attention = mine.filter((item) => ["overdue", "draft"].includes(invoiceState(item))).sort((a, b) => daysLate(b) - daysLate(a));
  useEffect(() => {
    const item = all.find((entry) => entry.id === route.param);
    if (item) inspect(`invoice:${item.id}`, <InvoicePanel item={item} />);
  }, [route.param, all.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sources.isPending && !domains.has("invoices")) return <div className="page"><NoSource domain="invoices" /></div>;
  const states = ["draft", "open", "overdue", "paid"] as const;
  const count = (state: (typeof states)[number]) => mine.filter((item) => invoiceState(item) === state).length;
  return (
    <div className="page">
      <div className="inb">
        <header className="ph">
          <div className="grow">
            <h1>{t("nav.invoices")}</h1>
            <p>{t("invoices.lead")}</p>
          </div>
          <div className="acts">
            <Freshness domain="invoices" />
            <Seg<Side> label={t("invoices.side")} value={side} onChange={setSide} options={[["out", t("invoices.out"), all.filter((item) => !has(item, "payable")).length], ["in", t("invoices.in"), all.filter((item) => has(item, "payable")).length]]} />
          </div>
        </header>
        <Failure error={invoices.error} />
        <div className="ist">
          <div className="card"><span>{t("numbers.receivables")}</span><b className="tn">{money(first?.receivables_open, currency)}</b></div>
          <div className="card"><span>{t("invoices.overdueSum")}</span><b className="tn" style={{ color: first?.receivables_overdue ? "var(--bad)" : undefined }}>{money(first?.receivables_overdue, currency)}</b></div>
          <div className="card"><span>{t("invoices.overdueCount")}</span><b className="tn" style={{ color: first?.invoices_overdue ? "var(--warn)" : undefined }}>{first?.invoices_overdue ?? 0}</b></div>
          <div className="card"><span>{t("numbers.payables")}</span><b className="tn">{money(first?.payables_open, currency)}</b></div>
          <div className="card"><span>{t("numbers.cash")}</span><b className="tn">{money(first?.cash, currency)}</b></div>
        </div>
        {attention.length > 0 && (
          <Card title={t("today.needsYou")} hint={attention.length} style={{ marginBottom: 12 }}>
            <div className="itasks">
              {attention.slice(0, 8).map((item) => {
                const state = invoiceState(item);
                return (
                  <div key={item.id} className="itask" onClick={() => inspect(`invoice:${item.id}`, <InvoicePanel item={item} />)}>
                    <i className={`dot ${state === "overdue" ? "bad" : "warn"}`} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="clip" style={{ display: "block" }}>{party(item)}</span>
                      <span className="st clip" style={{ display: "block" }}>{number(item)} · {state === "overdue" ? t("invoices.lateDays", { count: daysLate(item) }) : t("invoices.state.draft")}</span>
                    </span>
                    <span className="am tn">{money(item.amount, item.currency)}</span>
                    <Btn size="sm">{t("invoices.look")}</Btn>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        <div className="ibar" style={{ marginBottom: 12 }}>
          <Seg
            label={t("invoices.state")}
            value={filter}
            onChange={setFilter}
            options={[["all", t("approvals.filterAll"), mine.length], ...states.map((state) => [state, t(`invoices.state.${state}`), count(state)] as [typeof state, string, number])]}
          />
          <span className="grow" />
          <div className="is"><label className="field"><Search /><input aria-label={t("ui.search")} placeholder={t("invoices.search")} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        </div>
        {invoices.isPending ? (
          <Skeleton count={6} height={40} />
        ) : shown.length === 0 ? (
          <div className="card"><Empty title={mine.length ? t("palette.empty") : t("invoices.empty")} sub={mine.length ? undefined : t("invoices.emptyHint")} /></div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="table itable">
              <thead><tr><th>{t("invoices.number")}</th><th>{t("invoices.party")}</th><th>{t("invoices.state")}</th><th>{t("invoices.due")}</th><th className="r">{t("invoices.amount")}</th></tr></thead>
              <tbody>
                {shown.map((item) => {
                  const state = invoiceState(item);
                  return (
                    <tr key={item.id} className="click" onClick={() => inspect(`invoice:${item.id}`, <InvoicePanel item={item} />)}>
                      <td className="mono">{number(item)}</td>
                      <td>{party(item)}</td>
                      <td><Badge tone={TONE[state]}>{t(`invoices.state.${state}`)}</Badge></td>
                      <td className="muted tn">{item.ends_at ? shortDate(item.ends_at) : t("invoices.noDue")}</td>
                      <td className="r">{money(item.amount, item.currency, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
