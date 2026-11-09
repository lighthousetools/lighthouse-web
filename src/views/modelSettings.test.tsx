import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { storeToken } from "../api/client";
import { OWNER, callsTo, serve, show } from "../test/api";
import { ModelSettings } from "./ModelSettings";

const VIEW = {
  tasks: ["text"],
  can_manage: true,
  allow_private_endpoints: false,
  providers: [
    {
      name: "anthropic",
      kind: "anthropic",
      base_url: null,
      source: "instance",
      defined_at: "instance",
      key_name: "anthropic",
      key: null,
      needs_key: true,
      own_key: true,
      models: [{ task: "text", model: "server-model", input_eur_per_mtok: 3, output_eur_per_mtok: 15, source: "instance" }],
    },
    {
      name: "local",
      kind: "openai",
      base_url: "https://llm.example.com",
      source: "tenant",
      defined_at: "tenant",
      key_name: "provider:local",
      key: "tenant",
      needs_key: true,
      own_key: false,
      models: [{ task: "text", model: "local-model", input_eur_per_mtok: 0, output_eur_per_mtok: 0, source: "tenant" }],
    },
  ],
  routing: [{ task: "text", provider: "local", model: "local-model", fallback: "anthropic", fallback_model: "server-model", source: "tenant", problem: null }],
  connectors: [],
};

const PRESETS = {
  providers: [{ id: "openai", label: "OpenAI", kind: "openai", key_url: "https://keys.example.com", models: [{ task: "text", model: "suggested", label: "Suggested", input_eur_per_mtok: 1, output_eur_per_mtok: 2 }] }],
  connectors: [],
};

beforeEach(() => {
  storeToken("lht_x");
  location.hash = "#settings/models";
});

const ok = () => new Response(null, { status: 204 });

describe("model settings", () => {
  it("show the routing with its source and let owners reset a workspace route", async () => {
    const calls = serve({ "GET /settings/effective": () => VIEW, "DELETE /settings/tenant/routing/text": ok });
    show(<ModelSettings />);
    expect((await screen.findAllByText("local-model")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0);
    expect(screen.getByText("No key yet")).toBeTruthy();
    expect(screen.getByText("Workspace key")).toBeTruthy();
    expect(screen.getByText("From the server configuration.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset Text to the default" }));
    await waitFor(() => expect(callsTo(calls, "DELETE", "/settings/tenant/routing/text")).toHaveLength(1));
  });

  it("add a provider from a preset with its first model and key", async () => {
    const calls = serve({
      "GET /settings/effective": () => VIEW,
      "GET /settings/presets": () => PRESETS,
      "PUT /settings/tenant/providers/openai": ok,
      "PUT /settings/tenant/providers/openai/models/text": ok,
      "PUT /credentials/provider%3Aopenai": ok,
    });
    show(<ModelSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Add provider" }));
    fireEvent.click(await screen.findByRole("button", { name: "OpenAI" }));
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-test" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(callsTo(calls, "PUT", "/credentials/provider%3Aopenai")).toHaveLength(1));
    expect(await callsTo(calls, "PUT", "/settings/tenant/providers/openai")[0]!.json()).toEqual({ kind: "openai", base_url: null });
    expect(await callsTo(calls, "PUT", "/settings/tenant/providers/openai/models/text")[0]!.json()).toEqual({
      model: "suggested",
      input_eur_per_mtok: 1,
      output_eur_per_mtok: 2,
    });
  });

  it("let members change only their own choice", async () => {
    const calls = serve({
      "GET /settings/effective": () => ({ ...VIEW, can_manage: false }),
      "GET /me": () => ({ ...OWNER, role: "member" }),
      "PUT /settings/me/routing/text": ok,
    });
    show(<ModelSettings />);
    expect(await screen.findByText("You can add your own providers, keys and models. They apply to you only.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset Text to the default" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Add key" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Replace key" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(callsTo(calls, "PUT", "/settings/me/routing/text")).toHaveLength(1));
    expect(await callsTo(calls, "PUT", "/settings/me/routing/text")[0]!.json()).toEqual({ provider: "local", fallback: "anthropic" });
  });
});
