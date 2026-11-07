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
