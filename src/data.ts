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

export function useAgents() {
  return useQuery({ queryKey: ["agents"], queryFn: () => must(api.GET("/agents")) });
}

export function useRuns(limit: number) {
  return useQuery({
    queryKey: ["runs", limit],
    queryFn: () => must(api.GET("/runs", { params: { query: { limit } } })),
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
    decisions: approvalList.length + permissionList.length,
    total: approvalList.length + permissionList.length + waiting.length,
  };
}
