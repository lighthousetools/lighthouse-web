import { describe, expect, it } from "vitest";
import { countSteps, insertStep, moveStepBy, parseAutomation, removeStep, replaceStep, serializeAutomation, stepAt, type Step } from "./automation";
import { layoutFlow, NODE_W, widthOf } from "./flow";
import { issueTargets } from "./Issues";
import { laterOptions } from "./later";
import { failedShare } from "./Alerts";
import { tokens } from "./Sessions";
import { groupOf, sourcesOf } from "./Talk";

const source = `---
name: Triage
trigger:
  manual: true
steps:
  - agent: triage-helper
  - if:
      contains: urgent
      then:
        - notify:
            to: owner
            subject: Urgent
            message: "{{output}}"
      else:
        - agent: archive-helper
  - if:
      status: succeeded
---
`;

describe("automation branches", () => {
  it("reads and writes then and else lanes, and keeps a plain if as a gate", () => {
    const automation = parseAutomation(source);
    const branch = automation.steps[1] as Extract<Step, { kind: "if" }>;
    expect(branch.then?.map((step) => step.kind)).toEqual(["notify"]);
    expect(branch.else?.map((step) => step.kind)).toEqual(["agent"]);
    expect((automation.steps[2] as Extract<Step, { kind: "if" }>).then).toBeUndefined();
    expect(countSteps(automation.steps)).toBe(5);
    const again = parseAutomation(serializeAutomation(automation));
    expect(again.steps).toEqual(automation.steps);
    expect(serializeAutomation(automation)).toContain("else:");
  });

  it("edits steps by path, inside branches too", () => {
    const steps = parseAutomation(source).steps;
    expect(stepAt(steps, [1, "else", 0])).toEqual({ kind: "agent", agent: "archive-helper" });
    const added = insertStep(steps, [1, "then", 1], { kind: "agent", agent: "pager" });
    expect(stepAt(added, [1, "then", 1])).toEqual({ kind: "agent", agent: "pager" });
    const replaced = replaceStep(added, [1, "then", 0], { kind: "agent", agent: "other" });
    expect(stepAt(replaced, [1, "then", 0])).toEqual({ kind: "agent", agent: "other" });
    const [moved, path] = moveStepBy(replaced, [1, "then", 0], 1);
    expect(path).toEqual([1, "then", 1]);
    expect(stepAt(moved, [1, "then", 0])).toEqual({ kind: "agent", agent: "pager" });
    expect(stepAt(removeStep(moved, [1, "else", 0]), [1, "else", 0])).toBeUndefined();
    expect(steps).toHaveLength(3);
  });

  it("lays branches out side by side and joins them again", () => {
    const steps = parseAutomation(source).steps;
    const flow = layoutFlow(steps);
    expect(widthOf(steps)).toBe(NODE_W * 2 + 64);
    const then = flow.nodes.find((node) => node.side === "then")!;
    const otherwise = flow.nodes.find((node) => node.side === "else")!;
    expect(then.y).toBe(otherwise.y);
    expect(then.x).toBeLessThan(otherwise.x);
    const last = flow.nodes.at(-1)!;
    expect(last.path).toEqual([2]);
    expect(last.y).toBeGreaterThan(then.y);
    expect(flow.adds.map((slot) => slot.path.join("."))).toEqual(["1.then.1", "1.else.1", "3"]);
    const empty = layoutFlow([{ kind: "if", test: "contains", value: "x", then: [], else: [] }]);
    expect(empty.adds.map((slot) => slot.path.join("."))).toEqual(["0.then.0", "0.else.0", "1"]);
  });
});

describe("later", () => {
  it("offers an hour, the evening while it is still ahead, tomorrow and Monday", () => {
    const morning = laterOptions(new Date(2026, 10, 5, 9, 0));
    expect(morning.map((option) => option.key)).toEqual(["hour", "evening", "tomorrow", "monday"]);
    expect(morning[3]!.until.getDay()).toBe(1);
    expect(morning[2]!.until.getHours()).toBe(8);
    const late = laterOptions(new Date(2026, 10, 5, 17, 0));
    expect(late.map((option) => option.key)).toEqual(["hour", "tomorrow", "monday"]);
    const monday = laterOptions(new Date(2026, 10, 9, 9, 0));
    expect(monday[3]!.until.getDate()).toBe(16);
  });
});

describe("new issues", () => {
  it("goes to trackers with create and code hosts with create_issue", () => {
    expect(issueTargets([
      { name: "linear", domain: "issues", actions: ["create", "comment"] },
      { name: "github", domain: "code", actions: ["approve", "create_issue"] },
      { name: "gitlab", domain: "code", actions: ["approve"] },
    ])).toEqual([{ source: "linear", action: "create", kind: "tracker" }, { source: "github", action: "create_issue", kind: "repo" }]);
  });
});


describe("talk, usage and alert charts", () => {
  it("groups threads by their last message, pinned ones first", () => {
    const now = new Date(2026, 10, 7, 12);
    const at = (days: number) => new Date(2026, 10, 7 - days, 9).toISOString();
    expect(groupOf({ pinned: true, updated_at: at(30) }, now)).toBe("pinned");
    expect(groupOf({ pinned: false, updated_at: at(0) }, now)).toBe("today");
    expect(groupOf({ pinned: false, updated_at: at(1) }, now)).toBe("yesterday");
    expect(groupOf({ pinned: false, updated_at: at(4) }, now)).toBe("week");
    expect(groupOf({ pinned: false, updated_at: at(9) }, now)).toBe("older");
  });

  it("reads the Brain sources of an answer and tolerates anything else", () => {
    expect(sourcesOf({ sources: [{ id: "e1", title: "Pricing" }, null, { title: "no id" }] })).toEqual([{ id: "e1", title: "Pricing" }]);
    expect(sourcesOf({ sources: {} })).toEqual([]);
  });

  it("shows token counts and the failed share of a day", () => {
    expect(tokens(950)).toBe("950");
    expect(tokens(12_400)).toBe("12.4k");
    expect(tokens(1_250_000)).toBe("1.3M");
    expect(failedShare({ total: 4, failed: 1 })).toBe(0.25);
    expect(failedShare({ total: 0, failed: 0 })).toBe(0);
  });
});
