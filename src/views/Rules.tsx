import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, FileText, Globe, Plus, ScrollText, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { useAgentNames, useAgents, useRules } from "../data";
import { agentName, shortDate } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { Btn, Failure, SearchField, Seg, Skeleton, Toggle } from "../ui";
import { Select } from "../ui/select";
import "./rules.css";

type Rule = Schemas["Rule"];
const EVERYWHERE = "*";

/** Rules grouped by category, the uncategorized ones last. */
export function byCategory(rules: Rule[]) {
  const groups = new Map<string, Rule[]>();
  for (const rule of rules) {
    const key = rule.category?.trim() || "";
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }
  return [...groups.entries()].sort(([a], [b]) => (a ? (b ? a.localeCompare(b) : -1) : 1));
}

function useRuleActions() {
  const client = useQueryClient();
  const done = () => void client.invalidateQueries({ queryKey: ["rules"] });
  const fail = (error: Error) => toast(error.message, "bad");
  return {
    create: (body: Schemas["NewRule"]) => must(api.POST("/rules", { body })).then((rule) => (done(), rule)),
    patch: (id: string, body: Schemas["RulePatch"]) => must(api.PATCH("/rules/{id}", { params: { path: { id } }, body })).then(done, fail),
    remove: (id: string) => must(api.DELETE("/rules/{id}", { params: { path: { id } } })).then(done, fail),
  };
}

