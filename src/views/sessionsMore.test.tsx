import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { storeToken } from "../api/client";
import { callsTo, serve, show } from "../test/api";
import { HistoryView, NewSessionModal, SkillsView, cronOf, folderName, skillAutomation } from "./SessionsMore";

const NODE = { id: "n1", name: "MacBook", paused: false, online: true, last_seen_at: "2026-11-09T22:00:00Z" };
const PAST = (id: string, project: string, prompt: string) => ({
  node_id: "n1", session_id: id, project, cwd: `/work/${project}`, branch: "main", first_prompt: prompt, messages: 12,
  last_active_at: "2026-11-08T10:00:00Z",
});
const SKILL = { node_id: "n1", name: "jumpstart", description: "The daily briefing", path: "/work/sales/.claude/skills/jumpstart", scope: "project", project: "/work/sales" };

beforeEach(() => {
  storeToken("lht_x");
  location.hash = "#sessions";
});

describe("sessions on the machines", () => {
  it("builds the schedule and the automation of a skill", () => {
    expect(cronOf("daily", "08:30", "MON", "")).toBe("30 8 * * *");
    expect(cronOf("weekly", "15:00", "MON", "")).toBe("0 15 * * MON");
    expect(cronOf("cron", "", "", " 0 8 * * MON-FRI ")).toBe("0 8 * * MON-FRI");
    const source = skillAutomation(SKILL, "MacBook", "0 8 * * *", "Follow the skill jumpstart.");
    expect(source).toContain("id: skill-jumpstart");
    expect(source).toContain('cwd: "/work/sales"');
    expect(source).toContain('prompt: "Follow the skill jumpstart."');
    expect(folderName("/work/sales/")).toBe("sales");
  });

  it("lists earlier sessions without the live ones and continues one", async () => {
    const calls = serve({
      "GET /sessions/history": () => [PAST("live", "atlas", "Ship search"), PAST("old", "billing", "Fix the invoice export")],
      "POST /sessions/launch": () => new Response(JSON.stringify({ id: "l1", status: "queued" }), { status: 202 }),
    });
    show(<HistoryView live={new Set(["live"])} />);
    expect(await screen.findByText("Fix the invoice export")).toBeTruthy();
    expect(screen.queryByText("Ship search")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Instruction" }), { target: { value: "Now add the tests" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Resume" }).at(-1)!);
    await waitFor(() => expect(callsTo(calls, "POST", "/sessions/launch")).toHaveLength(1));
    const body = await callsTo(calls, "POST", "/sessions/launch")[0]!.json();
    expect(body).toMatchObject({ node: "n1", cwd: "/work/billing", resume: "old", prompt: "Now add the tests" });
  });

  it("starts a new session in a suggested folder", async () => {
    const calls = serve({ "POST /sessions/launch": () => new Response(JSON.stringify({ id: "l1", status: "queued" }), { status: 202 }) });
    show(<NewSessionModal nodes={[NODE]} folders={["/work/sales", "/work/atlas"]} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "atlas" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Instruction" }), { target: { value: "Where are we?" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(callsTo(calls, "POST", "/sessions/launch")).toHaveLength(1));
    expect(await callsTo(calls, "POST", "/sessions/launch")[0]!.json()).toMatchObject({ node: "n1", cwd: "/work/atlas", prompt: "Where are we?" });
  });

  it("schedules a skill as an agent", async () => {
    const calls = serve({
      "GET /sessions/skills": () => [SKILL],
      "POST /automations": () => new Response(JSON.stringify({ id: "skill-jumpstart" }), { status: 201 }),
    });
    show(<SkillsView nodes={[NODE]} />);
    expect(await screen.findByText("The daily briefing")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Schedule as agent" }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(callsTo(calls, "POST", "/automations")).toHaveLength(1));
    const body = await callsTo(calls, "POST", "/automations")[0]!.json();
    expect(body.source).toContain('cron: "0 8 * * *"');
    expect(body.source).toContain('node: "MacBook"');
  });
});
