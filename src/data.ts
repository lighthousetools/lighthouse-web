import { useQuery } from "@tanstack/react-query";
import { api, must } from "./api/client";

export function useApprovals() {
  return useQuery({
    queryKey: ["approvals", "pending"],
    queryFn: () => must(api.GET("/approvals", { params: { query: { status: "pending" } } })),
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ["permissions", "pending"],
    queryFn: () => must(api.GET("/permissions", { params: { query: { status: "pending" } } })),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: () => must(api.GET("/sessions", { params: { query: {} } })),
  });
}

export function useNodes() {
  return useQuery({ queryKey: ["nodes"], queryFn: () => must(api.GET("/nodes")) });
}

export function useAgents() {
  return useQuery({ queryKey: ["agents"], queryFn: () => must(api.GET("/agents")) });
}

export function useRuns(limit: number) {
  return useQuery({
    queryKey: ["runs", limit],
    queryFn: () => must(api.GET("/runs", { params: { query: { limit } } })),
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ["runs", "detail", id],
    queryFn: () => must(api.GET("/runs/{id}", { params: { path: { id } } })),
  });
}

export function useCosts(days: number) {
  return useQuery({
    queryKey: ["costs", days],
    queryFn: () => must(api.GET("/costs", { params: { query: { days } } })),
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => must(api.GET("/me")),
    staleTime: Infinity,
  });
}

export function useConnectors() {
  return useQuery({ queryKey: ["connectors"], queryFn: () => must(api.GET("/connectors")) });
}

/** Display names of agents by ID, for lists of runs. */
export function useAgentNames() {
  const agents = useAgents();
  return Object.fromEntries((agents.data ?? []).map((agent) => [agent.id, agent.name]));
}

/** A stable key for a session, which is unique only per machine. */
export const sessionKey = (session: { node_id: string; id: string }) => `${session.node_id}:${session.id}`;

/** Everything that waits for the owner, counted the same way everywhere. */
export function useNeedsYou() {
  const approvals = useApprovals();
  const permissions = usePermissions();
  const sessions = useSessions();
  const waiting = (sessions.data ?? []).filter((session) => session.status === "waiting");
  const approvalList = approvals.data ?? [];
  const permissionList = permissions.data ?? [];
  return {
    approvals: approvalList,
    permissions: permissionList,
    waiting,
    running: (sessions.data ?? []).filter((session) => session.status === "running"),
    decisions: approvalList.length + permissionList.length,
    total: approvalList.length + permissionList.length + waiting.length,
    loading: approvals.isPending || permissions.isPending || sessions.isPending,
  };
}

export type TaskView = "all" | "today" | "upcoming" | "done" | "proposed";

export function useReady() {
  return useQuery({ queryKey: ["ready"], queryFn: () => must(api.GET("/ready")) });
}

export function useTasks(view: TaskView = "all") {
  return useQuery({
    queryKey: ["tasks", view],
    queryFn: () => must(api.GET("/tasks", { params: { query: { view, limit: 500 } } })),
  });
}

export function useRules() {
  return useQuery({ queryKey: ["rules"], queryFn: () => must(api.GET("/rules", { params: { query: {} } })) });
}

export function useFacts() {
  return useQuery({ queryKey: ["memory"], queryFn: () => must(api.GET("/memory", { params: { query: {} } })) });
}

export function useAlerts(view: "active" | "open" | "acknowledged" | "resolved" | "all" = "active") {
  return useQuery({
    queryKey: ["alerts", view],
    queryFn: () => must(api.GET("/alerts", { params: { query: { view, limit: 200 } } })),
  });
}

export function useAlertCounts() {
  return useQuery({ queryKey: ["alerts", "counts"], queryFn: () => must(api.GET("/alerts/counts")) });
}

export function useAutomations() {
  return useQuery({ queryKey: ["automations"], queryFn: () => must(api.GET("/automations")) });
}

/** The latest morning brief, or null when none was written yet. */
export function useBrief() {
  return useQuery({
    queryKey: ["documents", "brief"],
    queryFn: async () => {
      const { data, response } = await api.GET("/briefs/latest");
      if (response.status === 404) return null;
      if (!data) throw new Error(`${response.status}`);
      return data;
    },
  });
}

export function useRecaps() {
  return useQuery({
    queryKey: ["documents", "recaps"],
    queryFn: () => must(api.GET("/recaps", { params: { query: { limit: 12 } } })),
  });
}

/** Which cached data a live event touches. `changed` and unknown events reload everything on screen. */
export function queriesFor(event: string): string[][] | "all" {
  switch (event) {
    case "tasks.changed":
      return [["tasks"], ["ready"]];
    case "rules.changed":
      return [["rules"]];
    case "memory.changed":
      return [["memory"], ["ready"]];
    case "run.waiting":
      return [["runs"], ["approvals"], ["ready"], ["permissions"]];
    case "run.finished":
      return [["runs"], ["ready"], ["agents"], ["automations"]];
    case "alert.raised":
    case "alerts.changed":
      return [["alerts"], ["ready"]];
    case "ready.changed":
      return [["ready"]];
    case "document.created":
      return [["documents"], ["runs"]];
    case "automations.changed":
      return [["automations"]];
    case "connected.changed":
      return [["connected"], ["ready"], ["approvals"]];
    case "organizations.changed":
      return [["connected"]];
    case "sessions.changed":
      return [["sessions"]];
    case "posts.changed":
      return [["posts"], ["ready"]];
    case "decks.changed":
      return [["decks"], ["brain"]];
    case "branding.changed":
      return [["branding"]];
    case "talk.changed":
      return [["talk"]];
    default:
      return "all";
  }
}
