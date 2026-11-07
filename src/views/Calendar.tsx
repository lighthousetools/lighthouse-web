import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, Plus, Target, Users, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, must } from "../api/client";
import { language, t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { Btn, Empty, Failure, Seg, ServiceIcon, Skeleton } from "../ui";
import { useNow } from "../ui/live";
import { Freshness, NoSource, canDo, field, openItem, useAction, useDomains, useItems, useSources, type Item } from "./connected";
import { addDays, dayIso } from "./taskdates";
import "./cal.css";

type Mode = "day" | "week";
const START = 7;
const END = 20;

const locale = () => (language() === "de" ? "de-DE" : "en-GB");
const hm = (date: Date) => date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

/** The Monday of the week that holds `date`. */
export function weekStart(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

/** Top and height of an event in a day column, in hours from the start of the grid, clamped to the grid. */
export function place(starts: Date, ends: Date, start = START, end = END) {
  const from = Math.max(start, starts.getHours() + starts.getMinutes() / 60);
  const to = Math.min(end, ends.getHours() + ends.getMinutes() / 60 || end);
  return { top: from - start, height: Math.max(0.35, to - from) };
}

/** Free time in working hours between busy blocks, at least 30 minutes long. */
export function freeSlots(busy: { starts_at: string; ends_at: string }[], day: Date, start = 9, end = 18) {
  const open = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start).getTime();
  const close = new Date(day.getFullYear(), day.getMonth(), day.getDate(), end).getTime();
  const blocks = busy
    .map((block) => [Math.max(open, Date.parse(block.starts_at)), Math.min(close, Date.parse(block.ends_at))] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const slots: [Date, Date][] = [];
  let cursor = open;
  for (const [a, b] of blocks) {
    if (a - cursor >= 30 * 60_000) slots.push([new Date(cursor), new Date(a)]);
    cursor = Math.max(cursor, b);
  }
  if (close - cursor >= 30 * 60_000) slots.push([new Date(cursor), new Date(close)]);
  return slots;
}

const isAllDay = (item: Item) => !!item.starts_at && /^\d{4}-\d{2}-\d{2}$/.test(item.starts_at);

function EventPanel({ item, onClose }: { item: Item; onClose: () => void }) {
  const sources = useSources();
  const action = useAction();
  const starts = new Date(item.starts_at!);
  const ends = new Date(item.ends_at ?? item.starts_at!);
  const [from, setFrom] = useState(toLocalInput(starts));
  const [to, setTo] = useState(toLocalInput(ends));
  const canMove = canDo(sources.data, "calendar", "move", item.source) || canDo(sources.data, "calendar", "update", item.source);
  const moveName = canDo(sources.data, "calendar", "move", item.source) ? "move" : "update";
  const changed = from !== toLocalInput(starts) || to !== toLocalInput(ends);
  const location = field(item, "location");
  const attendees = (item.data as { attendees?: ({ email?: string; name?: string; displayName?: string } | string)[] } | null)?.attendees ?? [];
  return (
    <aside className="cal-side" aria-label={t("calendar.event")}>
      <div className="cal-sh2">
        <ServiceIcon name={item.source} fallback={item.source} size={16} />
        <b className="grow clip">{t("calendar.event")}</b>
        <Btn icon size="xs" variant="ghost" aria-label={t("common.close")} onClick={onClose}><X /></Btn>
      </div>
      <div className="cal-sb">
        <div className="cal-tt">{item.title ?? t("calendar.untitled")}</div>
        <div className="cal-tm">
          <Clock size={13} />
          <input type="datetime-local" aria-label={t("calendar.starts")} value={from} disabled={!canMove} onChange={(event) => setFrom(event.target.value)} />
          –
          <input type="datetime-local" aria-label={t("calendar.ends")} value={to} disabled={!canMove} onChange={(event) => setTo(event.target.value)} />
        </div>
        {changed && <div className="cal-warnbox">{t("calendar.moveHint")}</div>}
        {location && <div className="cal-ln"><MapPin size={14} />{location}</div>}
        {item.author && <div className="cal-ln"><Users size={14} />{t("calendar.organizer", { name: item.author })}</div>}
        {attendees.length > 0 && (
          <div className="cal-sc">
            <h3>{t("calendar.attendees")}<small>{attendees.length}</small></h3>
            {attendees.slice(0, 20).map((person, index) => (
              <div key={index} className="cal-pp"><span className="clip">{typeof person === "string" ? person : person.displayName ?? person.name ?? person.email}</span></div>
            ))}
          </div>
        )}
        {item.summary && (
          <div className="cal-sc">
            <h3>{t("calendar.notes")}</h3>
            <p style={{ fontSize: 13, lineHeight: "20px", color: "var(--ink2)", whiteSpace: "pre-wrap" }}>{item.summary}</p>
          </div>
        )}
      </div>
      <div className="cal-sf">
        {item.url && <Btn size="sm" variant="ghost" onClick={() => openItem(item)}><ExternalLink />{t("connected.openIn")}</Btn>}
        <span className="grow" />
        {canMove && (
          <Btn
            size="sm"
            variant="primary"
            disabled={!changed || action.isPending}
            onClick={() => action.mutate({ item: item.id, action: moveName, input: { start: new Date(from).toISOString(), end: new Date(to).toISOString() } })}
          >
            {t("calendar.move")}
          </Btn>
        )}
      </div>
    </aside>
  );
}

function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function NewEvent({ day, starts, minutes = 60, onClose }: { day: Date; starts?: Date; minutes?: number; onClose: () => void }) {
  const sources = useSources();
  const action = useAction();
  const source = (sources.data ?? []).find((item) => item.domain === "calendar" && item.actions.includes("create"));
  const [title, setTitle] = useState("");
  const start = starts ?? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10);
  const [from, setFrom] = useState(toLocalInput(start));
  const [to, setTo] = useState(toLocalInput(new Date(start.getTime() + minutes * 60_000)));
  return (
    <aside className="cal-side" aria-label={t("calendar.new")}>
      <div className="cal-sh2">
        <b className="grow">{t("calendar.new")}</b>
        <Btn icon size="xs" variant="ghost" aria-label={t("common.close")} onClick={onClose}><X /></Btn>
      </div>
      <div className="cal-sb">
        {!source && <div className="cal-warnbox">{t("calendar.noCreate")}</div>}
        <input className="cal-inp" autoFocus aria-label={t("calendar.title")} placeholder={t("calendar.title")} value={title} onChange={(event) => setTitle(event.target.value)} />
        <div className="cal-tm">
          <Clock size={13} />
          <input type="datetime-local" aria-label={t("calendar.starts")} value={from} onChange={(event) => setFrom(event.target.value)} />
          –
          <input type="datetime-local" aria-label={t("calendar.ends")} value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <p className="cal-hintp faint" style={{ fontSize: 12, marginTop: 12 }}>{t("calendar.createHint")}</p>
      </div>
      <div className="cal-sf">
        <span className="grow" />
        <Btn
          size="sm"
          variant="primary"
          disabled={!source || !title.trim() || action.isPending}
          onClick={() =>
            action.mutate(
              { source: source!.name, action: "create", input: { title: title.trim(), summary: title.trim(), start: new Date(from).toISOString(), end: new Date(to).toISOString() } },
              { onSuccess: onClose },
            )
          }
        >
          {t("calendar.propose")}
        </Btn>
      </div>
    </aside>
  );
}

/** Blocks focus time through the calendar's create action. A writing tool waits for approval. */
function useFocus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: { source: string; title: string; minutes: number; starts_at?: string }) => {
      const { data, error, response } = await api.POST("/calendar/focus", { body });
      if (error !== undefined || !data) throw new Error((error as unknown as { error?: string } | undefined)?.error ?? t("error.server", { status: response.status }));
      return data;
    },
    onSuccess: (result) => {
      toast(result.status === "proposed" ? t("calendar.focusWaits") : result.status === "failed" ? t("calendar.focusFailed") : t("calendar.focusDone"), result.status === "failed" ? "bad" : undefined);
      for (const key of ["connected", "ready", "approvals"]) void client.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
}

