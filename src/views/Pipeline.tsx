import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Columns3, ExternalLink, ListTodo, Plus, Search, Sparkles, Table2 } from "lucide-react";
import { api, must } from "../api/client";
import { toast } from "../shell/state";
import { useMemo, useState, type DragEvent } from "react";
import { t, useLanguage } from "../i18n";
import { Avatar, Badge, Btn, Empty, Failure, Modal, Seg, Skeleton } from "../ui";
import { InspectorPanel } from "../shell/Inspector";
import { inspect } from "../shell/state";
import { Freshness, NoSource, canDo, field, has, money, openItem, short, useAction, useDomains, useItems, useNumbers, useOrg, useSources, type Item } from "./connected";
import { age } from "./Ready";
import "./pipeline.css";

type Filter = "all" | "mine" | "cold" | "novalue";
type Mode = "board" | "table";

const stageOf = (deal: Item) => deal.state ?? field(deal, "stage") ?? "—";
const nextStep = (deal: Item) => field(deal, "next_step") ?? field(deal, "next_activity") ?? deal.summary;

/** Stages in pipeline order: as the numbers list them, then any others the deals use. */
/** The service's ID of a stage, read from a deal of the same source that is in it, for services that move deals by ID. */
export function stageIdOf(deals: Pick<Item, "source" | "state" | "data">[], stage: string, source: string): unknown {
  const raw = (item: Pick<Item, "data">) => (item.data as Record<string, unknown> | null)?.stage_id ?? undefined;
  const deal = deals.find((item) => item.source === source && stageOf(item as Item) === stage && raw(item) != null);
  return deal ? raw(deal) : undefined;
}

export function stageOrder(deals: Pick<Item, "state" | "data">[], known: string[] = []) {
  const seen = [...known];
  for (const deal of deals) {
    const stage = (deal as Item).state ?? field(deal as Item, "stage") ?? "—";
    if (!seen.includes(stage)) seen.push(stage);
  }
  return seen;
}

/** A value from won deals like this one: their median, with the basis and up to five examples. */
function Suggestion({ deal }: { deal: Item }) {
  const sources = useSources();
  const action = useAction();
  const suggestion = useQuery({ queryKey: ["connected", "deals", deal.id, "suggestion"], queryFn: () => must(api.GET("/deals/{id}/suggestion", { params: { path: { id: deal.id } } })) });
  const data = suggestion.data;
  if (suggestion.isPending) return <Skeleton count={1} height={60} />;
  if (!data) return null;
  const canUpdate = canDo(sources.data, "deals", "update", deal.source);
  return (
    <div className="pl-sug">
      <div className="h"><Sparkles size={14} />{t("pipeline.suggested")}<span className="grow" />{data.suggested != null && <b className="tn">{money(data.suggested, data.currency)}</b>}</div>
      <p>{data.explanation}</p>
      {data.examples.length > 0 && (
        <ul>
          {data.examples.map((example) => <li key={example.id}><span className="clip">{example.title ?? example.id}</span><span className="tn faint">{money(example.amount, data.currency)}</span></li>)}
        </ul>
      )}
      {data.suggested != null && canUpdate && (
        <Btn size="sm" disabled={action.isPending} onClick={() => action.mutate({ item: deal.id, action: "update", input: { amount: data.suggested } })}>{t("pipeline.useValue")}</Btn>
      )}
    </div>
  );
}

function DealPanel({ deal }: { deal: Item }) {
  return (
    <InspectorPanel
      kind={t("nav.pipeline")}
      title={deal.title ?? deal.external_id}
      facts={[
        [t("pipeline.stage"), stageOf(deal)],
        [t("pipeline.value"), money(deal.amount, deal.currency)],
        ...(field(deal, "probability") ? [[t("pipeline.probability"), `${field(deal, "probability")} %`] as [string, string]] : []),
        [t("pipeline.owner"), deal.assignee ?? "–"],
        ...(field(deal, "contact") ? [[t("pipeline.contact"), field(deal, "contact")!] as [string, string]] : []),
        [t("pipeline.lastActivity"), deal.occurred_at ? age(deal.occurred_at) : "–"],
        ...(nextStep(deal) ? [[t("pipeline.next"), nextStep(deal)!] as [string, string]] : []),
      ]}
      actions={deal.url ? <Btn onClick={() => openItem(deal)}><ExternalLink />{t("connected.openIn")}</Btn> : undefined}
    >
      <Suggestion deal={deal} />
    </InspectorPanel>
  );
}

function NewDeal({ source, stages, onClose }: { source: string; stages: string[]; onClose: () => void }) {
  const action = useAction();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState(stages[0] ?? "");
  return (
    <Modal
      title={t("pipeline.new")}
      sub={t("pipeline.newHint")}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn
            variant="primary"
            disabled={!title.trim() || action.isPending}
            onClick={() => action.mutate({ source, action: "create", input: { title: title.trim(), amount: Number(amount) || undefined, stage } }, { onSuccess: onClose })}
          >
            {t("calendar.propose")}
          </Btn>
        </>
      }
    >
      <div className="bz-nd">
        <label className="w2"><span>{t("pipeline.name")}</span><input className="au-in" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>{t("pipeline.value")}</span><input className="au-in" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label><span>{t("pipeline.stage")}</span><input className="au-in" value={stage} list="stages" onChange={(event) => setStage(event.target.value)} /></label>
        <datalist id="stages">{stages.map((item) => <option key={item} value={item} />)}</datalist>
      </div>
    </Modal>
  );
}

