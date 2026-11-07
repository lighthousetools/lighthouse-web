import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Schemas } from "../api/client";
import { language, t, useLanguage } from "../i18n";
import { go } from "../router";
import { AreaChart, Badge, Btn, Card, Empty, Failure, Seg, Skeleton, Spark } from "../ui";
import { Freshness, money, useDomains, useNumbers, useOrg } from "./connected";
import "./numbers.css";

type Currency = Schemas["CurrencyNumbers"];
type Tile = "revenue" | "receivables" | "pipeline" | "weighted" | "cash";
type Split = "stage" | "money";

/** Revenue oldest first, as the chart reads it. The server sends newest first. */
export function revenueSeries(numbers: Pick<Currency, "revenue">) {
  return [...numbers.revenue].reverse();
}

/** Change of the latest month against the one before, in percent. */
export function monthChange(series: { amount: number }[]) {
  const last = series[series.length - 1]?.amount;
  const before = series[series.length - 2]?.amount;
  if (last == null || !before) return null;
  return Math.round(((last - before) / Math.abs(before)) * 100);
}

/** What deserves a look, from the numbers themselves. */
export function insights(numbers: Currency) {
  const list: { key: string; title: string; body: string; view: "pipeline" | "invoices" | "finance" }[] = [];
  if (numbers.invoices_overdue > 0) {
    list.push({ key: "overdue", title: t("numbers.insight.overdue", { count: numbers.invoices_overdue }), body: t("numbers.insight.overdueBody", { sum: money(numbers.receivables_overdue, numbers.currency) }), view: "invoices" });
  }
  if (numbers.deals_cold > 0) {
    list.push({ key: "cold", title: t("numbers.insight.cold", { count: numbers.deals_cold }), body: t("numbers.insight.coldBody"), view: "pipeline" });
  }
  if (numbers.runway_months != null && numbers.runway_months < 12) {
    list.push({ key: "runway", title: t("numbers.insight.runway", { months: numbers.runway_months.toFixed(1) }), body: t("numbers.insight.runwayBody", { burn: money(numbers.monthly_burn, numbers.currency) }), view: "finance" });
  }
  return list;
}

const monthLabel = (period: string) => {
  const date = new Date(`${period.slice(0, 7)}-01T12:00:00`);
  return Number.isNaN(date.getTime()) ? period : date.toLocaleDateString(language() === "de" ? "de-DE" : "en-GB", { month: "short" });
};