export function Calendar() {
  useLanguage();
  const route = useRoute();
  const domains = useDomains();
  const sources = useSources();
  const now = new Date(useNow(60_000));
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<Date | undefined>();
  const [minutes, setMinutes] = useState(60);
  const grid = useRef<HTMLDivElement>(null);
  const [hour, setHour] = useState(44);
  const days = useMemo(() => {
    if (mode === "day") return [new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())];
    const monday = weekStart(anchor);
    // The weekend shows when the anchor falls on it, so a Saturday never opens on a week of the past.
    const length = (anchor.getDay() + 6) % 7 >= 5 ? 7 : 5;
    return Array.from({ length }, (_, index) => addDays(monday, index));
  }, [mode, anchor]);
  const from = days[0]!;
  const to = addDays(days[days.length - 1]!, 1);
  const events = useItems("/calendar/events", { from: from.toISOString(), to: to.toISOString(), limit: 500 }, domains.has("calendar"));
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHour(Math.max(28, element.clientHeight / (END - START))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const items = (events.data?.items ?? []).filter((item) => item.starts_at && item.state !== "cancelled");
  const current = items.find((item) => item.id === route.param);
  const nextEvent = items.filter((item) => Date.parse(item.starts_at!) > now.getTime()).sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))[0];
  const hoursOf = (day: Date) =>
    items.filter((item) => !isAllDay(item) && dayIso(new Date(item.starts_at!)) === dayIso(day)).reduce((sum, item) => sum + (Date.parse(item.ends_at ?? item.starts_at!) - Date.parse(item.starts_at!)) / 3_600_000, 0);
  const title =
    mode === "day"
      ? from.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" })
      : `${from.toLocaleDateString(locale(), { day: "numeric", month: "short" })} – ${addDays(to, -1).toLocaleDateString(locale(), { day: "numeric", month: "long" })}`;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const focus = useFocus();
  const focusSource = (sources.data ?? []).find((source) => source.domain === "calendar" && source.actions.includes("create"))?.name;
  const suggestions = useQuery({
    queryKey: ["connected", "suggestions", minutes, dayIso(now)],
    enabled: domains.has("calendar"),
    queryFn: () => must(api.GET("/calendar/suggestions", { params: { query: { minutes, from: now.toISOString(), to: addDays(now, 7).toISOString(), limit: 8 } } })),
  });
  const slots = (suggestions.data ?? []).map((slot) => ({ start: new Date(slot.starts_at), end: new Date(slot.ends_at) }));
  const blockFocus = (starts?: Date) => focusSource && focus.mutate({ source: focusSource, title: t("calendar.focusTitle"), minutes, ...(starts ? { starts_at: starts.toISOString() } : {}) });
  if (!sources.isPending && !domains.has("calendar")) return <div className="page"><NoSource domain="calendar" /></div>;
  return (
    <div className="cal">
      <div className="cal-top">
        <h1>{title}</h1>
        <span className="cal-nx clip">
          {nextEvent ? <>{t("calendar.next")} <b>{hm(new Date(nextEvent.starts_at!))}</b>: {nextEvent.title}</> : t("calendar.nothingNext")}
        </span>
        <span className="grow" />
        <Freshness domain="calendar" />
        <div className="cal-nav">
          <Btn icon size="sm" variant="ghost" aria-label={t("calendar.previous")} onClick={() => setAnchor(addDays(anchor, mode === "day" ? -1 : -7))}><ChevronLeft /></Btn>
          <Btn size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>{t("today.today")}</Btn>
          <Btn icon size="sm" variant="ghost" aria-label={t("calendar.nextPeriod")} onClick={() => setAnchor(addDays(anchor, mode === "day" ? 1 : 7))}><ChevronRight /></Btn>
        </div>
        <Seg<Mode> label={t("calendar.mode")} value={mode} onChange={setMode} options={[["day", t("calendar.day")], ["week", t("calendar.week")]]} />
        {focusSource && <Btn size="sm" disabled={focus.isPending} title={t("calendar.focusHint")} onClick={() => blockFocus()}><Target />{t("calendar.focusNext")}</Btn>}
        <Btn size="sm" variant="primary" onClick={() => setCreating(true)}><Plus />{t("calendar.new")}</Btn>
      </div>
      <div className="cal-body">
        <div className="cal-tray">
          <div className="cal-th"><h3>{t("calendar.free")}</h3><em>{slots.length}</em></div>
          <div style={{ padding: "0 8px 8px" }}>
            <Seg<string> label={t("calendar.length")} value={String(minutes)} onChange={(value) => setMinutes(Number(value))} options={[["30", "30 min"], ["60", "60 min"], ["90", "90 min"]]} />
          </div>
          <div className="cal-tl">
            {suggestions.isPending && <Skeleton count={3} height={40} />}
            {slots.map((slot, index) => (
              <div key={index} className="cal-ti">
                <b className="tn">{slot.start.toLocaleDateString(locale(), { weekday: "short" })} {hm(slot.start)} – {hm(slot.end)}</b>
                <span className="cal-ta">
                  <button type="button" onClick={() => { setPrefill(slot.start); setCreating(true); }}>{t("calendar.newHere")}</button>
                  {focusSource && <button type="button" disabled={focus.isPending} onClick={() => blockFocus(slot.start)}><Target size={11} />{t("calendar.focus")}</button>}
                </span>
              </div>
            ))}
            {!suggestions.isPending && slots.length === 0 && <p className="faint" style={{ fontSize: 12, padding: 8 }}>{t("calendar.noFree")}</p>}
          </div>
          <div className="cal-tf">
            <div className="cal-fh"><span>{t("calendar.busyWeek")}</span><b className="tn">{days.reduce((sum, day) => sum + hoursOf(day), 0).toFixed(1)} h</b></div>
          </div>
        </div>
        <div className="cal-main">
          <Failure error={events.error} />
          <div className="cal-head" style={{ gridTemplateColumns: `44px repeat(${days.length},minmax(0,1fr))` }}>
            <span />
            {days.map((day) => {
              const hours = hoursOf(day);
              return (
                <button type="button" key={day.toISOString()} className={dayIso(day) === dayIso(now) ? "cal-today" : ""} onClick={() => { setAnchor(day); setMode(mode === "day" ? "week" : "day"); }}>
                  <span>{day.toLocaleDateString(locale(), { weekday: "short" })}</span>
                  <b className="tn">{day.getDate()}</b>
                  <span className="grow" />
                  <small className="tn">{hours ? `${hours.toFixed(1)} h` : t("calendar.freeDay")}</small>
                </button>
              );
            })}
          </div>
          <div ref={grid} className="cal-grid" style={{ gridTemplateColumns: `44px repeat(${days.length},minmax(0,1fr))`, ["--hh" as string]: `${hour}px` }}>
            <div className="cal-gut">
              {Array.from({ length: END - START }, (_, index) => <span key={index} className="tn" style={{ top: index * hour }}>{String(START + index).padStart(2, "0")}</span>)}
              {nowHour > START && nowHour < END && <em className="tn" style={{ top: (nowHour - START) * hour }}>{hm(now)}</em>}
            </div>
            {days.map((day) => {
              const today = dayIso(day) === dayIso(now);
              const mine = items.filter((item) => !isAllDay(item) && dayIso(new Date(item.starts_at!)) === dayIso(day));
              return (
                <div key={day.toISOString()} className={`cal-col ${dayIso(day) < dayIso(now) ? "pastd" : ""}`}>
                  {today && nowHour > START && nowHour < END && <div className="cal-now" style={{ top: (nowHour - START) * hour }}><i /></div>}
                  {mine.map((item) => {
                    const starts = new Date(item.starts_at!);
                    const ends = new Date(item.ends_at ?? item.starts_at!);
                    const box = place(starts, ends);
                    const small = box.height * hour < 34;
                    return (
                      <div
                        key={item.id}
                        className={`cal-ev ${item.id === current?.id ? "on" : ""} ${ends < now ? "past" : ""} ${small ? "small" : ""} ${item.state === "tentative" ? "hold" : ""}`}
                        style={{ top: box.top * hour + 1, height: box.height * hour - 2, left: 2, right: 2 }}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setCreating(false); go("calendar", item.id); }}
                      >
                        <div className="cal-t"><ServiceIcon name={item.source} size={12} fallback={item.source} /><b className="clip">{item.title ?? t("calendar.untitled")}</b></div>
                        {!small && <div className="cal-m clip tn">{hm(starts)}–{hm(ends)}{field(item, "location") ? ` · ${field(item, "location")}` : ""}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {!events.isPending && items.length === 0 && <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translateX(-50%)" }}><Empty title={t("calendar.empty")} /></div>}
        </div>
        {creating ? <NewEvent key={prefill?.toISOString() ?? "new"} day={days[0]!} starts={prefill} minutes={minutes} onClose={() => { setCreating(false); setPrefill(undefined); }} /> : current ? <EventPanel key={current.id} item={current} onClose={() => go("calendar")} /> : null}
      </div>
    </div>
  );
}
