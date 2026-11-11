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

  it("add a REST API from the catalog with how its key is sent", async () => {
    const calls = serve({
      "GET /settings/effective": () => view([], false),
      "GET /settings/presets": () => ({
        providers: [],
        connectors: [
          {
            id: "pipedrive",
            label: "Pipedrive",
            url: "https://developers.example.com/openapi.yaml",
            auth: "bearer",
            api: { key: "header", key_name: "x-api-token" },
            read_tools: [],
            draft_tools: [],
          },
        ],
      }),
      "GET /me": () => ({ ...OWNER, role: "member" }),
      "PUT /settings/me/connectors/pipedrive": () => new Response(null, { status: 204 }),
    });
    show(<Connections />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Add connection" }))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /^Pipedrive/ }));
    expect(await screen.findByLabelText("URL of the OpenAPI description")).toBeTruthy();
    expect((screen.getByLabelText("Name of the header or parameter") as HTMLInputElement).value).toBe("x-api-token");
    fireEvent.click(screen.getAllByRole("button", { name: "Add connection" }).at(-1)!);
    await waitFor(() => expect(callsTo(calls, "PUT", "/settings/me/connectors/pipedrive")).toHaveLength(1));
    const body = await callsTo(calls, "PUT", "/settings/me/connectors/pipedrive")[0]!.json();
    expect(body).toMatchObject({
      url: "https://developers.example.com/openapi.yaml",
      auth: "bearer",
      client_id: null,
      api: { key: "header", key_name: "x-api-token", base_url: null, operations: [] },
    });
  });

  it("describe a REST API by its key", async () => {
    location.hash = "#connections/crm";
    serve({
      "GET /settings/effective": () =>
        view([connector("crm", "tenant", { transport: "openapi", auth: "bearer", token_name: "mcp:crm", api: { key: "query", key_name: "api_token" } })]),
    });
    show(<Connections />);
    expect(await screen.findByText("REST API, key stored as mcp:crm.")).toBeTruthy();
  });

  it("store the client secret of a registered OAuth app", async () => {
    location.hash = "#connections/github";
    const calls = serve({
      "GET /settings/effective": () => view([connector("github", "tenant", { client_id: "Iv1.abc" })], false),
      "GET /me": () => ({ ...OWNER, role: "member" }),
      "PUT /me/credentials/oauth-client%3Agithub": () => new Response(null, { status: 204 }),
    });
    show(<Connections />);
    fireEvent.click(await screen.findByRole("button", { name: "Client secret" }));
    fireEvent.change(await screen.findByLabelText("Value"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Store" }));
    await waitFor(() => expect(callsTo(calls, "PUT", "/me/credentials/oauth-client%3Agithub")).toHaveLength(1));
    expect(await callsTo(calls, "PUT", "/me/credentials/oauth-client%3Agithub")[0]!.json()).toEqual({ value: "s3cret" });
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
