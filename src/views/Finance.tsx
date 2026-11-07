import { useQuery } from "@tanstack/react-query";
import { api, must, type Schemas } from "../api/client";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { shortDate, weekdayShort } from "../format";
import { language, t, useLanguage } from "../i18n";
import { go } from "../router";
import { AreaChart, Badge, Btn, Card, Empty, Failure, Seg, ServiceIcon, Skeleton } from "../ui";
import { Freshness, NoSource, canDo, useOrg, field, has, money, useAction, useDomains, useItems, useNumbers, useOrganizations, useSources, type Item } from "./connected";
import "./finance.css";

type Flow = "all" | "in" | "out";

/**
 * Balance per day over the last `days`, walking back from today's balance through the transactions.
 * Without a balance it starts from zero, which still shows the shape.
 */
export function balanceHistory(balance: number, transactions: Pick<Item, "amount" | "occurred_at">[], days = 90, today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() + 86_400_000;
  const points: number[] = [];
  let running = balance;
  const sorted = [...transactions].filter((item) => item.occurred_at).sort((a, b) => b.occurred_at!.localeCompare(a.occurred_at!));
  let index = 0;
  for (let day = 0; day < days; day++) {
    const dayStart = end - (day + 1) * 86_400_000;
    points.unshift(running);
    while (index < sorted.length && Date.parse(sorted[index]!.occurred_at!) >= dayStart) {
      running -= sorted[index]!.amount ?? 0;
      index++;
    }
  }
  return points;
}

type Scenario = "base" | "pipeline";
type Month = Schemas["ForecastMonth"];

/** The forecast as daily points after today, month by month to each closing; without deals the pipeline is taken out. */
export function futureOf(months: Month[], historyDays: number, scenario: Scenario) {
  if (!months.length) return [];
  const step = Math.max(1, Math.round(historyDays / 4));
  let pipeline = 0;
  return months.flatMap((month) => {
    pipeline += month.pipeline_weighted;
    const closing = month.closing - (scenario === "base" ? pipeline : 0);
    const opening = month.opening - (scenario === "base" ? pipeline - month.pipeline_weighted : 0);
    return Array.from({ length: step }, (_, index) => opening + ((closing - opening) * (index + 1)) / step);
  });
}

const CATEGORIES = ["payroll", "rent", "taxes", "software", "travel", "insurance", "fees", "revenue", "income", "expense"];
export const categoryLabel = (category: string) => (CATEGORIES.includes(category) ? t(`finance.cat.${category as "rent"}`) : category);
const monthLabel = (period: string) => new Date(`${period.slice(0, 7)}-15T12:00:00`).toLocaleDateString(language() === "de" ? "de-DE" : "en-GB", { month: "short" });

