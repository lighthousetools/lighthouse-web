import { ArrowDown, ArrowUp, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, must } from "../api/client";
import { language, t } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { Badge, Bars, Btn, Card, cx, Empty, Failure, Modal, Page, SearchField, Skeleton, Stat, Tabs, VirtualList } from "../ui";
import { Select } from "../ui/select";
import { useOrganizations } from "./connected";
import PostEditor from "./PostEditor";
import PostsCalendar, { whenOf } from "./PostsCalendar";
import { inPool, metricsOf, pillarName, statusLabel, statusTone, Tile, titleOf, useBrainImages, useImport, usePillars, usePostActions, usePosts, useSlots, type Pillar, type Post, type Slot } from "./publishing";
import "./posts.css";

type Tab = "calendar" | "posts" | "images" | "topics";
const locale = () => (language() === "de" ? "de-DE" : "en-GB");
const number = (value: number) => value.toLocaleString(locale());
const STATUSES = ["idea", "draft", "scheduled", "publishing", "published"] as const;

/** Sums up what went out: how many, how far they reached, what worked best. */
export function analytics(posts: Pick<Post, "status" | "metrics" | "title" | "body" | "id">[]) {
  const out = posts.filter((post) => post.status === "published");
  const impressions = out.reduce((sum, post) => sum + (metricsOf(post).impressions ?? 0), 0);
  const reactions = out.reduce((sum, post) => sum + (metricsOf(post).reactions ?? 0), 0);
  const best = [...out].sort((a, b) => (metricsOf(b).impressions ?? 0) - (metricsOf(a).impressions ?? 0))[0];
  return { count: out.length, impressions, reactions, perPost: out.length ? Math.round(reactions / out.length) : 0, best };
}

/** How a post's reach compares with your usual: 2.0× is twice the median. */
export function XFactor({ value }: { value: number }) {
  const tone = value >= 1.5 ? "ok" : value < 0.7 ? "bad" : "";
  return <Badge tone={tone}>{value.toLocaleString(language() === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}×</Badge>;
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [raw, setRaw] = useState("");
  const importer = useImport();
  const file = useRef<HTMLInputElement>(null);
  return (
    <Modal
      title={t("posts.importTitle")}
      sub={t("posts.importSub")}
      onClose={onClose}
      wide
      actions={<>
        <Btn onClick={() => file.current?.click()}><Upload />{t("posts.importFile")}</Btn>
        <span className="grow" />
        <Btn onClick={onClose}>{t("common.cancel")}</Btn>
        <Btn variant="primary" disabled={!raw.trim() || importer.isPending} onClick={() => importer.mutate(raw, { onSuccess: onClose })}>{t("posts.import")}</Btn>
      </>}
    >
      <input ref={file} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(event) => void event.target.files?.[0]?.text().then(setRaw)} />
      <textarea className="ta" style={{ width: "100%", minHeight: 220, fontFamily: "var(--mono)", fontSize: "var(--t-12)" }} aria-label={t("posts.importTitle")} placeholder={"published_at,body,url,impressions,reactions\n2026-01-12T08:00:00Z,\"…\",https://…,1200,34"} value={raw} onChange={(event) => setRaw(event.target.value)} />
      {importer.error && <p className="faint" style={{ color: "var(--bad)" }}>{(importer.error as Error).message}</p>}
    </Modal>
  );
}

type SortKey = "title" | "pillar" | "topic" | "status" | "date" | "impressions" | "x";

