import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { shortDate } from "../format";
import { t, useLanguage } from "../i18n";
import { Empty, Failure, Skeleton, Spark, Tabs } from "../ui";
import { Freshness, NoSource, field, money, openItem, useDomains, useItems, useNumbers, useSources, type Item } from "./connected";
import "./stocks.css";

type Tab = "overview" | "list" | "reports";

const symbolOf = (item: Item) => field(item, "symbol") ?? field(item, "ticker") ?? item.external_id;
const changeOf = (item: Item) => {
  const value = Number(field(item, "change_pct") ?? field(item, "change_percent") ?? NaN);
  return Number.isNaN(value) ? null : value;
};

/** Prices of one holding, oldest first, from the quotes that name it. */
export function quotesFor(holding: Pick<Item, "id" | "external_id">, quotes: Item[]) {
  return quotes
    .filter((quote) => quote.parent_id === holding.id || quote.parent_id === holding.external_id || field(quote, "symbol") === holding.external_id)
    .filter((quote) => quote.amount != null)
    .sort((a, b) => (a.occurred_at ?? "").localeCompare(b.occurred_at ?? ""))
    .map((quote) => quote.amount!);
}

export function Stocks() {
  useLanguage();
  const domains = useDomains();
  const sources = useSources();
  const numbers = useNumbers();
  const holdings = useItems("/holdings", { limit: 200 }, domains.has("holdings"));
  const quotes = useItems("/holdings/quotes", { limit: 1000 }, domains.has("holdings"));
  const [tab, setTab] = useState<Tab>("overview");
  const list = useMemo(() => (holdings.data?.items ?? []).filter((item) => item.kind === "holding"), [holdings.data]);
  const quoteList = quotes.data?.items ?? [];
  const first = numbers.data?.currencies.find((item) => item.holdings) ?? numbers.data?.currencies[0];
  const currency = first?.currency ?? list[0]?.currency;
  const total = first?.holdings ?? list.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const withChange = list.filter((item) => changeOf(item) != null).sort((a, b) => changeOf(b)! - changeOf(a)!);
  const reports = list
    .map((item) => ({ item, date: field(item, "next_report") ?? field(item, "earnings_date") }))
    .filter((entry): entry is { item: Item; date: string } => !!entry.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!sources.isPending && !domains.has("holdings")) return <div className="page"><NoSource domain="holdings" /></div>;
  return (
    <div className="page">
      <div className="stox-sb">
        <header className="ph">
          <div className="grow">
            <h1>{t("nav.stocks")}</h1>
            <p>{t("stocks.lead")}</p>
          </div>
          <div className="acts"><Freshness domain="holdings" /></div>
        </header>
        <Tabs<Tab> value={tab} onChange={setTab} options={[["overview", t("stocks.overview")], ["list", t("stocks.list")], ["reports", t("stocks.reports")]]} />
        <Failure error={holdings.error} />
        {holdings.isPending ? (
          <Skeleton count={4} height={90} />
        ) : list.length === 0 ? (
          <div className="card"><Empty title={t("stocks.empty")} sub={t("stocks.emptyHint")} /></div>
        ) : tab === "overview" ? (
          <>
            <div className="sst">
              <div className="card"><span>{t("stocks.value")}</span><b className="tn">{money(total, currency)}</b></div>
              <div className="card"><span>{t("stocks.positions")}</span><b className="tn">{list.length}</b></div>
              <div className="card"><span>{t("stocks.best")}</span><b className="clip">{withChange[0] ? symbolOf(withChange[0]) : "–"}</b>{withChange[0] && <small className="up tn">+{changeOf(withChange[0])!.toFixed(1)} %</small>}</div>
              <div className="card"><span>{t("stocks.nextReport")}</span><b className="clip">{reports[0] ? symbolOf(reports[0].item) : "–"}</b>{reports[0] && <small className="faint">{shortDate(reports[0].date)}</small>}</div>
            </div>
            <div className="scols">
              <div>
                <div className="sh">{t("stocks.inPortfolio")}<small>{list.length}</small></div>
                <div className="shold">
                  {list.map((item) => {
                    const change = changeOf(item);
                    const series = quotesFor(item, quoteList);
                    const price = Number(field(item, "price") ?? NaN);
                    return (
                      <div key={item.id} className="card sh1" role={item.url ? "button" : undefined} onClick={() => openItem(item)}>
                        <div className="a">
                          <span style={{ minWidth: 0 }}><b>{symbolOf(item)}</b><small className="faint clip" style={{ display: "block", fontSize: 12 }}>{item.title}</small></span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 15 }} className="tn">
                          {Number.isNaN(price) ? money(item.amount, item.currency) : money(price, field(item, "price_currency") ?? item.currency, true)}
                          {change != null && <span className={change >= 0 ? "up" : "down"} style={{ fontSize: 12, marginLeft: 6 }}>{change >= 0 ? "+" : ""}{change.toFixed(1)} %</span>}
                        </div>
                        {series.length > 1 && <div style={{ margin: "8px -12px 0" }}><Spark data={series} height={34} color={change != null && change < 0 ? "var(--bad)" : "var(--chart)"} /></div>}
                        <div className="faint tn" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}>
                          <span>{field(item, "quantity") ? t("stocks.quantity", { count: field(item, "quantity")! }) : ""}</span>
                          <span>{money(item.amount, item.currency)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="sside">
                <div className="card">
                  <div className="ch">{t("stocks.reports")}</div>
                  <div className="sup">
                    {reports.slice(0, 6).map(({ item, date }) => (
                      <div key={item.id} className="sur"><span className="ftag mono">{symbolOf(item)}</span><span className="grow clip">{item.title}</span><span className="faint tn">{shortDate(date)}</span></div>
                    ))}
                    {reports.length === 0 && <p className="faint" style={{ padding: 12, fontSize: 13 }}>{t("stocks.noReports")}</p>}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : tab === "list" ? (
          <div className="card swrap">
            <table className="table stab">
              <thead><tr><th>{t("stocks.symbol")}</th><th>{t("stocks.name")}</th><th className="r">{t("stocks.price")}</th><th className="r">{t("stocks.change")}</th><th className="r">{t("stocks.value")}</th><th /></tr></thead>
              <tbody>
                {list.map((item) => {
                  const change = changeOf(item);
                  return (
                    <tr key={item.id}>
                      <td className="mono">{symbolOf(item)}</td>
                      <td>{item.title}</td>
                      <td className="r">{field(item, "price") ?? "–"}</td>
                      <td className={`r ${change != null ? (change >= 0 ? "up" : "down") : ""}`}>{change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(1)} %` : "–"}</td>
                      <td className="r">{money(item.amount, item.currency)}</td>
                      <td className="r">{item.url && <button type="button" aria-label={t("connected.openIn")} onClick={() => openItem(item)}><ExternalLink size={13} className="faint" /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card">
            <div className="sup">
              {reports.map(({ item, date }) => (
                <div key={item.id} className="sur"><span className="ftag mono">{symbolOf(item)}</span><span className="grow clip">{item.title}</span><span className="faint tn">{shortDate(date)}</span></div>
              ))}
              {reports.length === 0 && <p className="faint" style={{ padding: 12, fontSize: 13 }}>{t("stocks.noReports")}</p>}
            </div>
          </div>
        )}
        <p className="faint" style={{ fontSize: 12, marginTop: 16 }}>{t("stocks.disclaimer")}</p>
      </div>
    </div>
  );
}
