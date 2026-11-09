import { describe, expect, it } from "vitest";
import { withLevel, withSuggestions } from "./ConnectorTools";

const tool = (name: string, suggested: string) => ({ name, description: "", level: "write", suggested, destructive: false });

describe("connector tools", () => {
  it("take over what the server marks as reading, but never a tool chosen as draft", () => {
    const lists = withSuggestions({ read_tools: ["get_deal"], draft_tools: ["list_drafts"] }, [
      tool("list_deals", "read"),
      tool("list_drafts", "read"),
      tool("send_mail", "write"),
    ]);
    expect(lists).toEqual({ read_tools: ["get_deal", "list_deals"], draft_tools: ["list_drafts"] });
  });

  it("move one tool between levels", () => {
    const start = { read_tools: ["a", "b"], draft_tools: ["c"] };
    expect(withLevel(start, "b", "draft")).toEqual({ read_tools: ["a"], draft_tools: ["b", "c"] });
    expect(withLevel(start, "c", "write")).toEqual({ read_tools: ["a", "b"], draft_tools: [] });
    expect(withLevel(start, "c", "read")).toEqual({ read_tools: ["a", "b", "c"], draft_tools: [] });
  });
});
