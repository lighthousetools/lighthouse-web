import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { askStream, storeToken, type Schemas } from "./api/client";
import { App } from "./shell/App";
import { setLanguage } from "./i18n";
import { Markdown } from "./ui/markdown";
import { Ready } from "./views/Ready";
import { plainFields } from "./views/Decisions";

type Handler = (request: Request) => unknown;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EMPTY_FEED = { total: 0, counts: {}, groups: {}, alerts: { critical: 0, warning: 0, info: 0 }, items: [] };
const DEFAULTS: Record<string, unknown> = {
  "/me": { name: "Alex Example" },
  "/ready": EMPTY_FEED,
  "/alerts/counts": { critical: 0, warning: 0, info: 0 },
};

/** The ready feed as the server builds it from approvals and permission requests. */
function feed(approvals: Schemas["Approval"][], permissions: Record<string, unknown>[] = []) {
  const items = [
    ...approvals.map((item) => ({ kind: "approval", group: "decisions", id: item.id, title: item.tool, summary: item.reason, agent_id: item.agent_id, run_id: item.run_id, created_at: item.created_at, expires_at: item.expires_at, detail: item })),
    ...permissions.map((item) => ({ kind: "permission", group: "decisions", id: item.id, title: "Claude Code", summary: null, agent_id: null, run_id: null, created_at: "2026-11-06T10:00:00Z", expires_at: null, detail: item })),
  ];
  return { ...EMPTY_FEED, total: items.length, items };
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
      if (!handler) return json(200, DEFAULTS[url.pathname] ?? []);
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
    await screen.findByRole("heading", { level: 1, name: /Alex\.?$/ });
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
    await userEvent.click(await screen.findByRole("button", { name: "Language" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Deutsch" }));
    expect(await screen.findByRole("button", { name: "Anmelden" })).toBeTruthy();
    setLanguage("en");
  });

  it("returns to the sign-in when the token stops working", async () => {
    storeToken("lht_old");
    serve({
      "GET /auth/status": () => ({ setup_required: false }),
      "GET /ready": () => json(401, { error: "sign-in required" }),
    });
    show(<App />);
    expect(await screen.findByLabelText("Password")).toBeTruthy();
  });
});

describe("ready", () => {
  it("counts what is ready in the lead, the queue and the badge", async () => {
    storeToken("lht_x");
    serve({ "GET /ready": () => feed([approval, { ...approval, id: "a2", tool: "slack.post" }]) });
    show(<App />);
    expect(await screen.findByText(/2 things, about/)).toBeTruthy();
    // Both items are in the queue, each under its subject.
    expect(screen.getAllByText("Offer").length).toBeGreaterThan(1);
  });

  it("accepts a proposed task", async () => {
    storeToken("lht_x");
    const task = { id: "t1", title: "Call Jane", priority: 0, status: "proposed", position: 1, origin: "agent", created_at: "2026-11-06T10:00:00Z", updated_at: "2026-11-06T10:00:00Z", agent_id: "inbox", notes: null, source: null };
    const calls = serve({
      "GET /ready": () => ({ ...EMPTY_FEED, total: 1, items: [{ kind: "task", group: "suggestions", id: "t1", title: "Call Jane", summary: null, agent_id: "inbox", run_id: null, created_at: task.created_at, expires_at: null, detail: task }] }),
      "POST /tasks/t1/accept": () => ({ ...task, status: "open" }),
    });
    show(<Ready />);
    await userEvent.click(await screen.findByRole("button", { name: /^Accept/ }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/tasks/t1/accept"))).toBe(true));
  });
});

describe("approvals", () => {
  beforeEach(() => storeToken("lht_x"));

  it("explains a proposal in plain language", async () => {
    serve({ "GET /ready": () => feed([approval]) });
    show(<Ready />);
    // A mail shows its subject as the heading, the recipient as the counterpart, and the rest under plain labels.
    expect(await screen.findByRole("heading", { name: "Offer" })).toBeTruthy();
    expect(screen.getAllByText("a@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Priority")).toBeTruthy();
    expect(screen.getByText(/The customer asked/)).toBeTruthy();
    expect(screen.getByText(/outside content/)).toBeTruthy();
    expect(screen.getByText("Pipeline", { selector: ".rea-srcchip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Send/ })).toBeTruthy();
  });

  it("lists fields without raw values for known types", () => {
    expect(plainFields({ nested: { a: 1 }, subject: "x", empty: "", to: ["a", "b"] })).toEqual([
      { key: "to", label: "To", value: "a, b" },
      { key: "subject", label: "Subject", value: "x" },
      { key: "nested", label: "Nested", value: '{"a":1}' },
    ]);
    expect(plainFields(null)).toEqual([]);
  });

  it("sends edited arguments and refuses broken JSON", async () => {
    const calls = serve({
      "GET /ready": () => feed([approval]),
      "POST /approvals/a1/decision": () => ({ ...approval, status: "approved" }),
    });
    show(<Ready />);
    await userEvent.click(await screen.findByRole("button", { name: /^Edit/ }));
    const editor = screen.getByLabelText("Arguments as JSON");
    await userEvent.clear(editor);
    await userEvent.type(editor, "{{broken");
    await userEvent.click(screen.getByRole("button", { name: /^Send/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("not valid JSON");
    await userEvent.clear(editor);
    await userEvent.type(editor, '{{"to": "b"}');
    await userEvent.click(screen.getByRole("button", { name: /^Send/ }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/decision"))).toBe(true));
    const decision = calls.find((call) => call.url.endsWith("/decision"));
    expect(await decision?.json()).toEqual({ approve: true, input: { to: "b" } });
  });

  it("decides permission requests of sessions", async () => {
    const calls = serve({
      "GET /ready": () => feed([], [{ id: "p1", tool: "Bash", project: "billing", input: { command: "ls" } }]),
      "POST /permissions/p1/decision": () => ({ id: "p1" }),
    });
    show(<Ready />);
    expect(await screen.findByText("Command")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^Allow/ }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/decision"))).toBe(true));
  });

  it("says when nothing waits", async () => {
    serve({});
    show(<Ready />);
    expect(await screen.findByText("All clear.")).toBeTruthy();
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
  it("shows markup from untrusted reports as text", () => {
    const { container } = render(<Markdown source={'# Hi\n<img src=x onerror="alert(1)"><script>x</script>'} />);
    expect(container.querySelector("h1")?.textContent).toBe("Hi");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>");
  });

  it("turns wiki links into buttons that report their title", async () => {
    const follow = vi.fn();
    render(<Markdown source="See [[Tax logic]]" onWiki={follow} />);
    await userEvent.click(screen.getByRole("button", { name: "Tax logic" }));
    expect(follow).toHaveBeenCalledWith("Tax logic");
  });

  it("opens web links in a new tab and renders tasks, tables and callouts", () => {
    const { container } = render(
      <Markdown source={"[Docs](https://example.com)\n\n- [x] Done\n- [ ] Open\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> [!warn] Careful"} />,
    );
    const link = container.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(container.querySelectorAll("td")).toHaveLength(2);
    expect(container.querySelector("blockquote.md-call.warn")?.textContent).toBe("Careful");
  });
});
