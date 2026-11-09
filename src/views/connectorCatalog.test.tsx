import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectorCatalog, matches, setupOf, type PresetConnector } from "./ConnectorCatalog";

const presets: PresetConnector[] = [
  { id: "pipedrive", label: "Pipedrive", vendor: "Pipedrive", category: "crm", url: "https://mcp.example.test/pd", auth: "oauth", registration: "dynamic" },
  { id: "hubspot", label: "HubSpot", vendor: "HubSpot", category: "crm", url: "https://mcp.example.test/hs", auth: "oauth", registration: "preregistered", note: "Create an MCP auth app first." },
  { id: "deel", label: "Deel", vendor: "Deel", category: "hr", url: "https://{account}.example.test/mcp", auth: "bearer" },
  { id: "docs", label: "Docs search", vendor: "Example", category: "docs", url: "https://mcp.example.test/docs", auth: "none" },
];

describe("connector catalog", () => {
  it("names how connecting works", () => {
    expect(presets.map(setupOf)).toEqual(["oneClick", "ownApp", "token", "open"]);
  });

  it("finds by every word of the query", () => {
    expect(matches(presets[0]!, "pipe")).toBe(true);
    expect(matches(presets[0]!, "crm pipe")).toBe(true);
    expect(matches(presets[0]!, "crm hub")).toBe(false);
  });

  it("filters by group and hands the pick over with its note", () => {
    const onPick = vi.fn();
    const { rerender } = render(<ConnectorCatalog presets={presets} onPick={onPick} />);
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(4);
    fireEvent.click(screen.getByRole("tab", { name: /CRM/ }));
    expect(screen.queryByText("Deel")).toBeNull();
    fireEvent.click(screen.getByText("HubSpot"));
    expect(onPick).toHaveBeenCalledWith(presets[1]);
    rerender(<ConnectorCatalog presets={presets} selected="hubspot" onPick={onPick} />);
    expect(screen.getByText("Create an MCP auth app first.")).toBeTruthy();
  });
});