export function Numbers() {
  useLanguage();
  const domains = useDomains();
  const org = useOrg();
  const [months, setMonths] = useState<"3" | "12" | "24">("12");
  const numbers = useNumbers(Number(months));
  const [currencyIndex, setCurrencyIndex] = useState(0);
  const [tile, setTile] = useState<Tile>("revenue");
  const [split, setSplit] = useState<Split>("stage");
  const [page, setPage] = useState(0);
  const all = numbers.data?.currencies ?? [];
  const current = all[Math.min(currencyIndex, all.length - 1)];
  if (numbers.isPending) return <div className="page"><Skeleton count={6} /></div>;
  if (!current) {
    return (
      <div className="page">
        <header className="ph"><div className="grow"><h1>{t("nav.numbers")}</h1></div></header>
        <Failure error={numbers.error} />
        <div className="card"><Empty title={t("numbers.empty")} sub={t("numbers.emptyHint")} /></div>
      </div>
    );
  }
  const code = current.currency;
  const series = revenueSeries(current);
  const change = monthChange(series);
  const tiles: [Tile, string, number, number[] | undefined][] = [
    ["revenue", t("numbers.revenue"), series[series.length - 1]?.amount ?? 0, series.map((point) => point.amount)],
    ["receivables", t("numbers.receivables"), current.receivables_open, undefined],
    ["pipeline", t("numbers.pipeline"), current.pipeline_open, undefined],
    ["weighted", t("numbers.weighted"), current.pipeline_weighted, undefined],
    ["cash", t("numbers.cash"), current.cash, undefined],
  ];
  const tips = insights(current);
  const tip = tips[page % Math.max(tips.length, 1)];
  const stages = [...current.stages].sort((a, b) => b.amount - a.amount);
  const stageSum = stages.reduce((sum, stage) => sum + stage.amount, 0);
  const moneyRows: [string, number][] = [
    [t("numbers.cash"), current.cash],
    [t("numbers.receivables"), current.receivables_open],
    [t("numbers.payables"), current.payables_open],
    [t("numbers.holdings"), current.holdings],
  ];
  const moneyMax = Math.max(...moneyRows.map(([, value]) => Math.abs(value)), 1);
  const sources = [domains.has("invoices") && t("nav.invoices"), domains.has("bank") && t("nav.finance"), domains.has("deals") && t("nav.pipeline")].filter(Boolean).join(", ");
  return (
    <div className="page">
      <div className="nb">
        <header className="ph">
          <div className="grow">
            <h1>{t("nav.numbers")}</h1>
            <p>{t("numbers.lead", { sources, scope: org ? org.name : t("org.allCompanies") })}</p>
          </div>
          <div className="acts">
            <Freshness domain="invoices" />
            <Seg label={t("numbers.period")} value={months} onChange={setMonths} options={[["3", t("numbers.quarter")], ["12", t("numbers.year")], ["24", t("numbers.twoYears")]]} />
            {all.length > 1 && <Seg label={t("numbers.currency")} value={String(currencyIndex)} onChange={(value) => setCurrencyIndex(Number(value))} options={all.map((item, index) => [String(index), item.currency] as [string, string])} />}
          </div>
        </header>
        <div className="bz-nts">
          {tiles.map(([key, label, value, spark]) => (
            <button type="button" key={key} className={`card bz-nt ${tile === key ? "on" : ""}`} onClick={() => setTile(key)}>
              <span className="l clip">{label}</span>
              <b className="tn">{money(value, code)}</b>
              {key === "revenue" && change != null && <Badge tone={change >= 0 ? "ok" : "bad"}>{change >= 0 ? "+" : ""}{change} %</Badge>}
              {spark && spark.length > 1 && <span className="sp"><Spark data={spark} height={26} /></span>}
            </button>
          ))}
        </div>
        <div className="ng">
          <Card>
            <div className="nch">
              <div>
                <div className="l">{t("numbers.revenue")}</div>
                <div className="vv">
                  <b className="tn">{money(series.reduce((sum, point) => sum + point.amount, 0), code)}</b>
                  {change != null && <Badge tone={change >= 0 ? "ok" : "bad"}>{change >= 0 ? "+" : ""}{change} %</Badge>}
                  <span className="faint">{t("numbers.inMonths", { count: series.length })}</span>
                </div>
              </div>
              <div className="numx-lg"><span>{t("numbers.perMonth")}</span></div>
            </div>
            <div className="nchart">
              {series.length > 1 ? (
                <AreaChart data={series.map((point) => point.amount)} labels={series.map((point) => monthLabel(point.period))} height={330} format={(value) => money(value, code)} />
              ) : (
                <Empty title={t("numbers.noRevenue")} />
              )}
            </div>
          </Card>
          <div className="nside">
            <Card pad>
              <div className="nih">
                <Sparkles size={13} />
                <span className="grow">{t("numbers.watch")}</span>
                {tips.length > 1 && (
                  <span className="pg tn">
                    <button type="button" aria-label={t("mail.previous")} onClick={() => setPage(page + tips.length - 1)}><ChevronLeft size={12} /></button>
                    {(page % tips.length) + 1}/{tips.length}
                    <button type="button" aria-label={t("mail.next")} onClick={() => setPage(page + 1)}><ChevronRight size={12} /></button>
                  </span>
                )}
              </div>
              {tip ? (
                <>
                  <div className="nit">{tip.title}</div>
                  <div className="nib">{tip.body}</div>
                  <div className="nia"><Btn size="sm" variant="primary" onClick={() => go(tip.view)}>{t("numbers.look")}<ArrowRight /></Btn></div>
                </>
              ) : (
                <div className="nib">{t("numbers.allWell")}</div>
              )}
            </Card>
            <Card style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div className="nbh">
                <span className="grow">{t("numbers.split")}</span>
                <Seg<Split> label={t("numbers.split")} value={split} onChange={setSplit} options={[["stage", t("pipeline.stage")], ["money", t("numbers.money")]]} />
              </div>
              <div className="nbl">
                {split === "stage"
                  ? stages.map((stage) => (
                      <div key={stage.stage} className="nr" onClick={() => go("pipeline")}>
                        <i style={{ width: `${stageSum ? (stage.amount / stageSum) * 100 : 0}%` }} />
                        <span className="clip grow">{stage.stage}</span>
                        <span className="tn bz-sh2">{stage.count}</span>
                        <span className="tn">{money(stage.amount, code)}</span>
                      </div>
                    ))
                  : moneyRows.map(([label, value]) => (
                      <div key={label} className="nr">
                        <i style={{ width: `${(Math.abs(value) / moneyMax) * 100}%` }} />
                        <span className="clip grow">{label}</span>
                        <span className="tn">{money(value, code)}</span>
                      </div>
                    ))}
                {split === "stage" && stages.length === 0 && <div className="empty">{t("pipeline.empty")}</div>}
              </div>
              {split === "stage" && stageSum > 0 && (
                <>
                  <div className="nst">{stages.map((stage) => <i key={stage.stage} style={{ flexGrow: stage.amount }} />)}</div>
                  <div className="nsm"><span>{t("numbers.sum")}</span><span className="tn">{money(stageSum, code)}</span></div>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
