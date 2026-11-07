import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Pause, Pencil, Play, Plus, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { useAgentNames, useFacts } from "../data";
import { agentName, shortDate } from "../format";
import { t, useLanguage } from "../i18n";
import { openRun } from "./runs";
import { toast } from "../shell/state";
import { Badge, Btn, Failure, PageHeader, SearchField, Seg, ServiceIcon, Skeleton, brandOf } from "../ui";
import "./me.css";

type Fact = Schemas["Fact"];
const PROMPT_LIMIT = 100;

/** Roughly what the facts cost in a prompt: about four characters per token. */
export function factTokens(facts: Pick<Fact, "text">[]) {
  return Math.round(facts.reduce((sum, fact) => sum + fact.text.length + 3, 0) / 4);
}

/** The facts a run sees: the newest confirmed ones that are not paused. */
export function loaded(facts: Fact[]) {
  return facts
    .filter((fact) => fact.status === "confirmed" && !fact.paused)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, PROMPT_LIMIT);
}

const categoryOf = (fact: Pick<Fact, "category">) => fact.category?.trim() || "";

function sourceLabel(fact: Fact, names: Record<string, string>) {
  if (fact.source.kind === "owner") return t("me.byYou");
  if (fact.source.label) return fact.source.label;
  return fact.agent_id ? agentName(fact.agent_id, names) : fact.source.kind;
}

function useFactActions() {
  const client = useQueryClient();
  const done = () => {
    void client.invalidateQueries({ queryKey: ["memory"] });
    void client.invalidateQueries({ queryKey: ["ready"] });
  };
  const fail = (error: Error) => toast(error.message, "bad");
  return {
    create: (body: Schemas["NewFact"]) => must(api.POST("/memory", { body })).then(done),
    patch: (id: string, body: Schemas["FactPatch"]) => must(api.PATCH("/memory/{id}", { params: { path: { id } }, body })).then(done, fail),
    confirm: (id: string) => must(api.POST("/memory/{id}/confirm", { params: { path: { id } } })).then(done, fail),
    remove: (id: string) => must(api.DELETE("/memory/{id}", { params: { path: { id } } })).then(done, fail),
  };
}

function FactRow({ fact, names }: { fact: Fact; names: Record<string, string> }) {
  const actions = useFactActions();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="me-fact edit">
        <input
          autoFocus
          defaultValue={fact.text}
          aria-label={t("me.fact")}
          onBlur={(event) => {
            const text = event.target.value.trim();
            if (text && text !== fact.text) void actions.patch(fact.id, { text });
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = fact.text;
              event.currentTarget.blur();
            }
          }}
        />
      </div>
    );
  }
  const proposed = fact.status === "proposed";
  return (
    <div className={`me-fact ${fact.paused ? "off" : ""}`}>
      <div className="grow" style={{ minWidth: 0 }}>
        <span className="t">{fact.text}</span>
        <span className="s">
          {fact.run_id && fact.source.kind !== "owner" ? (
            <button type="button" onClick={() => openRun(fact.run_id!)}>{sourceLabel(fact, names)}</button>
          ) : (
            sourceLabel(fact, names)
          )}
          <span>· {shortDate(fact.updated_at)}</span>
          {fact.confidence < 1 && <span className="tn">· {Math.round(fact.confidence * 100)} %</span>}
          {fact.paused && <span>· {t("me.paused")}</span>}
        </span>
      </div>
      {proposed && <Badge tone="vio">{t("me.proposed")}</Badge>}
      <div className="me-act">
        {proposed && (
          <Btn icon size="xs" variant="ghost" aria-label={t("ready.confirm")} title={t("ready.confirm")} onClick={() => void actions.confirm(fact.id)}><Check /></Btn>
        )}
        <Btn icon size="xs" variant="ghost" aria-label={t("me.edit")} title={t("me.edit")} onClick={() => setEditing(true)}><Pencil /></Btn>
        <Btn
          icon
          size="xs"
          variant="ghost"
          aria-label={fact.paused ? t("me.resume") : t("me.pause")}
          title={fact.paused ? t("me.resume") : t("me.pause")}
          onClick={() => void actions.patch(fact.id, { paused: !fact.paused })}
        >
          {fact.paused ? <Play /> : <Pause />}
        </Btn>
        <Btn icon size="xs" variant="ghost" aria-label={t("ready.forget")} title={t("ready.forget")} onClick={() => void actions.remove(fact.id)}><Trash2 /></Btn>
      </div>
    </div>
  );
}

