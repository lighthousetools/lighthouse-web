import { describe, expect, it } from "vitest";
import { parseRoute } from "../router";
import { costsByDay } from "../views/briefing";
import { groupEntries } from "../views/Brain";
import { heat, reportParts } from "../views/Recap";
import { freedom } from "../views/Agents";
import { newIds } from "./bridge";
import { resolveLook } from "./look";

const at = (hour: number, minute = 0) => new Date(2026, 10, 9, hour, minute);

describe("look", () => {
  it("is light unless Dark was chosen", () => {
    expect(resolveLook("system")).toBe("light");
    expect(resolveLook("light")).toBe("light");
  });

});

describe("routes", () => {
  it("reads views and parameters, keeps old names, and falls back to Ready", () => {
    expect(parseRoute("#approvals/approval%3Aa1")).toEqual({ view: "ready", param: "approval:a1" });
    expect(parseRoute("#weekly")).toEqual({ view: "recap" });
    expect(parseRoute("#today")).toEqual({ view: "ready" });
    expect(parseRoute("#/brain/e1")).toEqual({ view: "brain", param: "e1" });
    expect(parseRoute("#nowhere")).toEqual({ view: "ready" });
  });
});

describe("bridge", () => {
  it("reports only ids that appeared after the first load", () => {
    expect(newIds(null, ["a"])).toEqual([]);
    expect(newIds(new Set(["a"]), ["a", "b"])).toEqual(["b"]);
  });
});

describe("data shaping", () => {
  it("fills quiet days with zero costs", () => {
    const days = costsByDay([{ day: "2026-11-09", cost_eur: 1.5 }, { day: "2026-11-09", cost_eur: 0.5 }], 3, at(12));
    expect(days).toEqual([{ day: "2026-11-07", cost: 0 }, { day: "2026-11-08", cost: 0 }, { day: "2026-11-09", cost: 2 }]);
  });

  it("counts runs by weekday and hour, Monday first", () => {
    const grid = heat([at(9).toISOString(), at(9, 30).toISOString()]);
    expect(grid[0]![9]).toBe(2);
  });

  it("takes title and lead from a report", () => {
    expect(reportParts("# Two **busy** weeks\n\n- list\nShipped the importer.")).toEqual({ title: "Two busy weeks", lead: "Shipped the importer." });
  });

  it("groups Brain entries by type and keeps files apart", () => {
    const entry = (id: string, type: string, original: string | null = null) => ({ id, type, original, title: id, snippet: "", status: "active", updated_at: "" });
    expect(groupEntries([entry("a", "note"), entry("b", "note", "x.pdf"), entry("c", "note")]).map(([key, list]) => [key, list.length])).toEqual([["note", 2], ["file", 1]]);
  });

  it("names how freely an agent acts", () => {
    const agent = { blocked: [], tools: [{ name: "mail.send", level: "write" }] } as unknown as Parameters<typeof freedom>[0];
    expect(freedom(agent).label).toBe("Asks first");
    expect(freedom({ ...agent, tools: [{ name: "mail.read", level: "read" }] }).label).toBe("Reads only");
    expect(freedom({ ...agent, blocked: ["no key"] }).tone).toBe("bad");
  });
});
