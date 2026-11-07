import { describe, expect, it } from "vitest";
import { queriesFor } from "../data";
import { nextStep } from "./Alerts";
import { cronHours, draftAutomation, parseAutomation, serializeAutomation } from "./automation";
import { change, columns, figures, thesis, weekOf, type BriefingDocument } from "./document";
import { slidesOf, twoLines } from "./Film";
import { factTokens, loaded } from "./Me";
import { byCategory } from "./Rules";
import { groupOf, parseTask } from "./taskdates";

const monday = new Date(2026, 10, 9, 9, 0);

describe("quick entry", () => {
  it("reads due words, dates and importance in both languages", () => {
    expect(parseTask("tomorrow call Jane !", monday)).toEqual({ title: "call Jane", due: "2026-11-10", priority: 3, dueWord: true });
    expect(parseTask("Angebot schicken bis Fr", monday)).toMatchObject({ title: "Angebot schicken", due: "2026-11-13" });
    expect(parseTask("Review am 12.11.", monday)).toMatchObject({ title: "Review", due: "2026-11-12" });
    expect(parseTask("Plan next week", monday)).toMatchObject({ title: "Plan", due: "2026-11-16" });
    expect(parseTask("do the dishes", monday)).toEqual({ title: "do the dishes", due: null, priority: 0, dueWord: false });
    expect(parseTask("Report Friday", monday).due).toBe("2026-11-13");
  });

  it("puts due dates into lists", () => {
    expect(groupOf("2026-11-01", monday)).toBe("today");
    expect(groupOf("2026-11-10", monday)).toBe("tomorrow");
    expect(groupOf("2026-11-14", monday)).toBe("week");
    expect(groupOf(null, monday)).toBe("later");
  });
});

const recap: BriefingDocument = {
  id: "d1", run_id: "r1", agent_id: "weekly-report", kind: "weekly_recap", period: "2026-W45", title: "Weekly recap", created_at: "2026-11-08T18:00:00Z",
  content: {
    kind: "weekly_recap", title: "Weekly recap", summary: "A steady week. The importer shipped.", unavailable: [],
    sections: [
      { key: "numbers", title: "Numbers", items: [{ text: "Issues closed", numbers: [{ label: "Issues", value: 12, previous: 8 }] }] },
      { key: "shipped", title: "Shipped", items: [{ text: "Importer released", source: { service: "github" } }] },
    ],
  },
};

describe("documents", () => {
  it("splits the summary into headline and lead", () => {
    expect(thesis("A steady week. The importer shipped.")).toEqual({ title: "A steady week.", lead: "The importer shipped." });
    expect(thesis(null)).toEqual({ title: "", lead: "" });
  });

  it("balances sections over columns and compares numbers", () => {
    const sections = [{ items: [1, 2, 3] }, { items: [1] }, { items: [] }, { items: [1] }];
    expect(columns(sections, 3).map((column) => column.length)).toEqual([1, 1, 2]);
    expect(change({ label: "x", value: 12, previous: 8 })).toBe(50);
    expect(change({ label: "x", value: 12 })).toBeNull();
    expect(figures(recap)).toHaveLength(1);
    expect(weekOf("2026-W45")).toEqual({ year: 2026, week: 45 });
  });

  it("builds the film from the document", () => {
    const slides = slidesOf(recap);
    expect(slides[0]).toMatchObject({ id: "thesis", lines: ["A steady", "week."], caption: "The importer shipped." });
    expect(slides.find((slide) => slide.number)?.number).toEqual({ value: 12, unit: undefined });
    expect(slides[slides.length - 1]?.end).toBe(true);
    expect(twoLines("That was your whole week")).toEqual(["That was your", "whole week"]);
  });
});

describe("automations", () => {
  const source = `---
name: Triage failed briefs
trigger:
  event: run.failed
  match:
    agent_id: morning-brief
steps:
  - agent: morning-brief
  - if:
      status: failed
  - notify:
      to: owner
      subject: "The brief failed twice"
      message: "{{output}}"
  - tool:
      name: mail.send_reply
      input:
        to: "{{event.from}}"
---
Retries the brief.
`;

  it("reads every trigger and step kind and writes them back", () => {
    const automation = parseAutomation(source);
    expect(automation.trigger).toEqual({ kind: "event", event: "run.failed", match: { agent_id: "morning-brief" } });
    expect(automation.steps.map((step) => step.kind)).toEqual(["agent", "if", "notify", "tool"]);
    expect(parseAutomation(serializeAutomation(automation))).toEqual(automation);
  });

  it("drafts a manual automation from a sentence and reads cron hours", () => {
    const draft = draftAutomation("Every morning check the inbox", "inbox");
    expect(serializeAutomation(draft)).toContain("manual: true");
    expect(cronHours("30 7 * * MON-FRI")).toEqual([7.5]);
    expect(cronHours("0 9-11 * * *")).toEqual([9, 10, 11]);
    expect(cronHours("0 */6 * * *")).toEqual([0, 6, 12, 18]);
  });
});

describe("helpers", () => {
  it("names what to do about an alert", () => {
    expect(nextStep({ kind: "connector", key: "connector:github" })).toMatchObject({ view: "connections", param: "github" });
    expect(nextStep({ kind: "node_offline", key: "node:n1" }).view).toBe("sessions");
  });

  it("groups rules by category with the rest last", () => {
    const rule = (id: string, category: string | null) => ({ id, text: id, enabled: true, category, created_at: "", updated_at: "" });
    expect(byCategory([rule("a", null), rule("b", "Work"), rule("c", "Code")]).map(([key]) => key)).toEqual(["Code", "Work", ""]);
  });

  it("counts only confirmed, active facts as loaded", () => {
    const fact = (text: string, status: string, paused = false) => ({ id: text, text, status, paused, confidence: 1, source: { kind: "owner" }, created_at: "", updated_at: text });
    const facts = [fact("a", "confirmed"), fact("b", "proposed"), fact("c", "confirmed", true)];
    expect(loaded(facts).map((item) => item.id)).toEqual(["a"]);
    expect(factTokens([{ text: "12345678" }])).toBe(3);
  });

  it("reloads only what a live event names", () => {
    expect(queriesFor("tasks.changed")).toEqual([["tasks"], ["ready"]]);
    expect(queriesFor("changed")).toBe("all");
  });
});
