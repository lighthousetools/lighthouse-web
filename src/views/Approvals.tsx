import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, must } from "../api/client";
import { useAgentNames, useApprovals, useNeedsYou, usePermissions } from "../data";
import { t, useLanguage } from "../i18n";
import { Empty, Failure, Head, Section, Skeleton } from "../ui";
import { PermissionCard, ProposalCard } from "./Decisions";

export function Approvals() {
  useLanguage();
  const client = useQueryClient();
  const approvals = useApprovals();
  const permissions = usePermissions();
  const needs = useNeedsYou();
  const names = useAgentNames();
  const batch = useMutation({
    mutationFn: (approve: boolean) =>
      must(
        api.POST("/approvals/decisions", {
          body: { approve, ids: needs.approvals.map((item) => item.id) },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["approvals"] }),
  });
  const loading = approvals.isPending || permissions.isPending;
  return (
    <div className="content narrow">
      <Head title={t("nav.approvals")} lead={t("approvals.lead")} />
      <Failure error={approvals.error ?? permissions.error ?? batch.error} />
      {loading && <Skeleton />}
      {!loading && needs.decisions === 0 && (
        <Empty title={t("approvals.empty")} hint={t("approvals.emptyHint")} />
      )}
      {needs.permissions.length > 0 && (
        <Section title="Claude Code" count={needs.permissions.length}>
          {needs.permissions.map((request) => (
            <PermissionCard key={request.id} request={request} />
          ))}
        </Section>
      )}
      {needs.approvals.length > 0 && (
        <Section title={t("approvals.agents")} count={needs.approvals.length}>
          {needs.approvals.length > 1 && (
            <div className="actions" style={{ marginBottom: 8 }}>
              <button className="btn sm" onClick={() => batch.mutate(true)}>
                {t("approvals.approveAll", { count: needs.approvals.length })}
              </button>
              <button className="btn sm danger" onClick={() => batch.mutate(false)}>
                {t("approvals.denyAll")}
              </button>
            </div>
          )}
          {needs.approvals.map((approval) => (
            <ProposalCard key={approval.id} approval={approval} names={names} />
          ))}
        </Section>
      )}
    </div>
  );
}
