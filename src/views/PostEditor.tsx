import { AlertTriangle, ArrowLeft, CalendarClock, Check, ChevronRight, Copy, CornerDownLeft, ExternalLink, Hash, List, ListOrdered, MoreHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { go } from "../router";
import { language, t } from "../i18n";
import { toast } from "../shell/state";
import { Badge, Btn, Confirm, cx, Menu, Seg, Stat } from "../ui";
import { useOrganizations } from "./connected";
import { dayIso, hhmm } from "./postdates";
import { FeedPreview, metricsOf, STEPS, stepOf, Tile, titleOf, useBrainImages, useCheck, usePillars, usePostActions, usePosts, type Metrics, type Post } from "./publishing";

/** Where a post starts to feel long, and where the network cuts it off. */
export const SOFT_LIMIT = 1300;
export const MAX_LENGTH = 3000;
const locale = () => (language() === "de" ? "de-DE" : "en-GB");
const number = (value: number) => value.toLocaleString(locale());

function Stepper({ status }: { status: string }) {
  const current = stepOf(status);
  return (
    <ol className="pstp" aria-label={t("posts.statusLabel")}>
      {STEPS.map((step, index) => (
        <li key={step} className={cx(index < current && "dn", index === current && "on")}>
          <button type="button" aria-current={index === current ? "step" : undefined} tabIndex={-1}>
            <i>{index < current ? <Check size={10} /> : index + 1}</i>{t(`posts.status.${step}`)}
          </button>
          {index < STEPS.length - 1 && <ChevronRight size={12} />}
        </li>
      ))}
    </ol>
  );
}

function Counter({ count }: { count: number }) {
  const tone = count > MAX_LENGTH ? "bad" : count > SOFT_LIMIT ? "warn" : "";
  return (
    <div className={cx("ecnt", tone)}>
      <span className="tn"><b>{number(count)}</b> {t("posts.characters")} · {t("posts.readTime", { minutes: Math.max(1, Math.round(count / 900)) })}</span>
      <span className="cntbar"><i style={{ width: `${Math.min(100, (count / MAX_LENGTH) * 100)}%` }} /><u style={{ left: `${(SOFT_LIMIT / MAX_LENGTH) * 100}%` }} /></span>
      <span className="tn faint">{count > SOFT_LIMIT ? t("posts.over", { count: number(count - SOFT_LIMIT) }) : t("posts.free", { count: number(SOFT_LIMIT - count) })}</span>
    </div>
  );
}

/** The live check of the server, while typing. */
function Checks({ text }: { text: string }) {
  const check = useCheck(text);
  const result = check.data;
  const issues = result?.issues ?? [];
  const blocking = issues.filter((issue) => issue.severity === "error").length;
  return (
    <section className="ecard" aria-live="polite">
      <h3>
        {t("posts.check")}
        <small className="tn">{result ? (issues.length ? t("posts.issues", { count: issues.length }) : t("posts.allGreen")) : "…"}</small>
        {blocking > 0 && <Badge tone="bad">{t("posts.blocking", { count: blocking })}</Badge>}
      </h3>
      <ul className="chk">
        {result && (
          <li className="ok"><i><Check size={11} /></i><span className="clip">{t("posts.counted", { characters: number(result.characters), words: number(result.words) })}</span></li>
        )}
        {result && result.hashtags.length > 0 && (
          <li className="ok"><i><Check size={11} /></i><span className="clip">{result.hashtags.join(" ")}</span></li>
        )}
        {issues.map((issue) => (
          <li key={issue.code} className={issue.severity === "error" ? "bad" : "warn"}>
            <i>{issue.severity === "error" ? <X size={11} /> : "!"}</i><span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Schedule({ post, onSave }: { post: Post; onSave: (at: string | null) => void }) {
  const when = post.scheduled_at ? new Date(post.scheduled_at) : null;
  const [day, setDay] = useState(when ? dayIso(when) : "");
  const [time, setTime] = useState(when ? hhmm(when) : "09:00");
  useEffect(() => {
    setDay(when ? dayIso(when) : "");
    if (when) setTime(hhmm(when));
  }, [post.scheduled_at]);
  const save = (nextDay: string, nextTime: string) => {
    if (!nextDay) return;
    const [year, month, date] = nextDay.split("-").map(Number);
    const [hours, minutes] = nextTime.split(":").map(Number);
    onSave(new Date(year!, month! - 1, date!, hours ?? 9, minutes ?? 0).toISOString());
  };
  const locked = post.status === "publishing" || post.status === "published";
  return (
    <section className="ecard">
      <h3>{t("posts.schedule")}</h3>
      <div className="esch">
        <label className="field"><CalendarClock /><input type="date" aria-label={t("posts.date")} value={day} min={dayIso(new Date())} disabled={locked} onChange={(event) => { setDay(event.target.value); save(event.target.value, time); }} /></label>
        <label className="field" style={{ width: 110 }}><input type="time" aria-label={t("posts.time")} value={time} disabled={locked} onChange={(event) => { setTime(event.target.value); save(day, event.target.value); }} /></label>
        {post.scheduled_at && !locked && <Btn size="sm" variant="ghost" onClick={() => onSave(null)}>{t("posts.unplan")}</Btn>}
      </div>
      <p className="ehint">{t("posts.scheduleHint")}</p>
    </section>
  );
}

const METRICS: (keyof Metrics)[] = ["impressions", "reactions", "comments", "shares", "clicks", "followers"];

function Perform({ post, onSave }: { post: Post; onSave: (metrics: Metrics) => void }) {
  const metrics = metricsOf(post);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (post.status !== "published") return <section className="ecard"><h3>{t("posts.impact")}</h3><p className="ehint">{t("posts.impactLater")}</p></section>;
  return (
    <section className="ecard">
      <h3>
        {t("posts.impact")}<small>{post.published_at ? new Date(post.published_at).toLocaleDateString(locale()) : ""}</small><span className="grow" />
        <Btn size="xs" variant="ghost" onClick={() => {
          if (editing) {
            const clean = Object.fromEntries(Object.entries(draft).filter(([, value]) => value.trim() !== "").map(([key, value]) => [key, Number(value.replace(/[.,]/g, ""))]));
            onSave({ ...metrics, ...clean });
          } else setDraft(Object.fromEntries(METRICS.map((key) => [key, metrics[key] != null ? String(metrics[key]) : ""])));
          setEditing(!editing);
        }}>{editing ? t("common.save") : t("posts.enterNumbers")}</Btn>
      </h3>
      {editing ? (
        <div className="eperf">
          {METRICS.map((key) => (
            <label key={key} className="lbl" style={{ display: "grid", gap: 4 }}>
              {t(`posts.metric.${key}`)}
              <input className="field" inputMode="numeric" value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
            </label>
          ))}
        </div>
      ) : (
        <div className="eperf">
          {METRICS.slice(0, 4).map((key) => <Stat key={key} label={t(`posts.metric.${key}`)} value={metrics[key] != null ? number(metrics[key]!) : "–"} />)}
        </div>
      )}
    </section>
  );
}

function ImagePicker({ post, onPick }: { post: Post; onPick: (images: string[]) => void }) {
  const images = useBrainImages();
  const list = images.data ?? [];
  const chosen = post.images[0];
  const locked = post.status === "publishing" || post.status === "published";
  return (
    <section className="ecard">
      <h3>{t("posts.image")}<small className="tn">{list.length}</small><span className="grow" />{chosen && !locked && <Btn size="xs" variant="ghost" onClick={() => onPick([])}>{t("posts.noImage")}</Btn>}</h3>
      {list.length ? (
        <div className="egrid">
          {list.map((entry) => (
            <button type="button" key={entry.id} className={cx("ept", chosen === entry.id && "on")} title={entry.title} aria-pressed={chosen === entry.id} disabled={locked} onClick={() => onPick(chosen === entry.id ? [] : [entry.id])}>
              <Tile image={entry.id} />
            </button>
          ))}
        </div>
      ) : (
        <p className="ehint">{t("posts.noImages")}</p>
      )}
    </section>
  );
}

/** Inserts text at the cursor of a text area and keeps the cursor after it. */
function insertAt(area: HTMLTextAreaElement, prefix: string, change: (value: string) => void) {
  const { selectionStart: start, selectionEnd: end, value } = area;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const at = prefix.endsWith(" ") ? lineStart : start;
  const next = value.slice(0, at) + prefix + value.slice(at, end) + value.slice(end);
  change(next);
  requestAnimationFrame(() => {
    area.focus();
    area.setSelectionRange(end + prefix.length, end + prefix.length);
  });
}

export default function PostEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const posts = usePosts();
  const pillars = usePillars();
  const orgs = useOrganizations();
  const actions = usePostActions();
  const post = posts.data?.find((item) => item.id === id);
  const [text, setText] = useState(post?.body ?? "");
  const [mobile, setMobile] = useState(false);
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const saved = useRef(post?.body ?? "");

  useEffect(() => {
    if (post && post.body !== saved.current) {
      saved.current = post.body;
      setText(post.body);
    }
  }, [post?.body]);
  useEffect(() => {
    if (!post || text === saved.current) return;
    const pause = setTimeout(() => {
      saved.current = text;
      void actions.patch(id, { body: text });
    }, 700);
    return () => clearTimeout(pause);
  }, [text]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".modalbg, .menu")) onClose();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  if (!post) return null;
  const locked = post.status === "publishing" || post.status === "published";
  const pillar = pillars.data?.find((item) => item.name === post.pillar);
  const orgName = post.org ? orgs.data?.find((item) => item.id === post.org)?.name ?? post.org : null;
  const when = post.scheduled_at ?? post.published_at;
  const sub = [orgName, post.pillar, when ? new Date(when).toLocaleString(locale(), { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : t("posts.noDate")].filter(Boolean).join(" · ");
  const publish = async () => {
    setAsking(false);
    if (text !== saved.current) {
      saved.current = text;
      await actions.patch(id, { body: text });
    }
    try {
      await actions.publish(id);
      toast(t("posts.waitsForApproval"));
    } catch (error) {
      toast((error as Error).message, "bad");
    }
  };
  const label = post.status === "published" ? t("posts.status.published") : post.status === "publishing" ? t("posts.waiting") : t("posts.publish");

  return (
    <div className="edr" role="dialog" aria-label={t("posts.editing", { title: titleOf(post) })}>
      <header className="edh">
        <Btn icon size="sm" variant="ghost" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}><ArrowLeft /></Btn>
        <div className="edt"><b className="clip">{titleOf(post)}</b><span className="clip">{sub}</span></div>
        <Stepper status={post.status} />
        <span className="grow" />
        <Menu
          trigger={(open) => <Btn icon size="sm" variant="ghost" aria-label={t("posts.moreActions")} onClick={open}><MoreHorizontal /></Btn>}
          items={[
            { label: t("posts.copyText"), icon: <Copy size={14} />, run: () => { void navigator.clipboard?.writeText(text); toast(t("posts.copied")); } },
            "sep",
            { label: t("common.delete"), icon: <Trash2 size={14} />, danger: true, run: () => setRemoving(true) },
          ]}
        />
        {post.url && <Btn size="sm" onClick={() => window.open(post.url!, "_blank", "noopener")}><ExternalLink />{t("posts.openPost")}</Btn>}
        <Btn variant="primary" size="sm" disabled={locked || !text.trim()} onClick={() => setAsking(true)}>{label}</Btn>
      </header>
      {post.status === "publishing" && (
        <div className="edflag"><AlertTriangle size={14} /><span className="grow clip">{t("posts.waitsHint")}</span><Btn size="xs" variant="ghost" onClick={() => go("ready")}>{t("posts.openReady")}</Btn></div>
      )}
      <div className="edb">
        <div className="edl">
          <div className="eta">
            <div className="etb">
              <Btn icon size="xs" variant="ghost" aria-label={t("posts.arrowList")} title={t("posts.arrowList")} disabled={locked} onClick={() => area.current && insertAt(area.current, "→ ", setText)}><List /></Btn>
              <Btn icon size="xs" variant="ghost" aria-label={t("posts.numberedList")} title={t("posts.numberedList")} disabled={locked} onClick={() => area.current && insertAt(area.current, "1. ", setText)}><ListOrdered /></Btn>
              <Btn icon size="xs" variant="ghost" aria-label={t("posts.hashtag")} title={t("posts.hashtag")} disabled={locked} onClick={() => area.current && insertAt(area.current, "#", setText)}><Hash /></Btn>
              <span className="sp" />
              <Btn icon size="xs" variant="ghost" aria-label={t("posts.paragraph")} title={t("posts.paragraph")} disabled={locked} onClick={() => area.current && insertAt(area.current, "\n\n", setText)}><CornerDownLeft /></Btn>
            </div>
            <textarea ref={area} aria-label={t("posts.text")} spellCheck value={text} readOnly={locked} placeholder={t("posts.textPlaceholder")} onChange={(event) => setText(event.target.value)} />
            <Counter count={[...text].length} />
          </div>
          <Checks text={text} />
          {(pillars.data ?? []).length > 0 && (
            <section className="ecard">
              <h3>{t("posts.pillar")}<small>{t("posts.pillarHint")}</small></h3>
              <div className="xp" role="radiogroup" aria-label={t("posts.pillar")}>
                {(pillars.data ?? []).map((item) => (
                  <button type="button" key={item.id} role="radio" aria-checked={post.pillar === item.name} className={cx(post.pillar === item.name && "on")} onClick={() => void actions.patch(id, { pillar: post.pillar === item.name ? null : item.name, ...(post.pillar === item.name ? { topic: null } : {}) })}>{item.name}</button>
                ))}
              </div>
              {pillar && pillar.topics.length > 0 && (
                <>
                  <h3 style={{ marginTop: "var(--s3)" }}>{t("posts.topic")}</h3>
                  <div className="xp" role="radiogroup" aria-label={t("posts.topic")}>
                    {pillar.topics.map((topic) => (
                      <button type="button" key={topic} role="radio" aria-checked={post.topic === topic} className={cx(post.topic === topic && "on")} onClick={() => void actions.patch(id, { topic: post.topic === topic ? null : topic })}>{topic}</button>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
          <Schedule post={post} onSave={(at) => void actions.patch(id, { scheduled_at: at })} />
          <section className="ecard">
            <h3>{t("posts.internalTitle")}</h3>
            <input className="enn" aria-label={t("posts.internalTitle")} placeholder={t("posts.internalTitleHint")} defaultValue={post.title ?? ""} key={post.id} onBlur={(event) => event.target.value !== (post.title ?? "") && void actions.patch(id, { title: event.target.value || null })} />
          </section>
        </div>
        <div className="edr2">
          <div className="prvh">
            <b>{t("posts.preview")}</b><span className="grow" />
            <Seg label={t("posts.width")} value={mobile ? "mobile" : "desktop"} onChange={(value) => setMobile(value === "mobile")} options={[["desktop", t("posts.desktop")], ["mobile", t("posts.mobile")]]} />
          </div>
          <div className="prv"><FeedPreview text={text} image={post.images[0]} width={mobile ? 360 : 440} /></div>
          <Perform post={post} onSave={(metrics) => void actions.patch(id, { metrics })} />
          <ImagePicker post={post} onPick={(images) => void actions.patch(id, { images })} />
        </div>
      </div>
      {asking && (
        <Confirm title={t("posts.publishTitle")} body={t("posts.publishBody")} action={t("posts.publish")} onConfirm={() => void publish()} onClose={() => setAsking(false)} />
      )}
      {removing && (
        <Confirm title={t("posts.deleteTitle")} body={t("posts.deleteBody")} action={t("common.delete")} onConfirm={() => { setRemoving(false); void actions.remove(id).then(onClose); }} onClose={() => setRemoving(false)} />
      )}
    </div>
  );
}
