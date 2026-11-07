import { CheckCircle2, Circle, ExternalLink, FileText, Flag, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { dateTime } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { Avatar, Badge, Btn, Card, Empty, Failure, Field, Modal, Skeleton, Spark } from "../ui";
import { Freshness, NoSource, field, openItem, useAction, useDomains, useItem, useItems, useSources, type Item } from "./connected";
import { age } from "./Ready";
import "./rooms.css";

/** Visits per day over the last two weeks, from a room's activity. */
export function visitsPerDay(activity: Pick<Item, "occurred_at">[], days = 14, now = Date.now()) {
  const counts = Array.from({ length: days }, () => 0);
  for (const entry of activity) {
    if (!entry.occurred_at) continue;
    const ago = Math.floor((now - Date.parse(entry.occurred_at)) / 86_400_000);
    if (ago >= 0 && ago < days) counts[days - 1 - ago]! += 1;
  }
  return counts;
}

/** Documents nobody opened yet: no `views` or `opened` field, or zero. */
export const unread = (doc: Item) => !(Number(field(doc, "views") ?? field(doc, "opened") ?? 0) > 0);

/** Open steps first by due date, then done ones. */
export function sortSteps<T extends Pick<Item, "state" | "ends_at" | "starts_at">>(steps: T[]) {
  const done = (step: T) => ["done", "completed", "closed"].includes((step.state ?? "").toLowerCase());
  const due = (step: T) => step.ends_at ?? step.starts_at ?? "\uffff";
  return [...steps].sort((a, b) => Number(done(a)) - Number(done(b)) || due(a).localeCompare(due(b)));
}
const isDone = (step: Pick<Item, "state">) => ["done", "completed", "closed"].includes((step.state ?? "").toLowerCase());

/** A next step for the room. Writing it to the room waits for approval; the room is never published by Lighthouse. */
function AddStep({ room, onClose }: { room: Item; onClose: () => void }) {
  const action = useAction();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const add = () => title.trim() && action.mutate({ item: room.id, action: "add_step", input: { title: title.trim(), due } }, { onSuccess: onClose });
  return (
    <Modal title={t("rooms.addStep")} sub={t("rooms.addStepSub")} onClose={onClose} actions={<><Btn onClick={onClose}>{t("common.cancel")}</Btn><Btn variant="primary" disabled={!title.trim() || action.isPending} onClick={add}>{t("rooms.addStep")}</Btn></>}>
      <Field autoFocus label={t("rooms.stepTitle")} value={title} onChange={setTitle} onEnter={add} placeholder={t("rooms.stepPlaceholder")} />
      <div style={{ marginTop: 8 }}><Field label={t("rooms.stepDue")} type="date" value={due} onChange={setDue} /></div>
    </Modal>
  );
}

function Detail({ id }: { id: string }) {
  const detail = useItem(id);
  const sources = useSources();
  const action = useAction();
  const [adding, setAdding] = useState(false);
  if (!detail.data) return <div className="rde">{detail.isPending ? <Skeleton count={5} /> : <Failure error={detail.error} />}</div>;
  const room = detail.data.item;
  const docs = detail.data.children.filter((child) => child.kind === "document");
  const activity = detail.data.children.filter((child) => child.kind === "activity").sort((a, b) => (b.occurred_at ?? "").localeCompare(a.occurred_at ?? ""));
  const people = Object.entries(activity.reduce<Record<string, { count: number; last: string }>>((map, entry) => {
    const who = entry.author ?? "–";
    map[who] = { count: (map[who]?.count ?? 0) + 1, last: map[who]?.last && map[who]!.last > (entry.occurred_at ?? "") ? map[who]!.last : entry.occurred_at ?? "" };
    return map;
  }, {})).sort((a, b) => b[1].count - a[1].count);
  const top = people[0]?.[1].count ?? 1;
  const opened = docs.filter((doc) => !unread(doc)).length;
  const hidden = docs.find(unread);
  const canRemind = ((sources.data ?? []).find((source) => source.name === room.source)?.actions ?? []).includes("remind");
  const canAddStep = ((sources.data ?? []).find((source) => source.name === room.source)?.actions ?? []).includes("add_step");
  const steps = sortSteps(detail.data.children.filter((child) => child.kind === "step"));
  const milestones = detail.data.children.filter((child) => child.kind === "milestone").sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  return (
    <div className="rde" key={room.id}>
      <div className="rh">
        <span className="grow" style={{ minWidth: 0 }}>
          <h2 className="clip">{room.title}</h2>
          <span className="sub"><span>{room.occurred_at ? t("rooms.last", { age: age(room.occurred_at) }) : ""}</span>{room.state && <span className="rst ok">{room.state}</span>}</span>
        </span>
        {room.url && <Btn onClick={() => openItem(room)}><ExternalLink />{t("connected.openIn")}</Btn>}
      </div>
      <div className="rts">
        <div className="card"><span>{t("rooms.visits")}</span><b className="tn">{activity.length}</b><Spark data={visitsPerDay(activity)} height={28} /></div>
        <div className="card"><span>{t("rooms.people")}</span><b className="tn">{people.length}</b></div>
        <div className="card"><span>{t("rooms.read")}</span><b className="tn">{opened} <small className="faint" style={{ fontSize: 13 }}>{t("rooms.of", { count: docs.length })}</small></b></div>
        <div className="card"><span>{t("rooms.stage")}</span><b className="clip">{field(room, "stage") ?? room.state ?? "–"}</b></div>
      </div>
      {hidden && (
        <div className="rhint">
          <span className="grow">{t("rooms.unreadHint", { title: hidden.title ?? "" })}</span>
          {canRemind && <Btn size="sm" disabled={action.isPending} onClick={() => action.mutate({ item: room.id, action: "remind", input: { document: hidden.external_id } })}>{t("rooms.remind")}</Btn>}
        </div>
      )}
      <div className="rcols">
        <div className="rc">
          <Card title={t("rooms.documents")} hint={t("rooms.readOf", { read: opened, open: docs.length - opened })}>
            <div className="rin">
              {docs.map((doc) => (
                <div key={doc.id} className="rdoc">
                  <span className="ico"><FileText size={14} /></span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="clip" style={{ display: "block" }}>{doc.title}</span>
                    <span className="st">{unread(doc) ? t("rooms.nobodyOpened") : t("rooms.views", { count: Number(field(doc, "views") ?? field(doc, "opened") ?? 0) })}</span>
                  </span>
                  <Badge tone={unread(doc) ? "warn" : "ok"}>{unread(doc) ? t("rooms.unread") : t("rooms.opened")}</Badge>
                </div>
              ))}
              {docs.length === 0 && <p className="faint" style={{ padding: 12, fontSize: 13 }}>{t("rooms.noDocs")}</p>}
            </div>
          </Card>
          <Card title={t("rooms.perPerson")}>
            <div className="rin">
              {people.map(([who, entry]) => (
                <div key={who} className="rpe">
                  <span className="w"><span className="clip"><Avatar name={who} size={22} />{who}</span></span>
                  <span className="bz-bar"><i style={{ width: `${(entry.count / top) * 100}%` }} /></span>
                  <span className="tn" style={{ width: 24, textAlign: "right" }}>{entry.count}</span>
                  <span className="faint tn" style={{ width: 90, textAlign: "right", fontSize: 12 }}>{entry.last ? age(entry.last) : ""}</span>
                </div>
              ))}
              {people.length === 0 && <p className="faint" style={{ padding: 12, fontSize: 13 }}>{t("rooms.noVisits")}</p>}
            </div>
          </Card>
        </div>
        <div className="rc">
          {(steps.length > 0 || canAddStep) && (
            <Card title={t("rooms.steps")} hint={t("rooms.stepsOpen", { count: steps.filter((step) => !isDone(step)).length })} actions={canAddStep && <Btn size="xs" variant="ghost" onClick={() => setAdding(true)}><Plus />{t("rooms.addStep")}</Btn>}>
              <div className="rin pad">
                {steps.map((step) => (
                  <div key={step.id} className="rstep">
                    {isDone(step) ? <CheckCircle2 size={14} className="up" /> : <Circle size={14} className="faint" />}
                    <span className={`grow ${isDone(step) ? "faint" : ""}`}>{step.title}{step.assignee && <span className="faint"> · {step.assignee}</span>}</span>
                    {(step.ends_at ?? step.starts_at) && <span className="faint tn">{dateTime(step.ends_at ?? step.starts_at)}</span>}
                  </div>
                ))}
                {steps.length === 0 && <p className="faint" style={{ fontSize: 13 }}>{t("rooms.noSteps")}</p>}
              </div>
            </Card>
          )}
          {milestones.length > 0 && (
            <Card title={t("rooms.milestones")}>
              <div className="rin pad rmile">
                {milestones.map((milestone) => (
                  <div key={milestone.id} className={`rstep ${milestone.starts_at && Date.parse(milestone.starts_at) < Date.now() ? "past" : ""}`}>
                    <Flag size={13} className={milestone.starts_at && Date.parse(milestone.starts_at) < Date.now() ? "up" : "faint"} />
                    <span className="grow">{milestone.title}</span>
                    <span className="faint tn">{milestone.starts_at ? dateTime(milestone.starts_at) : ""}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card title={t("rooms.activity")}>
            <div className="rin pad">
              {activity.slice(0, 30).map((entry) => (
                <div key={entry.id} style={{ display: "flex", gap: 8, padding: "6px 0", fontSize: 13 }}>
                  <i className="dot info" style={{ marginTop: 6 }} />
                  <span className="grow">{[entry.author, entry.title].filter(Boolean).join(" · ")}</span>
                  <span className="faint tn" style={{ fontSize: 12 }}>{entry.occurred_at ? dateTime(entry.occurred_at) : ""}</span>
                </div>
              ))}
              {activity.length === 0 && <p className="faint" style={{ fontSize: 13 }}>{t("rooms.noVisits")}</p>}
            </div>
          </Card>
        </div>
      </div>
      {adding && <AddStep room={room} onClose={() => setAdding(false)} />}
    </div>
  );
}

export function Rooms() {
  useLanguage();
  const route = useRoute();
  const domains = useDomains();
  const sources = useSources();
  const rooms = useItems("/rooms", { limit: 200 }, domains.has("rooms"));
  const [query, setQuery] = useState("");
  const all = useMemo(() => (rooms.data?.items ?? []).filter((item) => item.kind === "room"), [rooms.data]);
  const shown = all.filter((item) => !query.trim() || `${item.title}`.toLowerCase().includes(query.trim().toLowerCase()));
  const current = shown.find((item) => item.id === route.param) ?? shown[0];
  if (!sources.isPending && !domains.has("rooms")) return <div className="page"><NoSource domain="rooms" /></div>;
  return (
    <div className="page flush">
      <div className="rg">
        <div className="bz-rl">
          <div className="rlh"><h1>{t("nav.rooms")}</h1><Freshness domain="rooms" /></div>
          <p className="rls faint" style={{ padding: "0 4px", fontSize: 12.5 }}>{t("rooms.lead")}</p>
          <label className="field"><Search /><input aria-label={t("ui.search")} placeholder={t("rooms.search")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <Failure error={rooms.error} />
          <div className="rll" style={{ overflowY: "auto", flex: 1 }}>
            {rooms.isPending && <Skeleton count={4} height={70} />}
            {shown.map((room) => (
              <button type="button" key={room.id} className={`rli ${room.id === current?.id ? "on" : ""}`} onClick={() => go("rooms", room.id)}>
                <span className="a clip">{room.title}</span>
                <span className="faint" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                  <span>{field(room, "stage") ?? room.state ?? ""}</span>
                  <span>{room.occurred_at ? age(room.occurred_at) : ""}</span>
                </span>
              </button>
            ))}
            {!rooms.isPending && shown.length === 0 && <p className="faint" style={{ padding: 12, fontSize: 13 }}>{all.length ? t("palette.empty") : t("rooms.empty")}</p>}
          </div>
        </div>
        {current ? <Detail key={current.id} id={current.id} /> : <div className="rde"><Empty title={t("rooms.empty")} sub={t("rooms.emptyHint")} /></div>}
      </div>
    </div>
  );
}