function RuleRow({ rule, agents, names, fresh }: { rule: Rule; agents: [string, string][]; names: Record<string, string>; fresh: boolean }) {
  const actions = useRuleActions();
  const [editing, setEditing] = useState(false);
  return (
    <div className={`ru-row ${rule.enabled ? "" : "off"} ${fresh ? "fresh" : ""}`}>
      <Toggle on={rule.enabled} label={t("rules.enabled", { text: rule.text })} onChange={(enabled) => void actions.patch(rule.id, { enabled })} />
      <div className="grow" style={{ minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            defaultValue={rule.text}
            aria-label={t("rules.text")}
            onBlur={(event) => {
              const text = event.target.value.trim();
              if (text && text !== rule.text) void actions.patch(rule.id, { text });
              setEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = rule.text;
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <button type="button" className="t" title={t("rules.edit")} onClick={() => setEditing(true)}>{rule.text}</button>
        )}
        <span className="s mono">
          {rule.agent_id ? agentName(rule.agent_id, names) : t("rules.everywhere")} · {rule.applied_count ? t("rules.applied", { count: rule.applied_count }) : t("rules.since", { date: shortDate(rule.created_at) })}
          {rule.last_applied_at && <span title={rule.last_applied_at}> · {t("rules.lastApplied", { date: shortDate(rule.last_applied_at) })}</span>}
        </span>
      </div>
      <Select
        size="sm"
        width={150}
        label={t("rules.scope")}
        value={rule.agent_id ?? EVERYWHERE}
        onChange={(value) => void actions.patch(rule.id, { agent_id: value === EVERYWHERE ? null : value })}
        options={agents}
      />
      <span className="ru-del">
        <Btn icon size="xs" variant="ghost" aria-label={t("rules.delete")} onClick={() => void actions.remove(rule.id)}><Trash2 /></Btn>
      </span>
    </div>
  );
}

export function Rules() {
  useLanguage();
  const route = useRoute();
  const rules = useRules();
  const agentsQuery = useAgents();
  const names = useAgentNames();
  const actions = useRuleActions();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const scope = route.param ?? "all";
  const all = rules.data ?? [];
  const agents: [string, string][] = [[EVERYWHERE, t("rules.everywhere")], ...(agentsQuery.data ?? []).map((agent) => [agent.id, agent.name] as [string, string])];
  const scoped = all.filter((rule) => scope === "all" || (scope === EVERYWHERE ? !rule.agent_id : rule.agent_id === scope));
  const needle = query.trim().toLowerCase();
  const shown = scoped.filter((rule) => (category === "all" || (rule.category?.trim() || "") === category) && (!needle || rule.text.toLowerCase().includes(needle)));
  const categories = byCategory(scoped);
  const agentScopes = [...new Set(all.map((rule) => rule.agent_id).filter(Boolean) as string[])];
  const create = useMutation({
    mutationFn: () =>
      actions.create({
        text: text.trim(),
        category: newCategory.trim() || null,
        agent_id: scope !== "all" && scope !== EVERYWHERE ? scope : null,
        enabled: true,
      }),
    onSuccess: (rule) => {
      setFresh(rule.id);
      setText("");
      setAdding(false);
      toast(t("rules.added"));
    },
  });
  const title = scope === "all" ? t("rules.all") : scope === EVERYWHERE ? t("rules.everywhere") : agentName(scope, names);
  return (
    <div className="page flush">
      <div className="ru">
        <nav className="ru-tree" aria-label={t("nav.rules")}>
          <div className="ru-th">
            <b>{t("nav.rules")}</b>
            <span className="tn">{t("rules.active", { count: all.filter((rule) => rule.enabled).length })}</span>
          </div>
          <button type="button" className={scope === "all" ? "on" : ""} onClick={() => go("rules")}>
            <ScrollText size={14} />
            <span className="grow clip">{t("rules.all")}</span>
            <em>{all.length}</em>
          </button>
          <div className="ru-cap"><Globe size={13} />{t("rules.everywhere")}</div>
          <button type="button" className={scope === EVERYWHERE ? "on" : ""} onClick={() => go("rules", EVERYWHERE)}>
            <FileText size={14} />
            <span className="grow clip">{t("rules.allAgents")}</span>
            <em>{all.filter((rule) => !rule.agent_id).length}</em>
          </button>
          <div className="ru-cap"><Bot size={13} />{t("nav.agents")}</div>
          {[...new Set([...(agentsQuery.data ?? []).map((agent) => agent.id), ...agentScopes])].map((id) => (
            <button type="button" key={id} className={scope === id ? "on" : ""} onClick={() => go("rules", id)}>
              <FileText size={14} />
              <span className="grow clip">{agentName(id, names)}</span>
              <em>{all.filter((rule) => rule.agent_id === id).length}</em>
            </button>
          ))}
          <p className="ru-hint">{t("rules.hint")}</p>
        </nav>
        <div className="ru-main">
          <div className="ru-in">
            <header className="ru-head">
              <div className="grow">
                <h1>{title}</h1>
                <p>{t("rules.lead")}</p>
              </div>
              <Btn variant="primary" onClick={() => setAdding(true)}><Plus />{t("rules.new")}</Btn>
            </header>
            {adding && (
              <form
                className="card ru-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (text.trim()) create.mutate();
                }}
              >
                <input autoFocus aria-label={t("rules.text")} placeholder={t("rules.placeholder")} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setAdding(false)} />
                <input style={{ flex: "0 0 160px", minWidth: 120 }} aria-label={t("rules.category")} placeholder={t("rules.category")} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} />
                <Btn size="sm" variant="primary" type="submit" disabled={!text.trim() || create.isPending}>{t("rules.add")}</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</Btn>
                {create.error && <Failure error={create.error} />}
              </form>
            )}
            <div className="ru-bar">
              <Seg
                label={t("rules.category")}
                value={category}
                onChange={setCategory}
                options={[["all", t("approvals.filterAll"), scoped.length], ...categories.map(([key, list]) => [key, key || t("rules.uncategorized"), list.length] as [string, string, number])]}
              />
              <span className="grow" />
              <div className="ru-q"><SearchField value={query} onChange={setQuery} placeholder={t("rules.search")} /></div>
            </div>
            <Failure error={rules.error} />
            {rules.isPending && <Skeleton count={5} height={56} />}
            {!rules.isPending && shown.length === 0 && (
              <div className="ru-none">
                <ScrollText size={22} className="faint" />
                <b>{all.length ? t("palette.empty") : t("rules.empty")}</b>
                <span style={{ fontSize: 13 }}>{t("rules.emptyHint")}</span>
                {!adding && <Btn size="sm" onClick={() => setAdding(true)}><Plus />{t("rules.new")}</Btn>}
              </div>
            )}
            {byCategory(shown).map(([key, list]) => (
              <section key={key || "none"}>
                <div className="ru-sh">
                  {key || t("rules.uncategorized")}
                  <small className="tn">{t("rules.activeOf", { active: list.filter((rule) => rule.enabled).length, count: list.length })}</small>
                </div>
                <div className="card ru-list">
                  {list.map((rule) => (
                    <RuleRow key={rule.id} rule={rule} agents={agents} names={names} fresh={fresh === rule.id} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
