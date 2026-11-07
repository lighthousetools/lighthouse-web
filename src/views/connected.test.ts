import { describe, expect, it } from "vitest";
import { visibleNav } from "../shell/nav";
import { parseRoute } from "../router";
import { splitRows } from "../ui/diff";
import { freeSlots, place, weekStart } from "./Calendar";
import { checkState, fileDiff } from "./Code";
import { field, type Item } from "./connected";
import { groupOfItem } from "./Inbox";
import { groupByState } from "./Issues";
import { boxOf, displayName } from "./Mail";
import { sessionDiff, todosOf } from "./Sessions";

const item = (patch: Partial<Item>): Item => ({
  id: "i", source: "github", domain: "code", kind: "pull_request", external_id: "1", flags: [], importance: 10, data: {}, synced_at: "2026-11-09T10:00:00Z", ...patch,
});

describe("connected data", () => {
  it("shows pages only for configured domains", () => {
    const items = visibleNav(new Set(["mail"])).flatMap((group) => group.items.map((entry) => entry.view));
    expect(items).toContain("mail");
    expect(items).toContain("inbox");
    expect(items).not.toContain("calendar");
    expect(visibleNav(new Set()).flatMap((group) => group.items.map((entry) => entry.view))).not.toContain("inbox");
    expect(parseRoute("#linear/x")).toEqual({ view: "issues", param: "x" });
  });

  it("sorts inbox items by their strongest reason", () => {
    expect(groupOfItem(item({ flags: ["review_requested", "mention"] }))).toBe("review");
    expect(groupOfItem(item({ domain: "issues", flags: ["assigned"] }))).toBe("assigned");
    expect(groupOfItem(item({ domain: "mail", flags: ["unread"] }))).toBe("mail");
  });

  it("reads mail boxes, names and data fields", () => {
    expect(boxOf(item({ flags: ["important"] }), "important")).toBe(true);
    expect(boxOf(item({ flags: [] }), "unread")).toBe(false);
    expect(displayName('"Jane Doe" <jane@example.com>')).toBe("Jane Doe");
    expect(displayName("jane@example.com")).toBe("jane@example.com");
    expect(field(item({ data: { number: 42, empty: "" } }), "number")).toBe("42");
    expect(field(item({ data: { empty: "" } }), "empty")).toBeUndefined();
  });

  it("lays out events and finds free time", () => {
    expect(weekStart(new Date(2026, 10, 12)).getDate()).toBe(9);
    expect(place(new Date(2026, 10, 9, 9, 30), new Date(2026, 10, 9, 11, 0))).toEqual({ top: 2.5, height: 1.5 });
    const day = new Date(2026, 10, 9);
    const slots = freeSlots([{ starts_at: new Date(2026, 10, 9, 10).toISOString(), ends_at: new Date(2026, 10, 9, 12).toISOString() }], day);
    expect(slots.map(([a, b]) => [a.getHours(), b.getHours()])).toEqual([[9, 10], [12, 18]]);
  });

  it("groups issues in workflow order", () => {
    const groups = groupByState([item({ id: "a", state: "Done" }), item({ id: "b", state: "In Progress" }), item({ id: "c", state: "Todo" })]);
    expect(groups.map(([state]) => state)).toEqual(["In Progress", "Todo", "Done"]);
  });

  it("reads checks and changed files of pull requests", () => {
    expect(checkState(item({}), [item({ state: "success" })])).toBe("ok");
    expect(checkState(item({}), [item({ state: "in_progress" })])).toBe("run");
    expect(checkState(item({ flags: ["failed"] }))).toBe("fail");
    const file = fileDiff(item({ kind: "file", data: { filename: "src/a.ts", patch: "@@ -1,2 +1,2 @@\n a\n-b\n+c" } }));
    expect(file).toMatchObject({ path: "src/a.ts", add: 1, del: 1 });
  });

  it("pairs lines side by side", () => {
    const rows = splitRows({ head: "", o: 1, n: 1, lines: [[" ", "a"], ["-", "b"], ["+", "c"], ["+", "d"]] });
    expect(rows.map(([left, right]) => [left?.text ?? null, right?.text ?? null])).toEqual([["a", "a"], ["b", "c"], [null, "d"]]);
  });

  it("reads session todos and diffs", () => {
    expect(todosOf({ todos: [{ content: "Write test", status: "completed" }] })).toHaveLength(1);
    expect(todosOf(null)).toEqual([]);
    expect(sessionDiff({ path: "a.rs", edits: 1, diff: "@@ -1 +1 @@\n-x\n+y", changed_at: "" })).toMatchObject({ path: "a.rs", add: 1, del: 1 });
  });
});
