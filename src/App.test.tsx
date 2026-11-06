import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { askStream, storeToken, type Schemas } from "./api/client";
import { App } from "./App";
import { setLanguage } from "./i18n";
import { Markdown, renderMarkdown } from "./ui";
import { Approvals } from "./views/Approvals";
import { plainFields } from "./views/Decisions";

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
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const request = typeof input === "string" ? new Request(new URL(input, location.href), init) : input;
      calls.push(request.clone());
      const url = new URL(request.url);
      const handler = routes[`${request.method} ${url.pathname}`];
      if (url.pathname === "/events" && !handler) return new Response("", { status: 200 });
      if (!handler) return json(200, url.pathname === "/me" ? { name: "Alex Example" } : []);
      const answer = handler(request);
      return answer instanceof Response ? answer : json(200, answer);
    }),
  );
  return calls;
}

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const approval: Schemas["Approval"] = {
  id: "a1",
  run_id: "r1",
  agent_id: "mail-agent",
  tool: "mail.send_draft",
  input: { to: "a@example.com", subject: "Offer", priority: 2 },
  quotes_external: true,
  reason: "The customer asked for an offer.",
  consulted: ["crm.get_deal"],
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
  it("signs in and greets the owner by first name", async () => {
    const calls = serve({
      "GET /auth/status": () => ({ setup_required: false }),
      "POST /auth/login": () => ({ id: "d1", token: "lht_x" }),
    });
    show(<App />);
    await userEvent.type(await screen.findByLabelText("Password"), "secret password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("heading", { level: 1, name: /Alex$/ });
    const login = calls.find((call) => call.url.endsWith("/auth/login"));
    expect(await login?.json()).toMatchObject({ device_kind: "web" });
  });

  it("shows why a sign-in failed", async () => {
    serve({
      "GET /auth/status": () => ({ setup_required: false }),
      "POST /auth/login": () => json(401, { error: "wrong password" }),
    });
    show(<App />);
    await userEvent.type(await screen.findByLabelText("Password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("wrong password");
  });

  it("offers the language before sign-in and switches everything", async () => {
    serve({ "GET /auth/status": () => ({ setup_required: false }) });
    show(<App />);
    await userEvent.selectOptions(await screen.findByLabelText("Language"), "de");
    expect(await screen.findByRole("button", { name: "Anmelden" })).toBeTruthy();
    setLanguage("en");
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

describe("today", () => {
  it("counts the same things in the subtitle, the section and the badge", async () => {
    storeToken("lht_x");
    serve({
      "GET /approvals": () => [approval],
      "GET /sessions": () => [{
        id: "s1", node_id: "n1", node_name: "Mac", project: "billing", branch: null,
        status: "waiting", summary: null, cost_eur: 0, started_at: "2026-11-06T10:00:00Z",
        updated_at: "2026-11-06T10:00:00Z",
      }],
    });
    show(<App />);
    expect(await screen.findByText("2 things need you")).toBeTruthy();
    const section = (await screen.findByRole("heading", { name: /Needs you/ })).closest("section")!;
    expect(within(section).getByText("billing")).toBeTruthy();
  });
});

describe("approvals", () => {
  beforeEach(() => storeToken("lht_x"));

  it("explains a proposal in plain language", async () => {
    serve({ "GET /approvals": () => [approval] });
    show(<Approvals />);
    expect(await screen.findByRole("heading", { name: "Mail: Send draft" })).toBeTruthy();
    expect(screen.getByText("Subject")).toBeTruthy();
    expect(screen.getByText("Offer")).toBeTruthy();
    expect(screen.getByText(/The customer asked/)).toBeTruthy();
    expect(screen.getByText(/external content/)).toBeTruthy();
    expect(screen.getByText(/Crm: Get deal/)).toBeTruthy();
    expect(screen.getByText("Mail agent proposes", { exact: false })).toBeTruthy();
  });

  it("lists fields without raw values for known types", () => {
    expect(plainFields({ nested: { a: 1 }, subject: "x", empty: "", to: ["a", "b"] })).toEqual([
      { key: "to", label: "To", value: "a, b" },
      { key: "subject", label: "Subject", value: "x" },
      { key: "nested", label: "nested", value: '{"a":1}' },
    ]);
    expect(plainFields(null)).toEqual([]);
  });

  it("sends edited arguments and refuses broken JSON", async () => {
    const calls = serve({
      "GET /approvals": () => [approval],
      "POST /approvals/a1/decision": () => ({ ...approval, status: "approved" }),
    });
    show(<Approvals />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = screen.getByLabelText("Arguments as JSON");
    await userEvent.clear(editor);
    await userEvent.type(editor, "{{broken");
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not valid JSON");
    await userEvent.clear(editor);
    await userEvent.type(editor, '{{"to": "b"}');
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/decision"))).toBe(true));
    const decision = calls.find((call) => call.url.endsWith("/decision"));
    expect(await decision?.json()).toEqual({ approve: true, input: { to: "b" } });
  });

  it("decides permission requests of sessions", async () => {
    const calls = serve({
      "GET /permissions": () => [{ id: "p1", tool: "Bash", project: "billing", input: { command: "ls" } }],
      "POST /permissions/p1/decision": () => ({ id: "p1" }),
    });
    show(<Approvals />);
    expect(await screen.findByText("Command")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/decision"))).toBe(true));
  });

  it("says when nothing waits", async () => {
    serve({});
    show(<Approvals />);
    expect(await screen.findByText("Nothing is waiting for you.")).toBeTruthy();
  });
});

describe("streamed answers", () => {
  const sse = (text: string) =>
    new Response(text, { headers: { "Content-Type": "text/event-stream" } });

  it("deliver text and end with sources", async () => {
    serve({
      "POST /brain/ask/stream": () =>
        sse('event: delta\ndata: {"text":"Hel"}\n\nevent: delta\ndata: {"text":"lo"}\n\nevent: done\ndata: {"run_id":"r","answer":"Hello","sources":[]}\n\n'),
    });
    const pieces: string[] = [];
    const answer = await askStream("hi", (piece) => pieces.push(piece));
    expect(pieces).toEqual(["Hel", "lo"]);
    expect(answer.answer).toBe("Hello");
  });

  it("report a failure", async () => {
    serve({ "POST /brain/ask/stream": () => sse('event: failed\ndata: {"error":"no model"}\n\n') });
    await expect(askStream("hi", () => {})).rejects.toThrow("no model");
  });
});

describe("markdown", () => {
  it("removes scripts from untrusted reports", () => {
    const { container } = render(<Markdown text={'# Hi\n<img src=x onerror="alert(1)"><script>x</script>'} />);
    expect(container.querySelector("h1")?.textContent).toBe("Hi");
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.querySelector("script")).toBeNull();
  });

  it("turns wiki links into safe links that report their title", async () => {
    expect(renderMarkdown('[[A "b" <c>]]')).not.toContain("<c>");
    const follow = vi.fn();
    render(<Markdown text="See [[Tax logic]]" onWikiLink={follow} />);
    await userEvent.click(screen.getByRole("link", { name: "Tax logic" }));
    expect(follow).toHaveBeenCalledWith("Tax logic");
  });
});