export function Finance() {
  useLanguage();
  const domains = useDomains();
  const sources = useSources();
  const orgs = useOrganizations();
  const numbers = useNumbers();
  const action = useAction();
  const accounts = useItems("/bank/accounts", { limit: 100 }, domains.has("bank"));
  const transactions = useItems("/bank/transactions", { limit: 500 }, domains.has("bank"));
  const payables = useItems("/invoices", { flags: "payable", limit: 100 }, domains.has("invoices"));
  const [flow, setFlow] = useState<Flow>("all");
  const [scenario, setScenario] = useState<Scenario>("pipeline");
  const org = useOrg()?.id;
  const forecast = useQuery({
    queryKey: ["connected", "forecast", org ?? ""],
    enabled: domains.has("bank"),
    queryFn: () => must(api.GET("/bank/forecast", { params: { query: org ? { org, months: 3 } : { months: 3 } } })),
  });
  const [query, setQuery] = useState("");
  const accountList = (accounts.data?.items ?? []).filter((item) => item.kind === "account");
  const moves = useMemo(() => (transactions.data?.items ?? []).filter((item) => item.kind === "transaction"), [transactions.data]);
  const first = numbers.data?.currencies[0];
  const currency = first?.currency ?? accountList[0]?.currency;
  const cash = first?.cash ?? accountList.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const months = (forecast.data ?? []).find((entry) => entry.currency === currency)?.months ?? [];
  const history = balanceHistory(cash, moves.filter((item) => !item.currency || item.currency === currency), 120);
  const upcoming = (payables.data?.items ?? []).filter((item) => item.kind === "invoice" && item.state !== "paid").sort((a, b) => (a.ends_at ?? "9").localeCompare(b.ends_at ?? "9"));
  const needle = query.trim().toLowerCase();
  const shown = moves.filter(
    (item) => (flow === "all" || (flow === "in" ? (item.amount ?? 0) > 0 : (item.amount ?? 0) < 0)) && (!needle || `${item.title} ${item.summary ?? ""} ${field(item, "category") ?? ""}`.toLowerCase().includes(needle)),
  );
  const total = shown.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const accountName = (item: Item) => accountList.find((account) => account.external_id === item.parent_id || account.id === item.parent_id)?.title ?? item.source;
  const orgOf = (item: Item) => (orgs.data ?? []).find((org) => org.id === item.org);
  const locale = language() === "de" ? "de-DE" : "en-GB";
  if (!sources.isPending && !domains.has("bank")) return <div className="page"><NoSource domain="bank" /></div>;
  return (
    <div className="page">
      <div className="fnb">
        <header className="ph">
          <div className="grow">
            <h1>{t("nav.finance")}</h1>
            <p>{t("finance.lead")}</p>
          </div>
          <div className="acts"><Freshness domain="bank" /></div>
        </header>
        <Failure error={accounts.error ?? transactions.error} />
        <div className="fall">
          <div className="card ftot">
            <span>{t("finance.total")}</span>
            <b className="tn" style={{ font: "500 28px/36px var(--display)", letterSpacing: "-.5px", display: "block", marginTop: 4 }}>{money(cash, currency)}</b>
          </div>
          {accountList.slice(0, 3).map((account) => (
            <div key={account.id} className="card">
              <span><ServiceIcon name={account.source} fallback={account.source} size={14} /><span className="clip">{account.title}</span>{orgOf(account) && <i className="dot" style={{ background: orgOf(account)!.color ?? undefined }} />}</span>
              <b className="tn" style={{ font: "500 20px/28px var(--display)", display: "block", marginTop: 4 }}>{money(account.amount, account.currency)}</b>
              <small className="faint" style={{ fontSize: 12 }}>{field(account, "iban") ?? account.source}</small>
            </div>
          ))}
          {accountList.length === 0 && !accounts.isPending && <div className="card"><span>{t("finance.noAccounts")}</span></div>}
        </div>
        <div className="bz-fg">
          <Card>
            <div className="fch">
              <div>
                <div className="l">{months.length ? t("finance.balanceForecast", { count: months.length }) : t("finance.balance")}</div>
                <div className="vv">
                  <b className="tn">{money(cash, currency)}</b>
                  {first && first.monthly_burn > 0 && <span className="down tn">−{money(first.monthly_burn, currency)} {t("finance.perMonth")}</span>}
                  {first?.runway_months != null && <span className="faint">{t("finance.runway", { months: first.runway_months.toFixed(1) })}</span>}
                </div>
              </div>
              {months.length > 0 && (
                <span style={{ marginLeft: "auto", flex: "none" }}>
                  <Seg<Scenario> label={t("finance.scenario")} value={scenario} onChange={setScenario} options={[["base", t("finance.withoutDeals")], ["pipeline", t("finance.withPipeline")]]} />
                </span>
              )}
            </div>
            <div style={{ padding: "12px 16px" }}>
              {transactions.isPending ? <Skeleton count={1} height={240} /> : (
                <AreaChart
                  data={history}
                  future={futureOf(months, history.length, scenario)}
                  height={250}
                  format={(value) => money(value, currency)}
                  labels={[t("finance.daysAgo", { count: 120 }), t("finance.daysAgo", { count: 60 }), t("today.today"), ...(months.length ? [monthLabel(months[months.length - 1]!.period)] : [])]}
                />
              )}
            </div>
          </Card>
          <Card>
            <div className="fuh"><span className="grow">{t("finance.upcoming")}</span><span className="faint tn">{money(upcoming.reduce((sum, item) => sum + (item.amount ?? 0), 0), currency)}</span></div>
            <div className="ful">
              {upcoming.slice(0, 12).map((bill) => {
                const canPay = canDo(sources.data, "invoices", "pay", bill.source);
                return (
                  <div key={bill.id} className="fur">
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="clip" style={{ display: "block" }}>{bill.author ?? bill.title}{has(bill, "overdue") && <> <Badge tone="bad">{t("invoices.overdue")}</Badge></>}</span>
                      <small className="faint" style={{ fontSize: 12 }}>{bill.ends_at ? t("finance.due", { date: shortDate(bill.ends_at) }) : t("finance.noDue")}</small>
                    </span>
                    <span className="tn">{money(bill.amount, bill.currency, true)}</span>
                    {canPay ? (
                      <Btn size="sm" disabled={action.isPending} onClick={() => action.mutate({ item: bill.id, action: "pay" })}>{t("finance.release")}</Btn>
                    ) : (
                      <Btn size="sm" variant="ghost" onClick={() => go("invoices", bill.id)}>{t("finance.check")}</Btn>
                    )}
                  </div>
                );
              })}
              {upcoming.length === 0 && <p className="faint" style={{ padding: 12, fontSize: 13 }}>{domains.has("invoices") ? t("finance.nothingDue") : t("finance.noInvoices")}</p>}
            </div>
            <p className="faint" style={{ fontSize: 12, padding: "0 16px 12px" }}>{t("finance.payHint")}</p>
          </Card>
        </div>
        <Card style={{ marginTop: 12 }}>
          <div className="ftb">
            <b>{t("finance.moves")}</b>
            <Seg<Flow> label={t("finance.flow")} value={flow} onChange={setFlow} options={[["all", t("approvals.filterAll"), moves.length], ["in", t("finance.in")], ["out", t("finance.out")]]} />
            <span className="grow" />
            <span className="faint tn" style={{ fontSize: 12 }}>{shown.length} · {total >= 0 ? "+" : ""}{money(total, currency, true)}</span>
            <div className="fs"><label className="field"><Search /><input aria-label={t("ui.search")} placeholder={t("finance.search")} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
          </div>
          {shown.length === 0 ? (
            <Empty title={moves.length ? t("palette.empty") : t("finance.noMoves")} />
          ) : (
            <table className="table">
              <thead><tr><th>{t("finance.when")}</th><th>{t("finance.who")}</th><th>{t("finance.account")}</th><th>{t("finance.category")}</th><th className="r">{t("finance.amount")}</th></tr></thead>
              <tbody>
                {shown.slice(0, 200).map((item) => (
                  <tr key={item.id}>
                    <td className="muted">{item.occurred_at ? (Date.now() - Date.parse(item.occurred_at) < 6 * 86_400_000 ? weekdayShort(item.occurred_at) : new Date(item.occurred_at).toLocaleDateString(locale, { day: "numeric", month: "short" })) : "–"}</td>
                    <td><span className="clip" style={{ display: "block", maxWidth: 320 }}>{item.title ?? item.author}</span></td>
                    <td className="muted">{accountName(item)}</td>
                    <td>{field(item, "category") ? <span className="ftag">{categoryLabel(field(item, "category")!)}</span> : <span className="faint">–</span>}</td>
                    <td className={`r ${(item.amount ?? 0) > 0 ? "up" : ""}`}>{(item.amount ?? 0) > 0 ? "+" : ""}{money(item.amount, item.currency ?? currency, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        {domains.has("invoices") && (
          <div style={{ marginTop: 12 }}><Btn size="sm" variant="ghost" onClick={() => go("invoices")}>{t("nav.invoices")}<ArrowRight /></Btn></div>
        )}
      </div>
    </div>
  );
}
