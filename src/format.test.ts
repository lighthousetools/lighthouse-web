import { describe, expect, it } from "vitest";
import { agentName, greeting, humanize, isoWeek, plainSnippet, toolName } from "./format";

describe("format", () => {
  it("makes IDs readable", () => {
    expect(humanize("morning-brief")).toBe("Morning brief");
    expect(agentName("morning-brief", { "morning-brief": "Morning Brief" })).toBe("Morning Brief");
    expect(agentName("brain-ask")).toBe("Your question");
    expect(toolName("mail.send_draft")).toBe("Mail: Send draft");
  });

  it("finds ISO weeks and parts of the day", () => {
    expect(isoWeek(new Date(2026, 10, 6))).toBe(45);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
    expect(greeting(8)).toBe("Good morning");
    expect(greeting(23)).toBe("Good evening");
  });

  it("reduces Markdown to one line", () => {
    expect(plainSnippet("# Title\n\n**Bold** and [[Link]]\n| a |")).toBe("Title Bold and Link");
  });
});