function Card({ deal, onDrag }: { deal: Item; onDrag?: (event: DragEvent) => void }) {
  const next = nextStep(deal);
  return (
    <div className="bz-pcard" draggable={!!onDrag} onDragStart={onDrag} role="button" tabIndex={0} onClick={() => inspect(`deal:${deal.id}`, <DealPanel deal={deal} />)}>
      <div className="t"><b className="grow">{deal.title}</b>{has(deal, "cold") && <Badge tone="warn">{t("pipeline.cold")}</Badge>}</div>
      <div className={`n ${next ? "" : "bz-miss"}`}>{next ?? t("pipeline.noNext")}</div>
      <div className="m">
        {(field(deal, "contact") ?? deal.assignee) && <Avatar name={(field(deal, "contact") ?? deal.assignee)!} size={16} />}
        <span className="grow clip">{[field(deal, "contact"), deal.occurred_at ? t("pipeline.ago", { age: age(deal.occurred_at) }) : ""].filter(Boolean).join(" · ")}</span>
        <span className={`v tn ${deal.amount ? "" : "no"}`}>{deal.amount ? money(deal.amount, deal.currency) : t("pipeline.noValue")}</span>
      </div>
    </div>
  );
}

/** Proposes a task for each of the top open deals; each lands in Ready to accept or reject. */
function useTopTasks() {
  const client = useQueryClient();
  const org = useOrg()?.id;
  return useMutation({
    mutationFn: () => must(api.POST("/deals/top-tasks", { body: { limit: 5, org: org ?? null } })),
    onSuccess: (result) => {
      toast(result.proposed.length ? t("pipeline.topTasksDone", { count: result.proposed.length, skipped: result.skipped }) : t("pipeline.topTasksNone"));
      for (const key of ["ready", "tasks"]) void client.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
}

export function Pipeline() {
  useLanguage();
  const topTasks = useTopTasks();
  const domains = useDomains();
  const sources = useSources();
  const numbers = useNumbers();
  const action = useAction();
  const deals = useItems("/deals", { limit: 500 }, domains.has("deals"));
  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<Mode>("board");
  const [query, setQuery] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const all = useMemo(() => (deals.data?.items ?? []).filter((item) => item.kind === "deal"), [deals.data]);
  const first = numbers.data?.currencies[0];
  const stages = stageOrder(all, (first?.stages ?? []).map((stage) => stage.stage));
  const needle = query.trim().toLowerCase();
  const match = (deal: Item) =>
    (filter === "all" || (filter === "mine" ? has(deal, "mine") : filter === "cold" ? has(deal, "cold") : !deal.amount)) &&
    (!needle || `${deal.title} ${deal.assignee ?? ""} ${nextStep(deal) ?? ""}`.toLowerCase().includes(needle));
  const shown = all.filter(match);
  const cold = all.filter((deal) => has(deal, "cold"));
  const coldSum = cold.reduce((sum, deal) => sum + (deal.amount ?? 0), 0);
  const volume = all.reduce((sum, deal) => sum + (deal.amount ?? 0), 0);
  const currency = first?.currency ?? all.find((deal) => deal.currency)?.currency;
  const sourceName = (sources.data ?? []).find((source) => source.domain === "deals" && source.actions.includes("create"))?.name;
  const movable = (deal: Item) => canDo(sources.data, "deals", "move", deal.source) || canDo(sources.data, "deals", "update", deal.source);
  const drop = (stage: string) => (event: DragEvent) => {
    event.preventDefault();
    setOver(null);
    const deal = all.find((item) => item.id === event.dataTransfer.getData("text/plain"));
    if (!deal || stageOf(deal) === stage) return;
    const name = canDo(sources.data, "deals", "move", deal.source) ? "move" : "update";
    const stageId = stageIdOf(all, stage, deal.source);
    action.mutate({ item: deal.id, action: name, input: stageId == null ? { stage } : { stage, stage_id: stageId } });
  };
  if (!sources.isPending && !domains.has("deals")) return <div className="page"><NoSource domain="deals" /></div>;
  const count = (value: Filter) => all.filter((deal) => value === "all" || (value === "mine" ? has(deal, "mine") : value === "cold" ? has(deal, "cold") : !deal.amount)).length;
  const stageTotal = (stage: string) => all.filter((deal) => stageOf(deal) === stage).reduce((sum, deal) => sum + (deal.amount ?? 0), 0);
  return (
    <div className="page flush">
      <div className="bz-pp">
        <header className="ph">
          <div className="grow">
            <h1>{t("nav.pipeline")}</h1>
            <p>{t("pipeline.lead", { count: all.length, novalue: count("novalue") })}</p>
          </div>
          <div className="acts">
            <Freshness domain="deals" />
            <Btn disabled={topTasks.isPending} title={t("pipeline.topTasksHint")} onClick={() => topTasks.mutate()}><ListTodo />{t("pipeline.topTasks")}</Btn>
            {sourceName && <Btn variant="primary" onClick={() => setCreating(true)}><Plus />{t("pipeline.new")}</Btn>}
          </div>
        </header>
        <div className="pfc">
          <div className="c"><span>{t("pipeline.volume")}</span><b className="tn">{money(first?.pipeline_open ?? volume, currency)}</b></div>
          <div className="c"><span>{t("pipeline.weighted")}</span><b className="tn">{first ? money(first.pipeline_weighted, currency) : "–"}</b></div>
          <div className="c wide">
            <span>{t("pipeline.byStage")}</span>
            <div className="fb">{stages.map((stage) => <i key={stage} style={{ flexGrow: Math.max(stageTotal(stage), 1) }} />)}</div>
            <div className="fl tn">{stages.map((stage) => <span key={stage}>{stage} <em>{short(stageTotal(stage))}</em></span>)}</div>
          </div>
        </div>
        {cold.length > 0 && (
          <div className="pcold">
            <AlertTriangle size={15} />
            <span className="grow">{t("pipeline.coldBanner", { count: cold.length, sum: money(coldSum, currency) })}</span>
            <Btn size="sm" onClick={() => setFilter("cold")}>{t("pipeline.showCold")}</Btn>
          </div>
        )}
        <div className="pbar">
          <Seg<Filter>
            label={t("pipeline.filter")}
            value={filter}
            onChange={setFilter}
            options={[["all", t("approvals.filterAll"), count("all")], ["mine", t("issues.tab.mine"), count("mine")], ["cold", t("pipeline.cold"), count("cold")], ["novalue", t("pipeline.noValue"), count("novalue")]]}
          />
          <div className="ps"><label className="field"><Search /><input aria-label={t("pipeline.search")} placeholder={t("pipeline.search")} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
          <span className="grow" />
          <Seg<Mode> label={t("calendar.mode")} value={mode} onChange={setMode} options={[["board", <><Columns3 size={13} />{t("pipeline.board")}</>], ["table", <><Table2 size={13} />{t("pipeline.table")}</>]]} />
        </div>
        <Failure error={deals.error} />
        {deals.isPending ? (
          <Skeleton count={5} height={80} />
        ) : all.length === 0 ? (
          <div className="card"><Empty title={t("pipeline.empty")} sub={t("pipeline.emptyHint")} /></div>
        ) : mode === "board" ? (
          <div className="pboard" style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(196px, 1fr))` }}>
            {stages.map((stage) => {
              const list = shown.filter((deal) => stageOf(deal) === stage);
              return (
                <section
                  key={stage}
                  className={`pcol ${over === stage ? "over" : ""}`}
                  onDragOver={(event) => { event.preventDefault(); setOver(stage); }}
                  onDragLeave={() => setOver(null)}
                  onDrop={drop(stage)}
                >
                  <header><span className="cap">{stage}</span><em className="tn">{list.length}</em><span className="grow" /><span className="sum tn">{money(list.reduce((sum, deal) => sum + (deal.amount ?? 0), 0), currency)}</span></header>
                  <div className="cards">
                    {list.map((deal) => <Card key={deal.id} deal={deal} onDrag={movable(deal) ? (event) => event.dataTransfer.setData("text/plain", deal.id) : undefined} />)}
                    {list.length === 0 && <div className="none">{t("pipeline.columnEmpty")}</div>}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="card ptable">
            <div className="scroll">
              <table className="table">
                <thead><tr><th>{t("pipeline.name")}</th><th>{t("pipeline.stage")}</th><th>{t("pipeline.next")}</th><th>{t("pipeline.owner")}</th><th>{t("pipeline.lastActivity")}</th><th className="r">{t("pipeline.value")}</th></tr></thead>
                <tbody>
                  {shown.map((deal) => (
                    <tr key={deal.id} className="click" onClick={() => inspect(`deal:${deal.id}`, <DealPanel deal={deal} />)}>
                      <td><span className="nm"><b className="clip" style={{ fontWeight: 500 }}>{deal.title}</b>{has(deal, "cold") && <Badge tone="warn">{t("pipeline.cold")}</Badge>}</span></td>
                      <td><Badge>{stageOf(deal)}</Badge></td>
                      <td className="muted clip nx">{nextStep(deal) ?? "–"}</td>
                      <td>{deal.assignee ?? "–"}</td>
                      <td className="muted">{deal.occurred_at ? age(deal.occurred_at) : "–"}</td>
                      <td className="r">{deal.amount ? money(deal.amount, deal.currency) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="faint" style={{ fontSize: 12 }}>{t("pipeline.moveHint")}</p>
      </div>
      {creating && sourceName && <NewDeal source={sourceName} stages={stages} onClose={() => setCreating(false)} />}
    </div>
  );
}
