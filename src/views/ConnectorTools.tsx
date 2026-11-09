import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, PencilLine, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { api, must, type Schemas } from "../api/client";
import { toolName } from "../format";
import { t } from "../i18n";
import { toast } from "../shell/state";
import { Badge, Btn, Seg, Skeleton } from "../ui";
import { useRefresh, type Target, type View } from "./layers";

type Connector = View["connectors"][number];
type Tool = Schemas["ConnectorTool"];
type Level = "read" | "draft" | "write";

/** The lists a connector would get when every tool the server marks as reading is taken over. */
export function withSuggestions(connector: Pick<Connector, "read_tools" | "draft_tools">, tools: Tool[]) {
  const reads = new Set(connector.read_tools);
  for (const tool of tools) if (tool.suggested === "read" && !connector.draft_tools.includes(tool.name)) reads.add(tool.name);
  return { read_tools: [...reads].sort(), draft_tools: [...connector.draft_tools] };
}

/** Moves one tool to a level. */
export function withLevel(connector: Pick<Connector, "read_tools" | "draft_tools">, name: string, level: Level) {
  const read_tools = connector.read_tools.filter((tool) => tool !== name);
  const draft_tools = connector.draft_tools.filter((tool) => tool !== name);
  if (level === "read") read_tools.push(name);
  if (level === "draft") draft_tools.push(name);
  return { read_tools: read_tools.sort(), draft_tools: draft_tools.sort() };
}

const ICONS = { read: Eye, draft: PencilLine, write: ShieldCheck } as const;
const BADGES = { read: ["connections.readsBadge", ""], draft: ["connections.draftBadge", "info"], write: ["connections.asksBadge", "warn"] } as const;

/**
 * What a connection may do, tool by tool. Reading tools run on their own, drafts are saved directly, and everything
 * else waits for approval. When nothing is chosen yet, the tools the server marks as reading are taken over once.
 */
export function ConnectorTools({ connector, editable, layer }: { connector: Connector; editable: boolean; layer: Target | null }) {
  const refresh = useRefresh();
  const connected = connector.enabled && connector.connected != null;
  const tools = useQuery({
    queryKey: ["connector-tools", connector.name, connector.connected],
    queryFn: () => must(api.GET("/connectors/{id}/tools", { params: { path: { id: connector.name } } })),
    enabled: connected,
    retry: false,
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (lists: { read_tools: string[]; draft_tools: string[] }) =>
      must(
        api.PUT("/settings/{layer}/connectors/{name}", {
          params: { path: { layer: layer!, name: connector.name } },
          body: {
            url: connector.url ?? "",
            auth: connector.auth,
            client_id: connector.client_id ?? null,
            scopes: connector.scopes,
            read_tools: lists.read_tools,
            draft_tools: lists.draft_tools,
            enabled: connector.enabled,
          },
        }),
      ),
    onSuccess: () => {
      refresh();
      void tools.refetch();
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const canEdit = editable && layer != null && connector.url != null;
  const suggested = tools.data ? withSuggestions(connector, tools.data) : null;
  const missing = suggested ? suggested.read_tools.length - connector.read_tools.length : 0;
  const applied = useRef(false);
  useEffect(() => {
    // A fresh connection reads with what its server marks as reading, once, so it is useful at once.
    if (applied.current || !canEdit || !suggested || connector.read_tools.length || connector.draft_tools.length || missing <= 0) return;
    applied.current = true;
    save.mutate(suggested, { onSuccess: () => toast(t("connections.suggestionsApplied", { count: missing })) });
  }, [canEdit, suggested, missing, connector.read_tools.length, connector.draft_tools.length, save]);

  if (connected && tools.isLoading) return <Skeleton count={3} height={36} />;
  const list: { name: string; description?: string; level: Level; destructive?: boolean }[] = tools.data
    ? tools.data.map((tool) => ({ name: tool.name, description: tool.description, level: tool.level as Level, destructive: tool.destructive }))
    : [
        ...connector.read_tools.map((name) => ({ name, level: "read" as const })),
        ...connector.draft_tools.map((name) => ({ name, level: "draft" as const })),
      ];
  const order = { read: 0, draft: 1, write: 2 } as const;
  list.sort((a, b) => order[a.level] - order[b.level] || a.name.localeCompare(b.name));
  return (
    <>
      {canEdit && missing > 0 && (
        <div className="cn-suggest">
          <Sparkles size={14} />
          <span className="grow">{t("connections.suggestions", { count: missing })}</span>
          <Btn size="sm" variant="primary" disabled={save.isPending} onClick={() => suggested && save.mutate(suggested)}>{t("connections.applySuggestions")}</Btn>
        </div>
      )}
      {tools.isError && <p className="faint" style={{ fontSize: 12 }}>{t("connections.toolsUnavailable")}</p>}
      <div className="card cn-tools">
        {list.map((tool) => {
          const Icon = ICONS[tool.level];
          const [badge, tone] = BADGES[tool.level];
          return (
            <div key={tool.name}>
              <Icon size={14} className="faint" />
              <span className="grow clip" title={tool.description}>
                {toolName(tool.name)} <span className="faint mono" style={{ fontSize: 12 }}>{tool.name}</span>
                {tool.description && <small className="cn-desc faint">{tool.description}</small>}
              </span>
              {canEdit ? (
                <Seg<Level>
                  value={tool.level}
                  onChange={(level) => save.mutate(withLevel(connector, tool.name, level))}
                  options={[["read", t("connections.levelRead")], ["draft", t("connections.levelDraft")], ["write", t("connections.levelWrite")]]}
                />
              ) : (
                <Badge tone={tone}>{t(badge)}</Badge>
              )}
            </div>
          );
        })}
        {list.length === 0 && <p className="st-emp">{connected ? t("connections.noToolsOffered") : t("connections.noTools")}</p>}
      </div>
    </>
  );
}
