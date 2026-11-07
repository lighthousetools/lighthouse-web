import { describe, expect, it } from "vitest";
import { placeholdersOf } from "./Contracts";
import { nextVariantName, variantsOf } from "./PostEditor";
import { sortSteps } from "./Rooms";
import { fromZone, inZone } from "./zone";

describe("the owner's time zone", () => {
  it("reads the day and time of an instant in a zone", () => {
    expect(inZone("2026-11-10T07:00:00Z", "Europe/Berlin")).toEqual({ day: "2026-11-10", time: "08:00" });
    expect(inZone("2026-11-10T23:30:00Z", "Europe/Berlin")).toEqual({ day: "2026-11-11", time: "00:30" });
    expect(inZone("2026-11-10T07:00:00Z", "America/New_York")).toEqual({ day: "2026-11-10", time: "02:00" });
  });

  it("turns a day and time in a zone into an instant, also across a change of the offset", () => {
    expect(fromZone("2026-11-10", "08:00", "Europe/Berlin")).toBe("2026-11-10T07:00:00.000Z");
    expect(fromZone("2026-07-10", "08:00", "Europe/Berlin")).toBe("2026-07-10T06:00:00.000Z");
    expect(fromZone("2026-03-29", "12:00", "Europe/Berlin")).toBe("2026-03-29T10:00:00.000Z");
    expect(fromZone("2026-11-10", "08:00", "UTC")).toBe("2026-11-10T08:00:00.000Z");
    expect(inZone("2026-11-10T07:00:00Z", "not a zone").day).toMatch(/^2026-11-1[01]$/);
  });
});

describe("post variants", () => {
  it("reads variants and names the next one", () => {
    expect(variantsOf({ variants: [{ name: "B", text: "x" }, null, { name: "C" }] })).toEqual([{ name: "B", text: "x" }]);
    expect(variantsOf({ variants: null })).toEqual([]);
    expect(nextVariantName([])).toBe("B");
    expect(nextVariantName([{ name: "B", text: "" }, { name: "C", text: "" }])).toBe("D");
    expect(nextVariantName([{ name: "C", text: "" }])).toBe("B");
  });
});

describe("contracts and rooms", () => {
  it("finds each placeholder of a template once", () => {
    expect(placeholdersOf("Between {{company}} and {{ customer }}, from {{start}}. Signed by {{customer}}.")).toEqual(["company", "customer", "start"]);
    expect(placeholdersOf("No fields")).toEqual([]);
  });

  it("puts open room steps first, by due date", () => {
    const steps = [
      { id: "a", state: "done", ends_at: "2026-11-01T00:00:00Z", starts_at: null },
      { id: "b", state: "open", ends_at: "2026-11-20T00:00:00Z", starts_at: null },
      { id: "c", state: "open", ends_at: "2026-11-12T00:00:00Z", starts_at: null },
      { id: "d", state: null, ends_at: null, starts_at: null },
    ];
    expect(sortSteps(steps).map((step) => step.id)).toEqual(["c", "b", "d", "a"]);
  });
});

import { cronText } from "../cron";
import { groupRuns } from "./Brief";
import { consultedOf } from "./Ready";

describe("feel polish", () => {
  it("writes schedules in plain words", () => {
    expect(cronText("0 7 * * MON-FRI")).toBe("Mon–Fri 07:00");
    expect(cronText("0 8 * * FRI")).toBe("Fri 08:00");
    expect(cronText("30 6 * * *")).toBe("daily 06:30");
    expect(cronText("0 */4 * * *")).toBe("every 4 hours");
    expect(cronText("0 7 1 * *")).toBe("0 7 1 * *");
  });

  it("groups repeated runs into one line", () => {
    const runs = [{ agent_id: "inbox", status: "waiting" }, { agent_id: "inbox", status: "waiting" }, { agent_id: "brief", status: "succeeded" }, { agent_id: "inbox", status: "waiting" }];
    expect(groupRuns(runs).map((group) => group.count)).toEqual([2, 1, 1]);
  });

  it("names what an agent consulted, with the server's label when it has one", () => {
    expect(consultedOf(["demo.list_threads", "demo.list_tickets", "github.search_pull_requests", "demo.create_draft"]).map((entry) => entry.label)).toEqual(["Mail", "Issues", "Github"]);
    expect(consultedOf([{ tool: "x.y", label: "Superhuman", service: "superhuman" }])[0]).toMatchObject({ label: "Superhuman", service: "superhuman" });
  });
});

import { futureOf, categoryLabel } from "./Finance";
import { modelName } from "./Agents";

describe("closing the data gaps", () => {
  it("draws the cash forecast to each month's closing, with or without the pipeline", () => {
    const months = [{ period: "2026-11", opening: 100, closing: 120, invoices_in: 30, payables_out: 5, pipeline_weighted: 10, burn: 15 }, { period: "2026-12", opening: 120, closing: 130, invoices_in: 0, payables_out: 0, pipeline_weighted: 20, burn: 10 }];
    const withPipeline = futureOf(months, 8, "pipeline");
    expect(withPipeline).toHaveLength(4);
    expect(withPipeline[1]).toBe(120);
    expect(withPipeline[3]).toBe(130);
    expect(futureOf(months, 8, "base")[3]).toBe(100);
    expect(futureOf([], 8, "base")).toEqual([]);
  });

  it("names categories and models in plain words", () => {
    expect(categoryLabel("payroll")).toBe("Payroll");
    expect(categoryLabel("Coffee")).toBe("Coffee");
    expect(modelName({ model: { task: "text", provider: "anthropic", model: "claude-sonnet-4-5", fallback: null, fallback_model: null } })).toBe("Sonnet 4.5");
    expect(modelName({ model: null })).toBe("–");
  });
});
