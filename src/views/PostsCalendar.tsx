import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Lock, PanelLeft, RefreshCw, Sparkles, Unlock, Wand2, X } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { api, must, type Schemas } from "../api/client";
import { useMe } from "../data";
import { language, t } from "../i18n";
import { toast } from "../shell/state";
import { Avatar, Badge, Btn, cx, Empty, Menu, SearchField, Seg } from "../ui";
import { Select } from "../ui/select";
import { useOrganizations } from "./connected";
import { addDays, dayIso, isoWeek, monthDays, nearestTime, openGaps, sameDay, suggestFor, weekStart, weekdayOf } from "./postdates";
import { fromZone, inZone, validZone } from "./zone";
import { inPool, pillarName, statusLabel, statusTone, Tile, titleOf, usePillars, usePostActions, usePosts, useSlots, type Pillar, type Post } from "./publishing";

const locale = () => (language() === "de" ? "de-DE" : "en-GB");
const dm = (date: Date) => date.toLocaleDateString(locale(), { day: "numeric", month: "numeric" });
const dow = (date: Date) => date.toLocaleDateString(locale(), { weekday: "short" }).replace(".", "");
const DRAG = "application/x-lighthouse-post";

type CalendarSlot = { at: string; posts: string[]; blocked?: string | null; slot: { id: string; org?: string | null; pillar?: string | null; time: string; weekday: number } };
type Lane = { org: string; times: string[]; days: number[] };

function useCalendar(from: Date, days: number) {
  return useQuery({
    queryKey: ["posts", "calendar", dayIso(from), days],
    queryFn: () => must(api.GET("/posts/calendar", { params: { query: { from: dayIso(from), days } } })) as Promise<CalendarSlot[]>,
  });
}

const fits = (gap: CalendarSlot, post: Post) => !gap.slot.org || !post.org || post.org === gap.slot.org;

/** Hands out the pool over the gaps so that no post is suggested twice. */
export function assignGaps(gaps: CalendarSlot[], pool: Post[]) {
  const used = new Set<string>();
  const out = new Map<string, Post>();
  for (const gap of gaps) {
    const post = suggestFor(pool.filter((item) => !used.has(item.id) && fits(gap, item)), gap.slot.pillar);
    if (!post) continue;
    used.add(post.id);
    out.set(gap.at + gap.slot.id, post);
  }
  return out;
}

/** When a post is on the calendar: its time to go out, or when it went out. */
export const whenOf = (post: Post) => post.scheduled_at ?? post.published_at ?? null;

function startDrag(event: DragEvent, id: string) {
  event.dataTransfer.setData(DRAG, id);
  event.dataTransfer.effectAllowed = "move";
}

