import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timeline } from "./Sessions";

const event = (kind: string, summary: string | null, minute: number) => ({
  id: `e${minute}`, session_id: "s1", kind, tool: kind === "tool" ? "Bash" : null, summary, file_path: null, detail: {},
  created_at: `2026-11-09T22:${String(minute).padStart(2, "0")}:00Z`,
});

describe("session timeline", () => {
  it("shows what the session said between tool calls and its whole answer, formatted", () => {
    const detail = {
      timeline: [
        event("prompt", "Merge the release branch", 1),
        event("say", "Checking **CI** first.", 2),
        event("tool", "gh run list", 3),
        event("stop", "V40 is through.\n\n- Deploy runs\n- CI runs", 4),
      ],
      messages: [],
    } as unknown as Parameters<typeof Timeline>[0]["detail"];
    render(<Timeline detail={detail} />);
    expect(screen.getByText("CI").tagName).toBe("STRONG");
    expect(screen.getByText("Deploy runs").tagName).toBe("LI");
    expect(screen.getByText("gh run list")).toBeTruthy();
  });
});
