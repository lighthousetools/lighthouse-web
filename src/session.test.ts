import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeader, currentDevice, storeToken } from "./api/client";
import { adopt, canManage, epoch, isOwner, switchTenant } from "./session";
import { orgStore, setOrg } from "./shell/org";
import { callsTo, serve } from "./test/api";

beforeEach(() => storeToken(null));

describe("roles", () => {
  it("let owners and admins manage, and only owners own", () => {
    expect(canManage("owner")).toBe(true);
    expect(canManage("admin")).toBe(true);
    expect(canManage("member")).toBe(false);
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("admin")).toBe(false);
    // Without a role, a 0.1 server or the admin token: the caller acts as an owner.
    expect(canManage(null)).toBe(true);
    expect(isOwner(null)).toBe(true);
  });
});

describe("switching tenants", () => {
  it("takes the new token, signs out the old one and starts over", async () => {
    storeToken("lht_old", "d1");
    setOrg("org-of-the-old-tenant");
    const calls = serve({ "POST /tenants/t2/switch": () => ({ id: "d2", token: "lht_new", tenant_id: "t2", user_id: "u1" }) });
    const client = new QueryClient();
    client.setQueryData(["me"], { name: "old" });
    const before = epoch.get();
    await switchTenant("t2", client);
    expect(authHeader()).toEqual({ Authorization: "Bearer lht_new" });
    expect(currentDevice()).toBe("d2");
    expect(client.getQueryData(["me"])).toBeUndefined();
    expect(orgStore.get()).toBe("");
    expect(epoch.get()).toBe(before + 1);
    const switched = callsTo(calls, "POST", "/tenants/t2/switch")[0]!;
    expect(switched.headers.get("Authorization")).toBe("Bearer lht_old");
    expect(await switched.json()).toEqual({ device_name: "Browser", device_kind: "web" });
    await waitFor(() => expect(callsTo(calls, "POST", "/auth/logout")[0]?.headers.get("Authorization")).toBe("Bearer lht_old"));
  });

  it("does not sign out a token it was not using", () => {
    const calls = serve({});
    adopt({ id: "d3", token: "lht_first" }, new QueryClient());
    expect(authHeader()).toEqual({ Authorization: "Bearer lht_first" });
    expect(callsTo(calls, "POST", "/auth/logout")).toHaveLength(0);
  });
});