function Card({ post, color, label, zone, onOpen, onUnplan }: { post: Post; color?: string | null; label?: string | null; zone?: string; onOpen: () => void; onUnplan: () => void }) {
  const when = whenOf(post);
  const out = post.status === "published" || post.status === "publishing";
  return (
    <div className="drg" draggable={!out} onDragStart={(event) => startDrag(event, post.id)} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpen()}>
      <div className={cx("pcard", post.status === "published" && "done")}>
        <div className="pcth">
          <Tile post={post} color={color} />
          {when && <span className="tm tn">{inZone(when, zone).time}</span>}
          {!out && (
            <button type="button" className="rm" aria-label={t("posts.unplan")} title={t("posts.unplan")} onClick={(event) => { event.stopPropagation(); onUnplan(); }}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="bd">
          <span className="tt">{titleOf(post)}</span>
          <span className="mt"><Badge tone={statusTone(post.status)}>{statusLabel(post.status)}</Badge>{label && <Badge>{label}</Badge>}</span>
        </div>
      </div>
    </div>
  );
}

function GapCard({ gap, pool, first, onOpen, onFill }: { gap: CalendarSlot; pool: Post[]; first?: Post; onOpen: (id: string) => void; onFill: (post: Post) => void }) {
  const [skip, setSkip] = useState(0);
  const candidates = pool.filter((post) => fits(gap, post));
  const suggestion = skip === 0 && first ? first : suggestFor(candidates, gap.slot.pillar, skip);
  return (
    <div className="pgap">
      <div className="pgh">
        <i />{t("posts.gap")}
        {candidates.length > 1 && <Btn icon size="xs" variant="ghost" title={t("posts.otherSuggestion")} aria-label={t("posts.otherSuggestion")} onClick={() => setSkip(skip + 1)}><RefreshCw /></Btn>}
      </div>
      {suggestion ? (
        <>
          <button type="button" className="sg" onClick={() => onOpen(suggestion.id)}>{titleOf(suggestion)}</button>
          <Btn size="xs" onClick={() => onFill(suggestion)}><Sparkles />{t("posts.fillGap")}</Btn>
        </>
      ) : (
        <span className="faint">{t("posts.poolEmpty")}</span>
      )}
    </div>
  );
}

function Pool({ posts, pillars, onOpen, onClose }: { posts: Post[]; pillars: Pillar[]; onOpen: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [pillar, setPillar] = useState("");
  const needle = query.toLowerCase();
  const list = posts.filter((post) => (!pillar || post.pillar === pillar) && (!needle || `${post.title ?? ""} ${post.body} ${post.topic ?? ""}`.toLowerCase().includes(needle)));
  const colorOf = (name?: string | null) => pillars.find((item) => item.id === name)?.color;
  return (
    <aside className="ppool" aria-label={t("posts.pool")}>
      <div className="poolh"><b>{t("posts.pool")}</b><span className="faint tn">{posts.length}</span><Btn icon size="xs" variant="ghost" aria-label={t("posts.hidePool")} title={t("posts.hidePool")} onClick={onClose}><PanelLeft /></Btn></div>
      <div className="poolq"><SearchField value={query} onChange={setQuery} placeholder={t("posts.search")} /></div>
      {pillars.length > 0 && (
        <div className="poolf">
          <Select size="sm" label={t("posts.pillar")} value={pillar} onChange={setPillar} options={[["", t("posts.allPillars")], ...pillars.map((item) => [item.id, item.name] as const)]} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {list.length ? list.map((post) => (
          <div key={post.id} className="drg pi" draggable onDragStart={(event) => startDrag(event, post.id)} onClick={() => onOpen(post.id)} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpen(post.id)}>
            <span className="pth"><Tile post={post} color={colorOf(post.pillar)} /></span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="tt">{titleOf(post)}</span>
              <span className="sbt clip">{post.origin === "agent" && <Badge tone="vio">{t("posts.suggested")}</Badge>}{[pillarName(pillars, post.pillar), post.topic].filter(Boolean).join(" · ") || statusLabel(post.status)}</span>
            </span>
          </div>
        )) : (
          <div className="poolempty"><b>{t("posts.poolEmpty")}</b><span className="faint">{t("posts.poolEmptySub")}</span></div>
        )}
      </div>
    </aside>
  );
}

const REASONS = ["holiday", "travel", "onsite"] as const;

/** Days without posts, such as holidays: kept on the server, so the calendar and its gaps skip them. */
function useBlockedDays() {
  const client = useQueryClient();
  const days = useQuery({ queryKey: ["posts", "blocked"], queryFn: () => must(api.GET("/posts/blocked-days")) });
  const save = useMutation({
    mutationFn: (next: Schemas["BlockedDay"][]) => must(api.PUT("/posts/blocked-days", { body: next })),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["posts"] }),
    onError: (error) => toast(error.message, "bad"),
  });
  const list = days.data ?? [];
  return {
    reasonOf: (day: string) => list.find((entry) => entry.date === day)?.reason ?? (list.some((entry) => entry.date === day) ? "" : undefined),
    block: (day: string, reason: string) => save.mutate([...list.filter((entry) => entry.date !== day), { date: day, reason }]),
    unblock: (day: string) => save.mutate(list.filter((entry) => entry.date !== day)),
  };
}

export default function PostsCalendar({ onOpen }: { onOpen: (id: string) => void }) {
  const posts = usePosts();
  const slots = useSlots();
  const pillars = usePillars();
  const orgs = useOrganizations();
  const me = useMe();
  const actions = usePostActions();
  const blocked = useBlockedDays();
  const [mode, setMode] = useState<"week" | "month">("week");
  const [offset, setOffset] = useState(0);
  const [showPool, setShowPool] = useState(true);
  const [over, setOver] = useState<string | null>(null);
  // Days follow the owner's time zone, like the server's slots.
  const zone = validZone(me.data?.timezone);
  const [ty, tm, td] = inZone(new Date(), zone).day.split("-").map(Number);
  const today = new Date(ty!, tm! - 1, td!);
  const dayOf = (instant: string) => inZone(instant, zone).day;
  const timeOf = (instant: string) => inZone(instant, zone).time;
  const start = mode === "week" ? addDays(weekStart(today), offset * 7) : new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const days = mode === "week" ? Array.from({ length: 7 }, (_, index) => addDays(start, index)) : monthDays(start);
  const calendar = useCalendar(days[0]!, days.length);
  const all = posts.data ?? [];
  const pool = all.filter(inPool);
  const byId = new Map(all.map((post) => [post.id, post]));
  const colorOf = (name?: string | null) => pillars.data?.find((item) => item.id === name)?.color;
  const gaps = openGaps((calendar.data ?? []).filter((slot) => !slot.blocked), new Date());

  // Slot times are in the server's time zone, which is the owner's zone the calendar shows.
  const localTime = (slot: { time: string }) => slot.time;
  const lanes = useMemo<Lane[]>(() => {
    const map = new Map<string, Lane>();
    for (const slot of slots.data ?? []) {
      const lane = map.get(slot.org ?? "") ?? { org: slot.org ?? "", times: [], days: [] };
      const time = localTime(slot);
      if (!lane.times.includes(time)) lane.times.push(time);
      if (!lane.days.includes(slot.weekday)) lane.days.push(slot.weekday);
      map.set(lane.org, lane);
    }
    for (const post of all) {
      if (whenOf(post) && !map.has(post.org ?? "")) map.set(post.org ?? "", { org: post.org ?? "", times: ["09:00"], days: [] });
    }
    if (!map.size) map.set("", { org: "", times: ["09:00"], days: [] });
    return [...map.values()].map((lane) => ({ ...lane, times: lane.times.sort(), days: lane.days.sort() }));
  }, [slots.data, all]);

  const laneName = (org: string) => (org ? orgs.data?.find((item) => item.id === org)?.name ?? org : me.data?.name ?? t("posts.personal"));

  const schedule = (id: string, at: string, org: string) => {
    const post = byId.get(id);
    if (!post) return;
    void actions.patch(id, { scheduled_at: at, ...(org !== (post.org ?? "") ? { org: org || null } : {}) }).then((saved) => {
      if (saved) toast(t("posts.planned", { when: new Date(at).toLocaleString(locale(), { timeZone: zone, weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) }));
    });
  };
  const unplan = (id: string) => void actions.patch(id, { scheduled_at: null }).then(() => toast(t("posts.backInPool")));
  const fill = (gap: CalendarSlot, post: Post) => schedule(post.id, gap.at, gap.slot.org ?? "");
  const shown = gaps.filter((gap) => days.some((day) => dayOf(gap.at) === dayIso(day)));
  const assigned = assignGaps(shown, pool);
  const fillAll = () => {
    for (const gap of shown) {
      const post = assigned.get(gap.at + gap.slot.id);
      if (post) void actions.patch(post.id, { scheduled_at: gap.at, ...(gap.slot.org && gap.slot.org !== post.org ? { org: gap.slot.org } : {}) });
    }
    toast(t("posts.gapsFilled", { count: assigned.size }));
  };

  const dropProps = (key: string, day: Date, time: string, org: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG) || day < today) return;
      event.preventDefault();
      setOver(key);
    },
    onDragLeave: () => setOver((current) => (current === key ? null : current)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setOver(null);
      const id = event.dataTransfer.getData(DRAG);
      // Prefer the slot's own instant, which the server computed in its time zone.
      const slot = (calendar.data ?? []).find((entry) => (entry.slot.org ?? "") === org && localTime(entry.slot) === time && dayOf(entry.at) === dayIso(day));
      if (id && day >= today) schedule(id, slot?.at ?? fromZone(dayIso(day), time, zone), org);
    },
  });

  const postsOn = (day: Date, lane?: Lane) =>
    all.filter((post) => {
      const when = whenOf(post);
      return when && dayOf(when) === dayIso(day) && (!lane || (post.org ?? "") === lane.org);
    });

  const header = mode === "week"
    ? <h2>{t("posts.week", { week: isoWeek(start) })}<span className="tn">{dm(days[0]!)} – {dm(days[6]!)}</span></h2>
    : <h2>{start.toLocaleDateString(locale(), { month: "long", year: "numeric" })}</h2>;
  const visibleGaps = shown.length;

  return (
    <div className={cx("pcal", !showPool && "nopool")}>
      {showPool && <Pool posts={pool} pillars={pillars.data ?? []} onOpen={onOpen} onClose={() => setShowPool(false)} />}
      <div className="pcalm">
        <div className="pcalh">
          {!showPool && <Btn icon size="sm" variant="ghost" aria-label={t("posts.showPool")} title={t("posts.showPool")} onClick={() => setShowPool(true)}><PanelLeft /></Btn>}
          <div className="nav">
            <Btn icon size="sm" aria-label={t("posts.previous")} onClick={() => setOffset(offset - 1)}><ChevronLeft /></Btn>
            <Btn size="sm" onClick={() => setOffset(0)}>{t("posts.today")}</Btn>
            <Btn icon size="sm" aria-label={t("posts.next")} onClick={() => setOffset(offset + 1)}><ChevronRight /></Btn>
          </div>
          {header}
          <span className="grow" />
          {visibleGaps > 0 && pool.length > 0 && <Btn size="sm" onClick={fillAll}><Wand2 />{t("posts.fillGaps", { count: visibleGaps })}</Btn>}
          <Seg label={t("posts.range")} value={mode} onChange={(value) => { setMode(value); setOffset(0); }} options={[["week", t("posts.weekView")], ["month", t("posts.monthView")]]} />
        </div>
        {mode === "week" ? (
          <div className="pwk">
            <div className="pwkh">
              <span />
              {days.map((day) => (
                <span key={dayIso(day)}>
                  <Menu
                    label={t("posts.blockDay")}
                    items={blocked.reasonOf(dayIso(day)) !== undefined
                      ? [{ label: t("posts.unblock"), icon: <Unlock size={14} />, run: () => blocked.unblock(dayIso(day)) }]
                      : REASONS.map((reason) => ({ label: t("posts.blockFor", { reason: t(`posts.reason.${reason}`) }), icon: <Lock size={14} />, run: () => blocked.block(dayIso(day), t(`posts.reason.${reason}`)) }))}
                    trigger={(open) => (
                      <button type="button" className={cx("pdh", sameDay(day, today) && "td", blocked.reasonOf(dayIso(day)) !== undefined && "blk")} onClick={open} title={t("posts.blockHint")}>
                        <b>{dow(day)}</b><span className="tn">{dm(day)}</span>
                        {blocked.reasonOf(dayIso(day)) && <em className="clip">{blocked.reasonOf(dayIso(day))}</em>}
                      </button>
                    )}
                  />
                </span>
              ))}
            </div>
            {lanes.map((lane) => {
              const planned = days.reduce((sum, day) => sum + postsOn(day, lane).length, 0);
              return (
                <section className="plane" key={lane.org || "me"} aria-label={laneName(lane.org)}>
                  <div className="plh">
                    <Avatar name={laneName(lane.org)} size={18} />
                    <b>{laneName(lane.org)}</b>
                    <span className="faint">{lane.days.map((day) => dow(addDays(weekStart(today), day - 1))).join(", ")} {lane.times.join(", ")}</span>
                    <span className="faint tn" style={{ marginLeft: "auto" }}>{t("posts.plannedOf", { planned, slots: lane.days.length * lane.times.length })}</span>
                  </div>
                  {lane.times.map((time, row) => (
                    <div className={cx("pwkr", row === 0 ? "main" : "alt")} key={time}>
                      <span className="ptl tn">{time}</span>
                      {days.map((day) => {
                        const key = `${lane.org}|${dayIso(day)}|${time}`;
                        const here = postsOn(day, lane).filter((post) => nearestTime(lane.times, timeOf(whenOf(post)!)) === time);
                        const gap = (calendar.data ?? []).find((slot) => (slot.slot.org ?? "") === lane.org && localTime(slot.slot) === time && dayOf(slot.at) === dayIso(day));
                        const isGap = gap && !gap.posts.length && !gap.blocked && new Date(gap.at) > new Date();
                        const weekend = (weekdayOf(day) > 5 && !lane.days.includes(weekdayOf(day))) || blocked.reasonOf(dayIso(day)) !== undefined;
                        const dragged = over === key;
                        return (
                          <div key={key} className={cx("pcell", weekend && "blk", day < today && "past", sameDay(day, today) && "td", dragged && "over")} {...dropProps(key, day, time, lane.org)}>
                            {here.map((post) => <Card key={post.id} post={post} zone={zone} color={colorOf(post.pillar)} label={pillarName(pillars.data, post.pillar)} onOpen={() => onOpen(post.id)} onUnplan={() => unplan(post.id)} />)}
                            {!here.length && isGap && <GapCard gap={gap} pool={pool} first={assigned.get(gap.at + gap.slot.id)} onOpen={onOpen} onFill={(post) => fill(gap, post)} />}
                            {dragged && <span className="droptime tn">{time}</span>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="pmo">
            <div className="pmoh">{days.slice(0, 7).map((day) => <span key={dayIso(day)}>{dow(day)}</span>)}</div>
            <div className="pmog">
              {days.map((day) => {
                const key = `month|${dayIso(day)}`;
                const dayGaps = gaps.filter((gap) => dayOf(gap.at) === dayIso(day));
                const firstSlot = (calendar.data ?? []).find((slot) => dayOf(slot.at) === dayIso(day));
                const time = firstSlot ? timeOf(firstSlot.at) : "09:00";
                return (
                  <div key={key} className={cx("pmd", day.getMonth() !== start.getMonth() && "out", sameDay(day, today) && "td", over === key && "over")} {...dropProps(key, day, time, firstSlot?.slot.org ?? "")}>
                    <button type="button" className="pmn" onClick={() => { setMode("week"); setOffset(Math.round((weekStart(day).getTime() - weekStart(today).getTime()) / (7 * 86_400_000))); }}>
                      <span className="tn">{day.getDate()}</span>
                    </button>
                    {postsOn(day).map((post) => (
                      <button type="button" key={post.id} className="mchip drg" draggable={post.status !== "published"} onDragStart={(event) => startDrag(event, post.id)} onClick={() => onOpen(post.id)}>
                        <i className={cx("sd", statusTone(post.status))} /><span className="clip">{titleOf(post)}</span>
                      </button>
                    ))}
                    {dayGaps.map((gap) => <span key={gap.at + gap.slot.id} className="mgap"><i />{t("posts.gap")} {timeOf(gap.at)}</span>)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!slots.isLoading && !(slots.data ?? []).length && (
          <div style={{ padding: "0 var(--s3) var(--s3)" }}>
            <Empty title={t("posts.noSlots")} sub={t("posts.noSlotsSub")} />
          </div>
        )}
      </div>
    </div>
  );
}