export function Me() {
  useLanguage();
  const facts = useFacts();
  const names = useAgentNames();
  const actions = useFactActions();
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const all = facts.data ?? [];
  const categories = [...new Set(all.map(categoryOf))].sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1));
  const needle = query.trim().toLowerCase();
  const shown = all.filter(
    (fact) =>
      (category === "all" || categoryOf(fact) === category) &&
      (!source || sourceLabel(fact, names) === source) &&
      (!needle || fact.text.toLowerCase().includes(needle)),
  );
  const inPrompt = loaded(all);
  const tokens = factTokens(inPrompt);
  const cellCount = Math.min(72, Math.max(24, Math.ceil(tokens / 10)));
  const perCategory = categories.map((key, index) => ({ key, index, tokens: factTokens(inPrompt.filter((fact) => categoryOf(fact) === key)) }));
  const cells: number[] = [];
  for (const entry of perCategory) for (let n = 0; n < Math.round((entry.tokens / Math.max(tokens, 1)) * Math.min(cellCount, tokens / 10)); n++) cells.push(entry.index % 6);
  const sources = Object.entries(all.reduce<Record<string, { count: number; kind: string }>>((map, fact) => {
    const label = sourceLabel(fact, names);
    map[label] = { count: (map[label]?.count ?? 0) + 1, kind: fact.source.kind };
    return map;
  }, {})).sort((a, b) => b[1].count - a[1].count);
  const add = useMutation({
    mutationFn: () => actions.create({ text: text.trim(), category: category === "all" ? null : category || null }),
    onSuccess: () => {
      setText("");
      setAdding(false);
      toast(t("me.added"));
    },
  });
  const exportFacts = () => {
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lighthouse-memory.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const grouped = categories.map((key) => [key, shown.filter((fact) => categoryOf(fact) === key)] as const).filter(([, list]) => list.length);
  return (
    <div className="page">
      <div className="mex-me">
        <PageHeader title={t("nav.me")} sub={t("me.lead")}>
          <Btn disabled={!all.length} onClick={exportFacts}><Download />{t("me.export")}</Btn>
          <Btn variant="primary" onClick={() => setAdding(true)}><Plus />{t("me.new")}</Btn>
        </PageHeader>
        <div className="me-cols">
          <div className="card">
            <div className="me-top">
              <Seg
                label={t("me.category")}
                value={category}
                onChange={setCategory}
                options={[["all", t("approvals.filterAll"), all.length], ...categories.map((key) => [key, key || t("rules.uncategorized"), all.filter((fact) => categoryOf(fact) === key).length] as [string, string, number])]}
              />
            </div>
            <div className="me-find">
              <SearchField value={query} onChange={setQuery} placeholder={t("ui.search")} />
              {source && <button type="button" className="me-chip" onClick={() => setSource(null)}>{source} ×</button>}
            </div>
            {adding && (
              <form
                className="me-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (text.trim()) add.mutate();
                }}
              >
                <input autoFocus aria-label={t("me.fact")} placeholder={t("me.placeholder")} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setAdding(false)} />
                <Btn size="sm" variant="primary" type="submit" disabled={!text.trim() || add.isPending}>{t("me.save")}</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</Btn>
              </form>
            )}
            {add.error && <div style={{ padding: "0 16px" }}><Failure error={add.error} /></div>}
            <Failure error={facts.error} />
            {facts.isPending && <div style={{ padding: 12 }}><Skeleton count={5} height={44} /></div>}
            {!facts.isPending && shown.length === 0 && (
              <div className="me-empty">
                <UserRound size={22} className="faint" />
                <b>{all.length ? t("palette.empty") : t("me.empty")}</b>
                <span>{t("me.emptyHint")}</span>
              </div>
            )}
            {grouped.map(([key, list]) => (
              <div key={key || "none"}>
                <div className="me-cap">{key || t("rules.uncategorized")}</div>
                {list.map((fact) => <FactRow key={fact.id} fact={fact} names={names} />)}
              </div>
            ))}
            {all.length > 0 && (
              <div className="me-ft">
                <span className="grow">{t("me.footer", { count: all.length, confirmed: all.filter((fact) => fact.status === "confirmed").length })}</span>
              </div>
            )}
          </div>
          <div className="me-side">
            <div className="card me-use">
              <div className="grow">
                <b>{t("me.inPrompts")}</b>
                <small>{t("me.inPromptsHint")}</small>
              </div>
              <Badge tone={inPrompt.length ? "ok" : ""}>{inPrompt.length}</Badge>
            </div>
            <div className="sh">{t("me.loaded")}<small>{t("me.entries", { count: inPrompt.length })}</small></div>
            <div className="card pad">
              <div className="me-tok tn">{tokens} <small>{t("me.tokens")}</small></div>
              <div className="me-cells" aria-hidden="true">
                {Array.from({ length: cellCount }, (_, index) => <i key={index} className={cells[index] != null ? `t${cells[index]}` : ""} />)}
              </div>
              <div className="me-lg">
                {perCategory.map((entry) => (
                  <button type="button" key={entry.key || "none"} onClick={() => setCategory(entry.key)}>
                    <i className={`t${entry.index % 6}`} />
                    <span className="grow clip" style={{ textAlign: "left" }}>{entry.key || t("rules.uncategorized")}</span>
                    <span className="tn">{entry.tokens}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="sh">{t("me.sources")}</div>
            <div className="card me-src">
              {sources.map(([label, entry]) => (
                <button type="button" key={label} className={source === label ? "on" : ""} onClick={() => setSource(source === label ? null : label)}>
                  <ServiceIcon name={brandOf(label) ?? brandOf(entry.kind)} fallback={label} size={18} />
                  <span className="grow clip" style={{ textAlign: "left" }}>{label}</span>
                  <span className="tn faint">{entry.count}</span>
                </button>
              ))}
              {sources.length === 0 && <p className="faint" style={{ padding: 8, fontSize: 12 }}>{t("me.noSources")}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
