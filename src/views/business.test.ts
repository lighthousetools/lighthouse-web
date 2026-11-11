import { describe, expect, it } from "vitest";
import { visibleNav } from "../shell/nav";
import { runsPerHour } from "./Center";
import { contractStep } from "./Contracts";
import { balanceHistory } from "./Finance";
import { invoiceState } from "./Invoices";
import { insights, monthChange, revenueSeries } from "./Numbers";
import { stageIdOf, stageOrder } from "./Pipeline";
import { unread, visitsPerDay } from "./Rooms";
import { quotesFor } from "./Stocks";
import type { Item } from "./connected";

const item = (patch: Partial<Item>): Item => ({ id: "i", source: "crm", domain: "deals", kind: "deal", external_id: "x", flags: [], importance: 10, data: {}, synced_at: "", ...patch });
const now = Date.parse("2026-11-09T12:00:00Z");

describe("business pages", () => {
  it("shows numbers once any money source exists and stocks only with holdings", () => {
    const views = visibleNav(new Set(["bank"])).flatMap((group) => group.items.map((entry) => entry.view));
    expect(views).toContain("numbers");
    expect(views).toContain("finance");
    expect(views).not.toContain("stocks");
    expect(views).toContain("center");
  });

  it("orders stages as the numbers list them, then the rest", () => {
    expect(stageOrder([item({ state: "Won" }), item({ state: "Lead" })], ["Lead", "Offer"])).toEqual(["Lead", "Offer", "Won"]);
    const deals = [item({ state: "Offer", data: { stage_id: 7 } }), item({ source: "other", state: "Lead", data: { stage_id: 9 } })];
    expect(stageIdOf(deals, "Offer", "crm")).toBe(7);
    expect(stageIdOf(deals, "Lead", "crm")).toBeUndefined();
  });

  it("reads revenue, its change and what needs a look", () => {
    const numbers = { revenue: [{ period: "2026-11", amount: 120 }, { period: "2026-10", amount: 100 }] };
    expect(revenueSeries(numbers).map((point) => point.amount)).toEqual([100, 120]);
    expect(monthChange(revenueSeries(numbers))).toBe(20);
    const tips = insights({ currency: "EUR", invoices_overdue: 2, receivables_overdue: 500, deals_cold: 0, runway_months: 6, monthly_burn: 1000 } as never);
    expect(tips.map((tip) => tip.key)).toEqual(["overdue", "runway"]);
  });

  it("walks balances back through transactions", () => {
    const history = balanceHistory(1000, [{ amount: 200, occurred_at: "2026-11-09T09:00:00Z" }], 3, new Date(now));
    expect(history).toEqual([800, 800, 1000]);
  });

  it("names invoice and contract states", () => {
    expect(invoiceState({ state: "open", flags: ["overdue"] })).toBe("overdue");
    expect(invoiceState({ state: "Draft", flags: [] })).toBe("draft");
    expect(invoiceState({ state: "paid", flags: [] })).toBe("paid");
    expect(contractStep("sent")).toBe(1);
    expect(contractStep("Completed")).toBe(3);
    expect(contractStep(null)).toBe(0);
  });

  it("counts room visits, unread documents, quotes and runs", () => {
    expect(visitsPerDay([{ occurred_at: "2026-11-09T08:00:00Z" }, { occurred_at: "2026-11-08T08:00:00Z" }], 3, now)).toEqual([0, 1, 1]);
    expect(unread(item({ data: { views: 0 } }))).toBe(true);
    expect(unread(item({ data: { views: 3 } }))).toBe(false);
    const quotes = [item({ parent_id: "h", amount: 2, occurred_at: "2026-11-02" }), item({ parent_id: "h", amount: 1, occurred_at: "2026-11-01" })];
    expect(quotesFor({ id: "h", external_id: "H" }, quotes)).toEqual([1, 2]);
    expect(runsPerHour(["2026-11-09T11:30:00Z"], 3, now)).toEqual([0, 0, 1]);
  });
});
