import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeToken } from "./api/client";
import { App } from "./App";
import { Markdown } from "./ui";
import { Approvals } from "./views/Approvals";

type Handler = (request: Request) => unknown;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serve(routes: Record<string, Handler>) {
  const calls: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      const request = input.clone();
      calls.push(request);
      const url = new URL(request.url);
      const handler = routes[`${request.method} ${url.pathname}`];
      if (!handler) return json(200, []);
      const answer = handler(request);
      return answer instanceof Response ? answer : json(200, answer);
    }),
  );
  return calls;
}

function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const approval = {
  id: "a1",
  run_id: "r1",
  agent_id: "mailer",
  tool: "mail.send",
  input: { to: "a@example.com" },
  quotes_external: true,
  status: "pending",
  created_at: "2026-11-06T10:00:00Z",
  expires_at: "2026-11-09T10:00:00Z",
  decided_at: null,
};

beforeEach(() => {
  storeToken(null);
  location.hash = "";
});

describe("sign-in", () => {
  it("signs in and stores the token", async () => {
    const calls = serve({
      "GET /auth/status": () => ({ setup_required: false }),
      "POST /auth/login": () => ({ id: "d1", token: "lht_x" }),
    });
    show(<App />);
    await userEvent.type(await screen.findByLabelText("Password"), "secret password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("heading", { name: "Today" });
    const login = calls.find((call) => call.url.endsWith("/auth/login"));
    expect(await login?.json()).toMatchObject({ device_kind: "web" });
    expect(localStorage.getItem("lighthouse.token")).toBe("lht_x");
  });

  it("shows why a sign-in failed", async () => {
    serve({
      "GET /auth/status": () => ({ setup_required: false }),
      "POST /auth/login": () => json(401, { error: "wrong password" }),
    });
    show(<App />);
    await userEvent.type(await screen.findByLabelText("Password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "wrong password");
  });

  it("explains a server without a password", async () => {
    serve({ "GET /auth/status": () => ({ setup_required: true }) });
    show(<App />);
    expect(await screen.findByText(/no password yet/)).toBeTruthy();
  });

  it("returns to the sign-in when the token stops working", async () => {
    storeToken("lht_old");
    serve({
      "GET /auth/status": () => ({ setup_required: false }),
      "GET /runs": () => json(401, { error: "sign-in required" }),
    });
    show(<App />);
    expect(await screen.findByLabelText("Password")).toBeTruthy();
  });
});

describe("approvals", () => {
  beforeEach(() => storeToken("lht_x"));

  it("warns about external content and sends edited arguments", async () => {
    const calls = serve({
      "GET /approvals": () => [approval],
      "POST /approvals/a1/decision": () => ({ ...approval, status: "approved" }),
    });
    show(<Approvals />);
    expect(await screen.findByText(/external content/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByLabelText("Arguments");
    await userEvent.clear(editor);
    await userEvent.type(editor, '{{"to": "b"}');
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/decision"))).toBe(true));
    const decision = calls.find((call) => call.url.endsWith("/decision"));
    expect(await decision?.json()).toEqual({ approve: true, input: { to: "b" } });
  });

  it("does not send a denial with arguments", async () => {
    const calls = serve({
      "GET /approvals": () => [approval],
      "POST /approvals/a1/decision": () => ({ ...approval, status: "denied" }),
    });
    show(<Approvals />);
    await userEvent.click(await screen.findByRole("button", { name: "Deny" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/decision"))).toBe(true));
    const decision = calls.find((call) => call.url.endsWith("/decision"));
    expect(await decision?.json()).toEqual({ approve: false });
  });

  it("decides permission requests of sessions", async () => {
    const calls = serve({
      "GET /permissions": () => [
        { id: "p1", tool: "Bash", project: "billing", input: { command: "ls" } },
      ],
      "POST /permissions/p1/decision": () => ({ id: "p1" }),
    });
    show(<Approvals />);
    await userEvent.click(await screen.findByRole("button", { name: "Allow" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/decision"))).toBe(true));
  });

  it("says when nothing waits", async () => {
    serve({});
    show(<Approvals />);
    expect(await screen.findByText("Nothing is waiting for you.")).toBeTruthy();
  });
});

describe("markdown", () => {
  it("removes scripts from untrusted reports", () => {
    const { container } = render(<Markdown text={'# Hi\n<img src=x onerror="alert(1)"><script>x</script>'} />);
    expect(container.querySelector("h1")?.textContent).toBe("Hi");
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.querySelector("script")).toBeNull();
  });
});
