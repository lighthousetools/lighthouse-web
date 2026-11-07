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
