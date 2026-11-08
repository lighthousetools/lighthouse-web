import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

export type Handler = (request: Request) => unknown;

export function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FEED = { total: 0, counts: {}, groups: {}, alerts: { critical: 0, warning: 0, info: 0 }, items: [] };

/** What every page asks for, answered as an owner of one tenant. Routes passed to `serve` override these. */
export const OWNER = {
  name: "Alex Example",
  email: "alex@example.com",
  email_verified: true,
  user_id: "u1",
  tenant_id: "t1",
  tenant_name: "Acme",
  role: "owner",
  timezone: "Europe/Berlin",
};

const DEFAULTS: Record<string, unknown> = {
  "/me": OWNER,
  "/ready": FEED,
  "/alerts/counts": { critical: 0, warning: 0, info: 0 },
  "/auth/status": { setup_required: false, signup: "closed", email_required: false },
  "/tenants": [{ tenant_id: "t1", tenant_name: "Acme", role: "owner", joined_at: "2026-11-01T10:00:00Z" }],
};

/** A fake server: answers `METHOD /path` with the handler's value (JSON) or Response, and records every request. */
export function serve(routes: Record<string, Handler>) {
  const calls: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const request = typeof input === "string" ? new Request(new URL(input, location.href), init) : input;
      calls.push(request.clone());
      const url = new URL(request.url);
      const handler = routes[`${request.method} ${url.pathname}`];
      if (url.pathname === "/events" && !handler) return new Response("", { status: 200 });
      if (!handler) return json(200, DEFAULTS[url.pathname] ?? []);
      const answer = handler(request);
      return answer instanceof Response ? answer : json(200, answer);
    }),
  );
  return calls;
}

/** The requests to one endpoint, in order. */
export const callsTo = (calls: Request[], method: string, path: string) =>
  calls.filter((call) => call.method === method && new URL(call.url).pathname === path);

export function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{node}</QueryClientProvider>) };
}
