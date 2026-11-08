import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api, authHeader, must, storeToken, type Schemas } from "./api/client";
import { useMe } from "./data";
import { setOrg } from "./shell/org";
import { createStore } from "./store";

export type Role = Schemas["Role"];

/** This browser's name and kind on every token it asks for. */
export const DEVICE = { device_name: "Browser", device_kind: "web" } as const;

/** Bumped whenever the token changes tenant, so the shell starts over with the new tenant's data. */
export const epoch = createStore(0);

/**
 * Owners and admins change the tenant: members, invitations, keys, connectors and the budget. Without a role (a 0.1
 * server or the admin token) the caller acts as an owner.
 */
export const canManage = (role: Role | null | undefined) => role !== "member";

export const isOwner = (role: Role | null | undefined) => role == null || role === "owner";

/** The caller's role in the current tenant: `null` without one, and `member` until it is known, so nothing offers more than it may. */
export function useRole(): Role | null {
  const me = useMe();
  if (!me.data) return "member";
  return me.data.role ?? null;
}

/** The public sign-in state: whether an email is needed and who may sign up. */
export function useAuthStatus() {
  return useQuery({ queryKey: ["auth-status"], queryFn: () => must(api.GET("/auth/status")), staleTime: 60_000 });
}

/** The tenants of the signed-in user. */
export function useTenants() {
  return useQuery({ queryKey: ["tenants"], queryFn: () => must(api.GET("/tenants")) });
}

/**
 * Takes a token for another tenant: stores it, signs out the token it replaces so devices do not pile up, and drops
 * every cached answer of the old tenant.
 */
export function adopt(issued: Schemas["TokenIssued"], client: QueryClient) {
  const previous = authHeader();
  storeToken(issued.token, issued.id);
  if (previous.Authorization && previous.Authorization !== `Bearer ${issued.token}`) {
    void globalThis.fetch("/auth/logout", { method: "POST", headers: previous }).catch(() => undefined);
  }
  setOrg("");
  client.clear();
  epoch.set((value) => value + 1);
}

/** Switches this browser to another tenant of the user. */
export async function switchTenant(id: string, client: QueryClient) {
  const issued = await must(api.POST("/tenants/{id}/switch", { params: { path: { id } }, body: DEVICE }));
  adopt(issued, client);
}

/** Signs this browser out and forgets everything it loaded. */
export async function signOut(client?: QueryClient) {
  await api.POST("/auth/logout").catch(() => undefined);
  storeToken(null);
  client?.clear();
}
