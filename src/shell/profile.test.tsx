import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeader, storeToken } from "../api/client";
import { callsTo, json, serve, show } from "../test/api";
import { App } from "./App";

const TWO = [
  { tenant_id: "t1", tenant_name: "Acme", role: "owner", joined_at: "2026-11-01T10:00:00Z" },
  { tenant_id: "t2", tenant_name: "Globex", role: "member", joined_at: "2026-11-03T10:00:00Z" },
];

beforeEach(() => {
  storeToken("lht_x", "d1");
  location.hash = "";
});

describe("the profile", () => {
  it("names the user and tenant and switches to another tenant", async () => {
    const calls = serve({ "GET /tenants": () => TWO, "POST /tenants/t2/switch": () => ({ id: "d2", token: "lht_t2", tenant_id: "t2", user_id: "u1" }) });
    show(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Your profile" }));
    const card = await screen.findByRole("dialog", { name: "Your profile" });
    expect(within(card).getByText("alex@example.com")).toBeTruthy();
    expect(within(card).getByText("Globex")).toBeTruthy();
    await userEvent.click(within(card).getByRole("button", { name: /Globex/ }));
    await waitFor(() => expect(authHeader()).toEqual({ Authorization: "Bearer lht_t2" }));
    expect(callsTo(calls, "POST", "/tenants/t2/switch")).toHaveLength(1);
  });

  it("shows the server's reason when it refuses a new workspace", async () => {
    serve({
      "GET /auth/status": () => ({ setup_required: false, signup: "open", email_required: true }),
      "POST /tenants": () => json(403, { error: "your plan allows one workspace" }),
    });
    show(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Your profile" }));
    await userEvent.click(await screen.findByRole("button", { name: "New workspace" }));
    await userEvent.type(screen.getByLabelText("Name"), "Side project");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect((await screen.findByRole("alert")).textContent).toBe("your plan allows one workspace");
    expect(authHeader()).toEqual({ Authorization: "Bearer lht_x" });
  });
});

describe("the rail", () => {
  it("names the current tenant under the avatar once there are several", async () => {
    serve({ "GET /tenants": () => TWO });
    show(<App />);
    expect(await screen.findByTitle("Acme")).toBeTruthy();
  });
});
