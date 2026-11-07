import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Menu, Seg, VirtualList, brandOf, initials, menuPosition, smoothPath, sparkPoints } from ".";
import { parseUnifiedDiff } from "./diff";
import { duration, clock } from "./live";
import { headingsOf, toggleTask } from "./markdown";
import { filterItems, placePopover } from "./popover";

const view = { width: 1000, height: 800 };
const rect = (left: number, top: number, width = 80, height = 28) =>
  ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;

describe("menu placement", () => {
  it("opens below its trigger and flips up near the bottom", () => {
    expect(menuPosition(rect(100, 100), { width: 200, height: 160 }, view)).toEqual({ left: 100, top: 132 });
    expect(menuPosition(rect(100, 700), { width: 200, height: 160 }, view)).toEqual({ left: 100, top: 536 });
  });

  it("stays inside the window on the right", () => {
    expect(menuPosition(rect(950, 100), { width: 200, height: 100 }, view).left).toBe(792);
  });

  it("places popovers above or to the left when there is no room", () => {
    const anchor = { left: 900, right: 980, top: 700, bottom: 728 };
    expect(placePopover(anchor, { width: 240, height: 200 }, view)).toEqual({ left: 752, top: 496 });
    expect(placePopover(anchor, { width: 240, height: 200 }, view, "right").left).toBe(652);
  });
});

describe("menu", () => {
  it("runs an item, moves with arrow keys and closes on Escape", async () => {
    const run = vi.fn();
    render(<Menu label="Actions" items={[{ label: "First", run }, "sep", { label: "Second", run: () => {} }]} trigger={(open) => <button onClick={open}>Open</button>} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Second");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "First" }));
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("segmented control", () => {
  it("marks the current value and reports changes", async () => {
    const change = vi.fn();
    render(<Seg label="Look" value="a" onChange={change} options={[["a", "Glass"], ["b", "Light", 3]]} />);
    expect(screen.getByRole("button", { name: "Glass" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: /Light/ }));
    expect(change).toHaveBeenCalledWith("b");
  });
});

describe("charts", () => {
  it("scales spark points into the box and keeps flat lines inside", () => {
    expect(sparkPoints([0, 10], 200, 40)).toBe("0,38 200,6");
    expect(sparkPoints([5, 5, 5], 200, 40)).toBe("0,38 100,38 200,38");
  });

  it("draws smooth paths through every point", () => {
    expect(smoothPath([[0, 0], [10, 10]])).toBe("M0 0 C5 0,5 10,10 10");
    expect(smoothPath([])).toBe("");
  });
});

describe("virtual list", () => {
  it("renders only the rows near the view", () => {
    const items = Array.from({ length: 1000 }, (_, index) => `Row ${index}`);
    const { container } = render(<VirtualList items={items} height={30} render={(item) => <span>{item}</span>} style={{ height: 300 }} />);
    const inner = container.firstElementChild!.firstElementChild as HTMLElement;
    expect(inner.style.height).toBe("30000px");
    expect(container.querySelectorAll("span").length).toBeLessThan(50);
    expect(screen.queryByText("Row 999")).toBeNull();
  });
});

describe("helpers", () => {
  it("finds brand marks for connector names", () => {
    expect(brandOf("github")).toBe("github");
    expect(brandOf("mcp:linear")).toBe("linear");
    expect(brandOf("gmail")).toBe("google");
    expect(brandOf("acme-crm")).toBeUndefined();
  });

  it("reads initials and durations", () => {
    expect(initials("Jane  Doe")).toBe("JD");
    expect(duration(843_000)).toBe("14m 03s");
    expect(duration(3_840_000)).toBe("1h 04m");
    expect(clock(42_000)).toBe("0:42");
  });

  it("filters picker items by their text", () => {
    const items = [{ value: 1, label: "Acme" }, { value: 2, label: "Globex", text: "globex corp" }];
    expect(filterItems(items, "corp").map((item) => item.value)).toEqual([2]);
    expect(filterItems(items, " ")).toHaveLength(2);
  });

  it("toggles tasks and lists headings outside code", () => {
    expect(toggleTask("- [ ] a\n- [x] b", 0)).toBe("- [x] a\n- [x] b");
    expect(toggleTask("- [x] b", 0)).toBe("- [ ] b");
    expect(headingsOf("# A\n```\n# not\n```\n## B")).toEqual([{ level: 1, text: "A", line: 0 }, { level: 2, text: "B", line: 4 }]);
  });
});

describe("diff", () => {
  it("reads a unified diff into files, hunks and counts", () => {
    const files = parseUnifiedDiff(
      "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3 +1,3 @@ fn main\n a\n-b\n+c\n+d\n",
    );
    expect(files).toEqual([
      { path: "src/a.ts", add: 2, del: 1, hunks: [{ o: 1, n: 1, head: "fn main", lines: [[" ", "a"], ["-", "b"], ["+", "c"], ["+", "d"]] }] },
    ]);
  });
});
