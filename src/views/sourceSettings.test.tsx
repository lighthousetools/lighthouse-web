import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { storeToken } from "../api/client";
import { sourceName } from "../format";
import { OWNER, callsTo, serve, show } from "../test/api";
import { SkillSettings } from "./SkillSettings";
import { SourceSettings } from "./SourceSettings";

const ok = () => new Response(null, { status: 204 });
const source = (name: string, layer: string, key = name) => ({ name, key, connector: "demo", domain: "mail", preset: null, interval: null, source: layer, enabled: true, disabled_by: null, definition: layer === "instance" ? null : { connector: "demo" } });
const connector = { name: "demo", transport: "stdio", url: null, auth: "process", client_id: null, scopes: [], read_tools: ["list_threads"], draft_tools: [], source: "instance", enabled: true, disabled_by: null, token_name: null, connected: "instance" };
const view = (sources: unknown[]) => ({ tasks: ["text"], can_manage: false, allow_private_endpoints: false, providers: [], routing: [], connectors: [connector], sources });
const member = () => ({ ...OWNER, role: "member" });

beforeEach(() => {
  storeToken("lht_x");
});

describe("sources", () => {
  it("separate a member's own from shared ones they cannot change", async () => {
    serve({
      "GET /me": member,
      "GET /settings/effective": () => view([source("inbox", "personal", "inbox@01a1bfe0-638f-7699-a83b-d9a964934dfa"), source("team", "instance")]),
      "GET /connected/sources": () => [{ name: "team", problem: "connector `x` is switched off" }],
    });
    show(<SourceSettings />);
    expect(await screen.findByText("inbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit inbox" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit team" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "team in use" })).toBeNull();
    expect(await screen.findByText("connector `x` is switched off")).toBeTruthy();
  });

  it("add one from a suggestion with the chosen connection", async () => {
    const calls = serve({
      "GET /me": member,
      "GET /settings/effective": () => view([]),
      "GET /settings/presets": () => ({ providers: [], connectors: [], sources: [{ id: "mail", label: "Mail", definition: { connector: "mail", domain: "mail" } }] }),
      "PUT /settings/me/sources/mail": ok,
    });
    show(<SourceSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Add source" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mail" }));
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled, "no connection yet").toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Connection" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(callsTo(calls, "PUT", "/settings/me/sources/mail")).toHaveLength(1));
    expect(await callsTo(calls, "PUT", "/settings/me/sources/mail")[0]!.json()).toEqual({ definition: { connector: "demo", domain: "mail" }, enabled: true });
  });

  it("show a personal source under the name its owner gave it", () => {
    expect(sourceName("mail@01a1bfe0-638f-7699-a83b-d9a964934dfa")).toBe("mail");
    expect(sourceName("mail")).toBe("mail");
    expect(sourceName("me@example")).toBe("me@example");
  });
});

describe("skills", () => {
  it("let a member switch a built-in one for themselves and remove their own", async () => {
    const calls = serve({
      "GET /me": member,
      "GET /skills": () => [
        { name: "built", description: "From the server", layer: "instance", enabled: true, disabled_by: null, source: null },
        { name: "mine", description: "My own", layer: "personal", enabled: true, disabled_by: null, source: "x" },
      ],
      "PUT /settings/me/skills/built/enabled": ok,
      "DELETE /settings/me/skills/mine": ok,
    });
    show(<SkillSettings />);
    expect(await screen.findByText("From the server")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove built" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "built for me" }));
    await waitFor(() => expect(callsTo(calls, "PUT", "/settings/me/skills/built/enabled")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Remove mine" }));
    await waitFor(() => expect(callsTo(calls, "DELETE", "/settings/me/skills/mine")).toHaveLength(1));
  });
});
