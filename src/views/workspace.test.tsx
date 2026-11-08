import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeader, isSignedIn, storeToken, type Schemas } from "../api/client";
import { toasts } from "../shell/state";
import { OWNER, callsTo, json, serve, show } from "../test/api";
import { Settings, sectionsFor } from "./Settings";
import { grantable, mayChange } from "./Workspace";

const MEMBER = { ...OWNER, name: "Bob Example", email: "bob@example.com", user_id: "u2", role: "member" };
const MEMBERS: Schemas["Member"][] = [
  { user_id: "u1", email: "alex@example.com", name: "Alex Example", role: "owner", joined_at: "2026-11-01T10:00:00Z" },
  { user_id: "u2", email: "bob@example.com", name: "Bob Example", role: "member", joined_at: "2026-11-02T10:00:00Z" },
];
const TENANT = { id: "t1", name: "Acme", created_at: "2026-11-01T10:00:00Z", role: "owner", members: 2 };
const TWO = [
  { tenant_id: "t1", tenant_name: "Acme", role: "owner", joined_at: "2026-11-01T10:00:00Z" },
  { tenant_id: "t2", tenant_name: "Globex", role: "member", joined_at: "2026-11-03T10:00:00Z" },
];
const noContent = () => new Response(null, { status: 204 });

beforeEach(() => {
  storeToken("lht_x", "d1");
  location.hash = "";
});