function Archive({ posts, pillars, onOpen }: { posts: Post[]; pillars: Pillar[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [pillar, setPillar] = useState("");
  const [sort, setSort] = useState<[SortKey, 1 | -1]>(["date", -1]);
  const [importing, setImporting] = useState(false);
  const stats = analytics(posts);
  const needle = query.toLowerCase();
  const list = useMemo(() => {
    const keyOf = (post: Post): string | number => {
      const [column] = sort;
      if (column === "title") return titleOf(post).toLowerCase();
      if (column === "pillar") return pillarName(pillars, post.pillar) ?? "￿";
      if (column === "topic") return post.topic ?? "￿";
      if (column === "status") return STATUSES.indexOf(post.status as (typeof STATUSES)[number]);
      if (column === "date") return whenOf(post) ?? post.created_at;
      if (column === "x") return post.x_factor ?? -1;
      return metricsOf(post)[column] ?? -1;
    };
    return posts
      .filter((post) => (!status || post.status === status) && (!pillar || post.pillar === pillar) && (!needle || `${post.title ?? ""} ${post.body} ${post.topic ?? ""}`.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const x = keyOf(a), y = keyOf(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort[1];
      });
  }, [posts, status, pillar, needle, sort]);
  const recent = posts.filter((post) => post.status === "published" && post.published_at).sort((a, b) => a.published_at!.localeCompare(b.published_at!)).slice(-16);
  const columns: [SortKey, string, string?][] = [["title", t("posts.col.post")], ["pillar", t("posts.pillar")], ["topic", t("posts.topic")], ["status", t("posts.col.status")], ["date", t("posts.col.date")], ["impressions", t("posts.metric.impressions"), "r"], ["x", t("posts.xFactor"), "r"]];
  return (
    <div className="ptb">
      <div className="parch" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr)) minmax(0,1.4fr)", gap: "var(--s2)", padding: "var(--s3) var(--s3) 0" }}>
        <Stat label={t("posts.stat.published")} value={number(stats.count)} />
        <Stat label={t("posts.metric.impressions")} value={number(stats.impressions)} />
        <Stat label={t("posts.stat.perPost")} value={number(stats.perPost)} />
        <Stat label={t("posts.stat.best")} value={<span className="clip" style={{ display: "block", fontSize: "var(--t-13)" }}>{stats.best ? titleOf(stats.best) : "–"}</span>} onClick={stats.best ? () => onOpen(stats.best!.id) : undefined} />
        <Card pad>
          <span className="faint" style={{ fontSize: "var(--t-12)" }}>{t("posts.stat.reach")}</span>
          {recent.length > 1 ? <Bars data={recent.map((post) => metricsOf(post).impressions ?? 0)} height={40} /> : <span className="faint" style={{ display: "block", fontSize: "var(--t-12)" }}>{t("posts.stat.noReach")}</span>}
        </Card>
      </div>
      <div className="ptf">
        <SearchField value={query} onChange={setQuery} placeholder={t("posts.searchPosts")} />
        <Select size="sm" label={t("posts.col.status")} value={status} onChange={setStatus} options={[["", t("posts.allStatuses")], ...STATUSES.map((item) => [item, statusLabel(item)] as const)]} />
        {pillars.length > 0 && <Select size="sm" label={t("posts.pillar")} value={pillar} onChange={setPillar} options={[["", t("posts.allPillars")], ...pillars.map((item) => [item.id, item.name] as const)]} />}
        <span className="grow" />
        <span className="faint tn">{t("posts.hits", { count: list.length })}</span>
        <Btn size="sm" onClick={() => setImporting(true)}><Upload />{t("posts.import")}</Btn>
      </div>
      <div className="pth2 pgrid" role="row">
        <span />
        {columns.map(([key, label, align]) => (
          <button type="button" key={key} className={cx(align, sort[0] === key && "on")} onClick={() => setSort([key, sort[0] === key ? (sort[1] === 1 ? -1 : 1) : 1])}>
            {label}{sort[0] === key && (sort[1] === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
          </button>
        ))}
      </div>
      {list.length ? (
        <VirtualList items={list} height={44} render={(post) => {
          const when = whenOf(post);
          const metrics = metricsOf(post);
          return (
            <div className="ptr pgrid" role="row" tabIndex={0} onClick={() => onOpen(post.id)} onKeyDown={(event) => event.key === "Enter" && onOpen(post.id)}>
              <span className="pt"><Tile post={post} color={pillars.find((item) => item.id === post.pillar)?.color} /></span>
              <span className="pcell1"><span className="grow" style={{ minWidth: 0 }}><span className="clip bt">{titleOf(post)}</span></span></span>
              <span className="clip muted">{pillarName(pillars, post.pillar) ?? <span className="faint">–</span>}</span>
              <span className="clip muted">{post.topic ?? <span className="faint">–</span>}</span>
              <span><Badge tone={statusTone(post.status)}>{statusLabel(post.status)}</Badge></span>
              <span className="tn muted">{when ? new Date(when).toLocaleDateString(locale(), { day: "numeric", month: "numeric", year: "2-digit" }) : <span className="faint">–</span>}</span>
              <span className="r tn muted">{metrics.impressions != null ? number(metrics.impressions) : "–"}</span>
              <span className="r tn">{post.x_factor != null ? <XFactor value={post.x_factor} /> : <span className="faint">–</span>}</span>
            </div>
          );
        }} />
      ) : (
        <Empty title={posts.length ? t("posts.noneInFilter") : t("posts.none")} sub={posts.length ? undefined : t("posts.noneSub")} action={posts.length ? <Btn size="sm" onClick={() => { setQuery(""); setStatus(""); setPillar(""); }}>{t("common.clear")}</Btn> : <Btn size="sm" onClick={() => setImporting(true)}><Upload />{t("posts.import")}</Btn>} />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}

function Images({ posts }: { posts: Post[] }) {
  const images = useBrainImages();
  const used = (id: string) => posts.filter((post) => post.images.includes(id)).length;
  if (images.isLoading) return <div className="imgs"><Skeleton /></div>;
  const list = images.data ?? [];
  return (
    <div className="imgs">
      <div className="imgh"><span className="faint">{t("posts.imagesHint")}</span><span className="grow" /><span className="faint tn">{list.length}</span></div>
      <div className="imgscroll">
        {list.length ? (
          <div className="imgg">
            {list.map((entry) => (
              <button type="button" key={entry.id} className="imgc" onClick={() => go("brain", entry.id)} title={entry.title}>
                <span style={{ gridColumn: "1 / -1", aspectRatio: "1", display: "block", borderRadius: "var(--r)", overflow: "hidden" }}><Tile image={entry.id} /></span>
                <span className="clip">{entry.title}</span>
                <span className="faint tn">{used(entry.id) ? t("posts.usedIn", { count: used(entry.id) }) : ""}</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty title={t("posts.noImagesTitle")} sub={t("posts.noImages")} />
        )}
      </div>
    </div>
  );
}

const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pillar";

function PillarCard({ pillar, posts }: { pillar: Pillar; posts: Post[] }) {
  const client = useQueryClient();
  const [topic, setTopic] = useState("");
  const save = (patch: Partial<Pillar>) =>
    must(api.PUT("/posts/pillars/{id}", { params: { path: { id: pillar.id } }, body: { name: pillar.name, description: pillar.description, color: pillar.color, topics: pillar.topics, ...patch } }))
      .then(() => client.invalidateQueries({ queryKey: ["posts"] }), (error: Error) => toast(error.message, "bad"));
  const remove = () => must(api.DELETE("/posts/pillars/{id}", { params: { path: { id: pillar.id } } })).then(() => client.invalidateQueries({ queryKey: ["posts"] }));
  const mine = posts.filter((post) => post.pillar === pillar.id);
  return (
    <Card pad>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
        <input type="color" aria-label={t("posts.color")} value={pillar.color ?? "#7c6cff"} onChange={(event) => void save({ color: event.target.value })} style={{ width: 20, height: 20, border: 0, padding: 0, background: "none" }} />
        <b style={{ fontWeight: 500 }}>{pillar.name}</b>
        <span className="faint tn">{t("posts.postsCount", { count: mine.length })}</span>
        <span className="grow" />
        <Btn icon size="xs" variant="ghost" aria-label={t("common.delete")} onClick={() => void remove()}><Trash2 /></Btn>
      </div>
      <input className="enn" style={{ marginTop: 6 }} aria-label={t("posts.description")} placeholder={t("posts.descriptionHint")} defaultValue={pillar.description ?? ""} onBlur={(event) => event.target.value !== (pillar.description ?? "") && void save({ description: event.target.value || null })} />
      <div className="xp" style={{ marginTop: "var(--s2)" }}>
        {pillar.topics.map((item) => (
          <button type="button" key={item} title={t("posts.removeTopic")} onClick={() => void save({ topics: pillar.topics.filter((name) => name !== item) })}>
            {item} <span className="faint tn">{mine.filter((post) => post.topic === item).length}</span>
          </button>
        ))}
        <input className="enn" style={{ width: 140 }} aria-label={t("posts.addTopic")} placeholder={t("posts.addTopic")} value={topic} onChange={(event) => setTopic(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && topic.trim()) {
            void save({ topics: [...pillar.topics, topic.trim()] });
            setTopic("");
          }
        }} />
      </div>
    </Card>
  );
}

function Rhythm({ slots, pillars }: { slots: Slot[]; pillars: Pillar[] }) {
  const client = useQueryClient();
  const orgs = useOrganizations();
  const [rows, setRows] = useState<Slot[] | null>(null);
  const list = rows ?? slots;
  const days = Array.from({ length: 7 }, (_, index) => [String(index + 1), new Date(2024, 0, 1 + index).toLocaleDateString(locale(), { weekday: "short" })] as const);
  const change = (index: number, patch: Partial<Slot>) => setRows(list.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  const save = () =>
    must(api.PUT("/posts/slots", { body: list }))
      .then(() => {
        setRows(null);
        toast(t("posts.rhythmSaved"));
        return client.invalidateQueries({ queryKey: ["posts"] });
      }, (error: Error) => toast(error.message, "bad"));
  return (
    <Card title={t("posts.rhythm")} hint={t("posts.rhythmHint")} actions={rows && <Btn size="xs" variant="primary" onClick={() => void save()}>{t("common.save")}</Btn>}>
      <div className="tlist">
        {list.map((slot, index) => (
          <div className="trow" key={slot.id} style={{ height: "auto", minHeight: 40, flexWrap: "wrap", rowGap: 4, padding: "4px var(--s2)" }}>
            <Select size="sm" width={68} label={t("posts.weekday")} value={String(slot.weekday)} onChange={(value) => change(index, { weekday: Number(value) })} options={days} />
            <input className="field" type="time" style={{ width: 84, height: "var(--h-sm)", flex: "none" }} aria-label={t("posts.time")} value={slot.time} onChange={(event) => change(index, { time: event.target.value })} />
            <Select size="sm" width={112} label={t("posts.pillar")} value={slot.pillar ?? ""} onChange={(value) => change(index, { pillar: value || null })} options={[["", t("posts.anyPillar")], ...pillars.map((item) => [item.id, item.name] as const)]} />
            {(orgs.data ?? []).length > 0 && <Select size="sm" width={112} label={t("posts.account")} value={slot.org ?? ""} onChange={(value) => change(index, { org: value || null })} options={[["", t("posts.personal")], ...(orgs.data ?? []).map((item) => [item.id, item.name] as const)]} />}
            <span className="grow" />
            <Btn icon size="xs" variant="ghost" aria-label={t("common.delete")} onClick={() => setRows(list.filter((_, at) => at !== index))}><Trash2 /></Btn>
          </div>
        ))}
        <div className="trow"><Btn size="sm" variant="ghost" onClick={() => setRows([...list, { id: crypto.randomUUID(), weekday: 2, time: "08:00", pillar: null, org: null }])}><Plus />{t("posts.addSlot")}</Btn></div>
      </div>
    </Card>
  );
}

function Topics({ posts }: { posts: Post[] }) {
  const pillars = usePillars();
  const slots = useSlots();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const add = () => {
    const clean = name.trim();
    if (!clean) return;
    void must(api.PUT("/posts/pillars/{id}", { params: { path: { id: slug(clean) } }, body: { name: clean, topics: [], color: null, description: null } }))
      .then(() => client.invalidateQueries({ queryKey: ["posts"] }), (error: Error) => toast(error.message, "bad"));
    setName("");
  };
  const list = pillars.data ?? [];
  return (
    <div className="ptop">
      <div className="ptoph"><span className="faint">{t("posts.topicsHint")}</span></div>
      <div className="ptopg">
        <div style={{ display: "grid", gap: "var(--s3)" }}>
          {list.map((pillar) => <PillarCard key={pillar.id} pillar={pillar} posts={posts} />)}
          <div style={{ display: "flex", gap: "var(--s2)" }}>
            <input className="field" style={{ flex: 1, height: "var(--h-sm)" }} aria-label={t("posts.newPillar")} placeholder={t("posts.newPillar")} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} />
            <Btn size="sm" disabled={!name.trim()} onClick={add}><Plus />{t("posts.addPillar")}</Btn>
          </div>
          {list.length > 0 && (
            <Card title={t("posts.mix")}>
              <div className="mtx" style={{ gridTemplateColumns: `minmax(120px,1fr) repeat(${STATUSES.length},minmax(0,72px))`, padding: "0 var(--s3) var(--s3)" }}>
                <span />
                {STATUSES.map((status) => <span key={status} className="mh">{statusLabel(status)}</span>)}
                {list.map((pillar) => (
                  <Row key={pillar.id} pillar={pillar} posts={posts} />
                ))}
              </div>
            </Card>
          )}
        </div>
        <Rhythm slots={slots.data ?? []} pillars={list} />
      </div>
    </div>
  );
}

function Row({ pillar, posts }: { pillar: Pillar; posts: Post[] }) {
  return (
    <>
      <span className="ml"><span className="clip">{pillar.name}</span></span>
      {STATUSES.map((status) => {
        const count = posts.filter((post) => post.pillar === pillar.id && post.status === status).length;
        return <span key={status} className="mc tn" style={{ display: "grid", placeItems: "center", borderRadius: "var(--r-sm)", background: count ? `color-mix(in srgb, ${pillar.color ?? "var(--accent)"} ${Math.min(60, 12 + count * 8)}%, transparent)` : "var(--wash)" }}>{count || ""}</span>;
      })}
    </>
  );
}

export default function Posts() {
  const route = useRoute();
  const posts = usePosts();
  const pillars = usePillars();
  const actions = usePostActions();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("calendar");
  const open = (id: string) => go("posts", id);
  const all = posts.data ?? [];
  const pool = all.filter(inPool).length;
  const planned = all.filter((post) => post.status === "scheduled").length;
  const waiting = all.filter((post) => post.status === "publishing").length;
  const create = () =>
    actions.create({ body: "", status: "draft", images: [] }).then((post) => open(post.id), (error: Error) => toast(error.message, "bad"));
  return (
    <Page flush>
      <div className="pst">
        <header className="psth">
          <div className="grow">
            <h1>{t("nav.posts")}</h1>
            <p className="tn">{t("posts.summary", { posts: all.length, pool, planned, waiting })}</p>
          </div>
          <Tabs value={tab} onChange={setTab} options={[["calendar", t("posts.tab.calendar")], ["posts", t("posts.tab.posts")], ["images", t("posts.tab.images")], ["topics", t("posts.tab.topics")]]} />
          <div className="acts">
            <Btn icon size="sm" variant="ghost" aria-label={t("posts.reload")} title={t("posts.reload")} onClick={() => void client.invalidateQueries({ queryKey: ["posts"] })}><RefreshCcw /></Btn>
            <Btn variant="primary" size="sm" onClick={() => void create()}><Plus />{t("posts.new")}</Btn>
          </div>
        </header>
        <div className="pstb">
          {posts.error ? <Failure error={posts.error} /> : posts.isLoading ? <Skeleton /> : (
            <>
              {tab === "calendar" && <PostsCalendar onOpen={open} />}
              {tab === "posts" && <Archive posts={all} pillars={pillars.data ?? []} onOpen={open} />}
              {tab === "images" && <Images posts={all} />}
              {tab === "topics" && <Topics posts={all} />}
            </>
          )}
        </div>
        {route.param && <PostEditor key={route.param} id={route.param} onClose={() => go("posts")} />}
      </div>
    </Page>
  );
}
