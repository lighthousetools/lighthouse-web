import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { storeToken } from "../api/client";
import { OWNER, callsTo, serve, show } from "../test/api";
import { Connections } from "./Connections";

const connector = (name: string, source: string, extra: Record<string, unknown> = {}) => ({
  name,
  transport: "http",
  url: `https://${name}.example.com/mcp`,
  auth: "oauth",
  client_id: null,
  scopes: [],
  read_tools: ["list_issues"],
  draft_tools: [],
  source,
  enabled: true,
  disabled_by: null,
  token_name: null,
  connected: null,
  ...extra,
});

const view = (connectors: unknown[], canManage = true) => ({
  tasks: ["text"],
  can_manage: canManage,
  allow_private_endpoints: false,
  providers: [],
  routing: [],
  connectors,
});

const PRESETS = { providers: [], connectors: [{ id: "linear", label: "Linear", url: "https://mcp.linear.app/mcp", auth: "oauth", read_tools: ["list_issues"], draft_tools: [] }] };

beforeEach(() => {
  storeToken("lht_x");
  location.hash = "#connections";
});

describe("connections", () => {
  it("separate personal and shared ones and show where each comes from", async () => {
    serve({ "GET /settings/effective": () => view([connector("linear", "instance"), connector("mail", "personal", { connected: "personal" })]) });
    show(<Connections />);
    expect(await screen.findByText("Mine")).toBeTruthy();
    expect(screen.getByText("Shared")).toBeTruthy();
    expect(screen.getByText("Connected as you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect linear" })).toBeTruthy();
  });

  it("offer a way to add the first connection instead of a dead end", async () => {
    const calls = serve({
      "GET /settings/effective": () => view([], false),
      "GET /settings/presets": () => PRESETS,
      "GET /me": () => ({ ...OWNER, role: "member" }),
      "PUT /settings/me/connectors/linear": () => new Response(null, { status: 204 }),
    });
    show(<Connections />);
    expect(await screen.findByText("No connections yet")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Add connection" })[0]!);
    expect(await screen.findByText("This applies to you only. Owners and admins change the workspace.")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /^Linear/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Add connection" }).at(-1)!);
    await waitFor(() => expect(callsTo(calls, "PUT", "/settings/me/connectors/linear")).toHaveLength(1));
    const body = await callsTo(calls, "PUT", "/settings/me/connectors/linear")[0]!.json();
    expect(body).toMatchObject({ url: "https://mcp.linear.app/mcp", auth: "oauth", read_tools: ["list_issues"] });
  });

  it("let a member connect a shared service with their own account only", async () => {
    location.hash = "#connections/linear";
    const calls = serve({
      "GET /settings/effective": () => view([connector("linear", "tenant")], false),
      "GET /me": () => ({ ...OWNER, role: "member" }),
      "POST /connectors/linear/connect": () => ({ authorize_url: "https://auth.example.com" }),
    });
    show(<Connections />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect my account" }));
    expect(screen.queryByRole("button", { name: "Connect for everyone" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    await waitFor(() => expect(callsTo(calls, "POST", "/connectors/linear/connect")).toHaveLength(1));
    expect(new URL(callsTo(calls, "POST", "/connectors/linear/connect")[0]!.url).searchParams.get("scope")).toBe("personal");
  });

  it("let owners switch an instance connection off for the workspace", async () => {
    location.hash = "#connections/linear";
    const calls = serve({
      "GET /settings/effective": () => view([connector("linear", "instance")]),
      "PUT /settings/tenant/connectors/linear/enabled": () => new Response(null, { status: 204 }),
    });
    show(<Connections />);
    expect(await screen.findByRole("button", { name: "Connect for everyone" })).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Use in this workspace" }));
    await waitFor(() => expect(callsTo(calls, "PUT", "/settings/tenant/connectors/linear/enabled")).toHaveLength(1));
    expect(await callsTo(calls, "PUT", "/settings/tenant/connectors/linear/enabled")[0]!.json()).toEqual({ enabled: false });
  });
});