describe("roles in the settings", () => {
  it("hand out the owner role only from owners and protect owners from admins", () => {
    expect(grantable("owner")).toEqual(["owner", "admin", "member"]);
    expect(grantable("admin")).toEqual(["admin", "member"]);
    const owner = MEMBERS[0]!;
    const member = MEMBERS[1]!;
    expect(mayChange("admin", owner, "u3")).toBe(false);
    expect(mayChange("admin", member, "u3")).toBe(true);
    expect(mayChange("owner", owner, "u3")).toBe(true);
    expect(mayChange("owner", owner, "u1")).toBe(false);
    expect(mayChange("member", member, "u1")).toBe(false);
  });

  it("hide the costs per member from members", () => {
    expect(sectionsFor("member").map((section) => section.id)).not.toContain("costs");
    expect(sectionsFor("admin").map((section) => section.id)).toContain("costs");
  });

  it("show members the workspace and keys read-only", async () => {
    location.hash = "#settings/workspace";
    serve({ "GET /me": () => MEMBER, "GET /tenant": () => ({ ...TENANT, role: "member" }), "GET /tenant/members": () => MEMBERS });
    const view = show(<Settings />);
    expect(await screen.findByText("Bob Example", { selector: ".st-row b" })).toBeTruthy();
    expect(screen.getByText(/Only owners and admins change the workspace/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete workspace" })).toBeNull();
    expect(screen.getByRole("button", { name: "Leave workspace" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Costs" })).toBeNull();
    view.unmount();

    location.hash = "#settings/credentials";
    serve({ "GET /me": () => MEMBER, "GET /credentials": () => ["anthropic"] });
    show(<Settings />);
    expect(await screen.findByText("anthropic")).toBeTruthy();
    expect(screen.getByText(/Only owners and admins add or remove keys/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Store" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete anthropic" })).toBeNull();
  });
});

describe("the workspace", () => {
  it("invites by email and shows the link to pass on when the server sends no mail", async () => {
    location.hash = "#settings/workspace";
    const calls = serve({
      "GET /tenant": () => TENANT,
      "GET /tenant/members": () => MEMBERS,
      "POST /tenant/invitations": () => json(201, {
        invitation: { id: "i1", email: "cy@example.com", role: "admin", created_at: "2026-11-08T10:00:00Z", expires_at: "2026-11-15T10:00:00Z" },
        mailed: false,
        accept_url: "http://localhost/#/invite?token=lhi_x",
      }),
    });
    show(<Settings />);
    await userEvent.type(await screen.findByLabelText("Email"), "cy@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Role" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Admin" }));
    await userEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText("http://localhost/#/invite?token=lhi_x")).toBeTruthy();
    expect(screen.getByText(/Pass this link on to cy@example.com/)).toBeTruthy();
    expect(await callsTo(calls, "POST", "/tenant/invitations")[0]!.json()).toEqual({ email: "cy@example.com", role: "admin" });
  });

  it("changes a role, withdraws an invitation and shows the server's refusal", async () => {
    location.hash = "#settings/workspace";
    const calls = serve({
      "GET /tenant": () => TENANT,
      "GET /tenant/members": () => MEMBERS,
      "GET /tenant/invitations": () => [{ id: "i1", email: "cy@example.com", role: "member", created_at: "2026-11-08T10:00:00Z", expires_at: "2026-11-15T10:00:00Z" }],
      "PATCH /tenant/members/u2": () => json(409, { error: "a tenant needs at least one owner" }),
      "DELETE /tenant/invitations/i1": noContent,
    });
    show(<Settings />);
    await userEvent.click(await screen.findByRole("button", { name: "Role of Bob Example" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Admin" }));
    // The refusal comes back as a toast, which the shell shows.
    await waitFor(() => expect(toasts.get().map((item) => item.text)).toContain("a tenant needs at least one owner"));
    expect(await callsTo(calls, "PATCH", "/tenant/members/u2")[0]!.json()).toEqual({ role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(callsTo(calls, "DELETE", "/tenant/invitations/i1")).toHaveLength(1));
  });

  it("deletes the workspace only with its name typed, then moves to another one", async () => {
    location.hash = "#settings/workspace";
    const calls = serve({
      "GET /tenant": () => TENANT,
      "GET /tenant/members": () => MEMBERS,
      "GET /tenants": () => TWO,
      "POST /tenants/t2/switch": () => ({ id: "d2", token: "lht_t2", tenant_id: "t2", user_id: "u1" }),
      "DELETE /tenant": noContent,
    });
    show(<Settings />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete workspace" }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete workspace" }) as HTMLButtonElement;
    await userEvent.type(within(dialog).getByLabelText("Name of the workspace"), "Acm");
    expect(confirm.disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText("Name of the workspace"), "e");
    await userEvent.click(confirm);
    await waitFor(() => expect(authHeader()).toEqual({ Authorization: "Bearer lht_t2" }));
    const deleted = callsTo(calls, "DELETE", "/tenant")[0]!;
    expect(deleted.headers.get("Authorization")).toBe("Bearer lht_x");
    expect(await deleted.json()).toEqual({ confirm: "Acme" });
  });

  it("signs out after leaving the only workspace", async () => {
    location.hash = "#settings/workspace";
    serve({ "GET /me": () => MEMBER, "GET /tenant": () => ({ ...TENANT, role: "member" }), "GET /tenant/members": () => MEMBERS, "DELETE /tenant/members/u2": noContent });
    show(<Settings />);
    await userEvent.click(await screen.findByRole("button", { name: "Leave workspace" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Leave workspace" }));
    await waitFor(() => expect(isSignedIn()).toBe(false));
  });

  it("lists the costs per member by name", async () => {
    location.hash = "#settings/costs";
    serve({
      "GET /tenant/members": () => MEMBERS,
      "GET /costs/users": () => [
        { user_id: "u2", runs: 4, cost_eur: 1.5, input_tokens: 1000, output_tokens: 200 },
        { user_id: null, runs: 1, cost_eur: 0.25, input_tokens: 10, output_tokens: 5 },
      ],
    });
    show(<Settings />);
    expect(await screen.findByText("Bob Example")).toBeTruthy();
    expect(screen.getByText("Without a member")).toBeTruthy();
    expect(screen.getByText("5 runs")).toBeTruthy();
  });
});

describe("the account", () => {
  it("keeps the sign-in when the current password is wrong", async () => {
    location.hash = "#settings/account";
    serve({ "POST /auth/password": () => json(401, { error: "wrong email or password" }) });
    show(<Settings />);
    await userEvent.type(await screen.findByLabelText("Current password"), "not it");
    await userEvent.type(screen.getByLabelText("New password"), "a brand new password");
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(await screen.findByText("wrong email or password")).toBeTruthy();
    expect(isSignedIn()).toBe(true);
  });

  it("deletes the account only with its email typed", async () => {
    location.hash = "#settings/account";
    const calls = serve({ "DELETE /me": noContent });
    show(<Settings />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Your email address"), "Alex@Example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(isSignedIn()).toBe(false));
    expect(await callsTo(calls, "DELETE", "/me")[0]!.json()).toEqual({ confirm: "Alex@Example.com" });
  });

  it("marks this browser among the devices", async () => {
    location.hash = "#settings/devices";
    serve({ "GET /auth/devices": () => [{ id: "d1", name: "Browser", kind: "web", tenant_id: "t1", created_at: "2026-11-01T10:00:00Z", last_used_at: null }] });
    show(<Settings />);
    expect(await screen.findByText("This browser")).toBeTruthy();
  });
});
