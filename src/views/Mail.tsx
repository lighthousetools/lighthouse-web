import { AlarmClockOff, Archive, ArrowDown, ArrowUp, ExternalLink, Paperclip, PenSquare, Plus, Reply, Search, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dayTime } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { Avatar, Badge, Btn, CheckBox, Empty, Failure, Field, Kbd, Modal, Skeleton } from "../ui";
import { Markdown } from "../ui/markdown";
import { toast } from "../shell/state";
import {
  Freshness, NoSource, canDo, field, has, isSnoozed, openItem, useAction, useBulk, useDomains, useItem, useItems, useSnooze, useSources,
  useSplitActions, useSplitItems, useSplits, type Item,
} from "./connected";
import { LaterMenu } from "./later";
import "./mail.css";

type Box = "important" | "unread" | "all" | "mine" | "snoozed" | `split:${string}`;
const BOXES = ["important", "unread", "all", "mine"] as const;

export function boxOf(item: Pick<Item, "flags">, box: (typeof BOXES)[number]) {
  if (box === "important") return has(item, "important");
  if (box === "unread") return has(item, "unread");
  if (box === "mine") return has(item, "from_me");
  return true;
}

/** "Jane Doe <jane@example.com>" as Jane Doe. */
export function displayName(author: string | null | undefined) {
  if (!author) return "";
  const match = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(author);
  return (match ? match[1]! : author).trim();
}

function Row({ item, on, picked, onPick, onOpen }: { item: Item; on: boolean; picked: boolean; onPick: () => void; onOpen: () => void }) {
  const unread = has(item, "unread");
  const name = displayName(item.author) || item.source;
  return (
    <div className={`ml-row ${on ? "on" : ""} ${unread ? "un" : ""}`} role="option" aria-selected={on} onClick={onOpen}>
      <span className="ml-ld" onClick={(event) => event.stopPropagation()}>
        {picked ? <CheckBox on label={t("mail.select")} onChange={onPick} /> : (
          <span className="ml-who ml-pickable"><Avatar name={name} size={28} /><span className="ml-pk"><CheckBox on={false} label={t("mail.select")} onChange={onPick} /></span></span>
        )}
      </span>
      <span className="ml-mn">
        <span className="ml-l1">
          <b className="clip">{name}</b>
          {has(item, "important") && <Badge tone="warn">{t("mail.important")}</Badge>}
          {isSnoozed(item) && <Badge>{t("mail.later")}</Badge>}
          <span className="grow" />
          <time className="tn">{item.occurred_at ? dayTime(item.occurred_at) : ""}</time>
        </span>
        <span className="ml-l2 clip">
          <span>{item.title ?? t("mail.noSubject")}</span>
          {item.summary && <i>{item.summary}</i>}
        </span>
      </span>
    </div>
  );
}

function Composer({ thread, mode, onClose }: { thread: Item; mode: "reply" | "draft"; onClose: () => void }) {
  const sources = useSources();
  const action = useAction();
  const [body, setBody] = useState("");
  const canReply = canDo(sources.data, "mail", "reply", thread.source);
  const canDraft = canDo(sources.data, "mail", "draft", thread.source);
  const to = displayName(thread.author);
  const run = (name: "reply" | "draft") =>
    action.mutate(
      { item: thread.id, action: name, input: { body } },
      { onSuccess: () => { setBody(""); onClose(); } },
    );
  return (
    <div className="ml-draft">
      <div className="ml-dh">
        <PenSquare size={14} />
        {mode === "reply" ? t("mail.reply") : t("mail.draft")}
        <span className="grow" />
        <Btn icon size="xs" variant="ghost" aria-label={t("common.close")} onClick={onClose}><X /></Btn>
      </div>
      <div className="ml-dm">
        <span className="faint">{t("mail.to")}</span>
        <span className="ml-to"><Avatar name={to || "?"} size={18} />{to || thread.author}</span>
      </div>
      <textarea
        className="ml-dt"
        autoFocus
        rows={6}
        aria-label={t("mail.body")}
        placeholder={t("mail.bodyPlaceholder")}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && body.trim() && canReply) run("reply");
        }}
      />
      <div className="ml-dn"><span className="hint">{t("mail.approvalHint")}</span></div>
      <div className="ml-df">
        <Btn size="sm" variant="ghost" onClick={onClose}>{t("common.cancel")}</Btn>
        <span className="grow" />
        {canDraft && <Btn size="sm" disabled={!body.trim() || action.isPending} onClick={() => run("draft")}>{t("mail.saveDraft")}</Btn>}
        {canReply && (
          <Btn size="sm" variant="primary" kbd="⌘↵" disabled={!body.trim() || action.isPending} onClick={() => run("reply")}><Send />{t("mail.send")}</Btn>
        )}
        {!canReply && !canDraft && <span className="hint">{t("mail.noActions")}</span>}
      </div>
    </div>
  );
}

function Reading({ id, position, count, onStep }: { id: string; position: number; count: number; onStep: (step: number) => void }) {
  const detail = useItem(id);
  const later = useSnooze();
  const sources = useSources();
  const action = useAction();
  const [compose, setCompose] = useState<"reply" | "draft" | null>(null);
  useEffect(() => setCompose(null), [id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea") || event.metaKey || event.ctrlKey || event.altKey || document.querySelector(".palbg, .modalbg")) return;
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        setCompose("reply");
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  if (detail.isPending) return <div className="ml-read"><div className="ml-ri"><Skeleton count={4} /></div></div>;
  if (!detail.data) return <div className="ml-read"><div className="ml-ri"><Failure error={detail.error} /></div></div>;
  const thread = detail.data.item;
  const messages = detail.data.children.filter((child) => child.kind === "message");
  const canArchive = canDo(sources.data, "mail", "archive", thread.source);
  const canWrite = canDo(sources.data, "mail", "reply", thread.source) || canDo(sources.data, "mail", "draft", thread.source);
  return (
    <div className="ml-read">
      <div className="ml-rt">
        <Btn size="sm" variant="ghost" disabled={!canWrite} onClick={() => setCompose("reply")}><Reply />{t("mail.reply")}<kbd>R</kbd></Btn>
        {canArchive && <Btn size="sm" variant="ghost" disabled={action.isPending} onClick={() => action.mutate({ item: thread.id, action: "archive" })}><Archive />{t("mail.archive")}</Btn>}
        {isSnoozed(thread) ? (
          <Btn size="sm" variant="ghost" onClick={() => void later.unsnooze(thread.id)}><AlarmClockOff />{t("mail.showAgain")}</Btn>
        ) : (
          <LaterMenu size="sm" onPick={(until) => { void later.snooze([thread.id], until); onStep(1); }} />
        )}
        {thread.url && <Btn size="sm" variant="ghost" onClick={() => openItem(thread)}><ExternalLink />{t("connected.openIn")}</Btn>}
        <span className="grow" />
        <span className="ml-pos tn">{position + 1}/{count}</span>
        <Btn icon size="sm" variant="ghost" aria-label={t("mail.previous")} onClick={() => onStep(-1)}><ArrowUp /></Btn>
        <Btn icon size="sm" variant="ghost" aria-label={t("mail.next")} onClick={() => onStep(1)}><ArrowDown /></Btn>
      </div>
      <div className="ml-rs">
        <div className="ml-ri">
          <header>
            <h1>{thread.title ?? t("mail.noSubject")}</h1>
            <p>
              {has(thread, "important") && <Badge tone="warn">{t("mail.important")}</Badge>}
              {has(thread, "unread") && <Badge>{t("inbox.tag.unread")}</Badge>}
              <span className="faint">{thread.source}</span>
            </p>
          </header>
          <div className="ml-th">
            {(messages.length ? messages : [thread]).map((message) => {
              const name = displayName(message.author) || message.source;
              const body = field(message, "body") ?? field(message, "text") ?? message.summary ?? "";
              const attachments = (message.data as { attachments?: { name?: string; filename?: string }[] } | null)?.attachments ?? [];
              return (
                <div key={message.id} className="ml-msg">
                  <div className="ml-mh">
                    <Avatar name={name} size={22} />
                    <b className="clip">{name}</b>
                    {has(message, "from_me") && <span className="faint">{t("mail.you")}</span>}
                    <span className="grow" />
                    <time className="tn">{message.occurred_at ? dayTime(message.occurred_at) : ""}</time>
                  </div>
                  <div className="ml-mb">
                    {body ? <Markdown source={body} /> : <span className="faint">{t("mail.noBody")}</span>}
                    {attachments.length > 0 && (
                      <div className="ms">
                        {attachments.map((file, index) => <span key={index} className="ml-fa"><Paperclip size={12} />{file.name ?? file.filename}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {compose ? (
            <Composer thread={thread} mode={compose} onClose={() => setCompose(null)} />
          ) : canWrite ? (
            <div className="ml-noreply">
              <span className="grow">{t("mail.replyHint")}</span>
              <Btn size="sm" onClick={() => setCompose("reply")}><Reply />{t("mail.reply")}</Btn>
            </div>
          ) : (
            <div className="ml-noreply"><span className="grow">{t("mail.noActions")}</span></div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Saves the current search and box as a split, a tab of its own. */
function SplitDialog({ query, box, onClose, onSaved }: { query: string; box: Box; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(query || "");
  const actions = useSplitActions();
  const splits = useSplits("mail");
  const flags = box === "important" ? ["important"] : box === "unread" ? ["unread"] : box === "mine" ? ["from_me"] : [];
  const save = () => {
    const id = `${name.trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "split"}-${Date.now().toString(36)}`;
    void actions
      .save(id, { name: name.trim(), domain: "mail", position: (splits.data?.length ?? 0) + 1, filter: { q: query || null, flags, any_flags: [], kinds: ["thread"], open: false, org: null, source: null, state: null } })
      .then((split) => { onSaved(split.id); onClose(); }, (error: Error) => toast(error.message, "bad"));
  };
  return (
    <Modal title={t("mail.newSplit")} sub={t("mail.newSplitSub")} onClose={onClose} actions={<><Btn onClick={onClose}>{t("common.cancel")}</Btn><Btn variant="primary" disabled={!name.trim()} onClick={save}>{t("common.save")}</Btn></>}>
      <Field autoFocus label={t("mail.splitName")} value={name} onChange={setName} onEnter={save} placeholder={t("mail.splitNamePlaceholder")} />
      <p className="faint" style={{ marginTop: 8, fontSize: "var(--t-12)" }}>{[query && `"${query}"`, ...flags.map((flag) => t(`mail.flag.${flag as "important"}`))].filter(Boolean).join(" · ") || t("mail.splitAll")}</p>
    </Modal>
  );
}

export function Mail() {
  useLanguage();
  const route = useRoute();
  const domains = useDomains();
  const sources = useSources();
  const splits = useSplits("mail");
  const splitActions = useSplitActions();
  const bulk = useBulk();
  const later = useSnooze();
  const [box, setBox] = useState<Box>("important");
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [savingSplit, setSavingSplit] = useState(false);
  useEffect(() => {
    const pause = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(pause);
  }, [query]);
  const splitId = box.startsWith("split:") ? box.slice(6) : undefined;
  const threads = useItems("/mail/threads", { limit: 300, ...(box === "snoozed" ? { snoozed: true } : {}), ...(term ? { q: term } : {}) }, domains.has("mail") && !splitId);
  const splitItems = useSplitItems(splitId);
  const source = splitId ? splitItems : threads;
  const all = useMemo(() => (source.data?.items ?? []).filter((item) => item.kind === "thread"), [source.data]);
  const counts = Object.fromEntries(BOXES.map((value) => [value, all.filter((item) => boxOf(item, value)).length])) as Record<(typeof BOXES)[number], number>;
  const effective: Box = box === "important" && counts.important === 0 && !term ? "all" : box;
  const list = effective === "snoozed" ? all.filter((item) => isSnoozed(item)) : splitId ? all : all.filter((item) => boxOf(item, effective as (typeof BOXES)[number]));
  const index = Math.max(0, list.findIndex((item) => item.id === route.param));
  const current = list[index];
  const select = (id: string) => go("mail", id);
  const pick = (id: string) => setPicked((set) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  useEffect(() => setPicked(new Set()), [box, term]);
  const ids = [...picked];
  const canArchive = canDo(sources.data, "mail", "archive");
  const step = (delta: number) => {
    const next = list[Math.max(0, Math.min(list.length - 1, index + delta))];
    if (next) select(next.id);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea") || event.metaKey || event.ctrlKey || event.altKey || document.querySelector(".palbg, .modalbg")) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        step(1);
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        step(-1);
      }
      if (event.key === "x" && current) pick(current.id);
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".ml-q input")?.focus();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  if (!sources.isPending && !domains.has("mail")) return <div className="page"><NoSource domain="mail" /></div>;
  return (
    <div className="mailv">
      <div className="ml-top">
        <div className="ml-tabsx" role="tablist" aria-label={t("mail.boxes")}>
          {BOXES.map((value) => (
            <button type="button" key={value} role="tab" aria-selected={effective === value} className={effective === value ? "on" : ""} onClick={() => setBox(value)}>
              {t(`mail.box.${value}`)}<em className="tn">{splitId ? "" : counts[value]}</em>
            </button>
          ))}
          {(splits.data ?? []).map((split) => (
            <button type="button" key={split.id} role="tab" aria-selected={box === `split:${split.id}`} className={box === `split:${split.id}` ? "on" : ""} onClick={() => setBox(`split:${split.id}`)}>
              {split.name}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={effective === "snoozed"} className={effective === "snoozed" ? "on" : ""} onClick={() => setBox("snoozed")}>{t("mail.box.snoozed")}</button>
          <button type="button" className="ml-more" aria-label={t("mail.newSplit")} title={t("mail.newSplit")} onClick={() => setSavingSplit(true)}><Plus size={14} /></button>
        </div>
        <span className="grow" />
        <Freshness domain="mail" />
        <label className="ml-q">
          <Search size={14} />
          <input aria-label={t("mail.search")} value={query} placeholder={t("mail.searchPlaceholder", { count: threads.data?.total ?? all.length })} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setQuery("")} />
          {query ? <button type="button" aria-label={t("common.clear")} onClick={() => setQuery("")}><X size={12} /></button> : <Kbd>/</Kbd>}
        </label>
      </div>
      <div className="ml-body">
        <div className="ml-list">
          <div className="ml-lh">
            {ids.length ? (
              <>
                <CheckBox on={ids.length === list.length && list.length > 0} label={t("mail.selectAll")} onChange={() => setPicked(ids.length === list.length ? new Set() : new Set(list.map((item) => item.id)))} />
                <span className="tn">{t("mail.picked", { count: ids.length })}</span>
                <span className="grow" />
                {canArchive && <Btn size="xs" disabled={bulk.isPending} onClick={() => bulk.mutate({ ids, action: "archive" }, { onSuccess: () => setPicked(new Set()) })}><Archive />{t("mail.archive")}</Btn>}
                <LaterMenu size="xs" onPick={(until) => void later.snooze(ids, until).then(() => setPicked(new Set()))} />
                <Btn icon size="xs" variant="ghost" aria-label={t("common.clear")} onClick={() => setPicked(new Set())}><X /></Btn>
              </>
            ) : (
              <>
                <span className="tn">{term ? t("mail.hits", { count: list.length }) : t("mail.listCount", { count: list.length, unread: counts.unread })}</span>
                <span className="grow" />
                {splitId && <Btn icon size="xs" variant="ghost" aria-label={t("mail.deleteSplit")} title={t("mail.deleteSplit")} onClick={() => void splitActions.remove(splitId).then(() => setBox("important"))}><Trash2 /></Btn>}
              </>
            )}
          </div>
          <Failure error={source.error} />
          {source.isPending ? (
            <div style={{ padding: 12 }}><Skeleton count={6} height={44} /></div>
          ) : list.length ? (
            <div className="ml-rows" role="listbox" aria-multiselectable style={{ overflowY: "auto", flex: 1 }}>
              {list.map((item) => <Row key={item.id} item={item} on={item.id === current?.id} picked={picked.has(item.id)} onPick={() => pick(item.id)} onOpen={() => select(item.id)} />)}
            </div>
          ) : (
            <Empty icon={<Search size={20} className="faint" />} title={term ? t("mail.noHits") : effective === "snoozed" ? t("mail.noneSnoozed") : t("mail.empty")} sub={term || effective === "snoozed" ? undefined : t("mail.emptyHint")} />
          )}
        </div>
        {current ? (
          <Reading key={current.id} id={current.id} position={index} count={list.length} onStep={step} />
        ) : (
          <div className="ml-read none"><Empty title={t("mail.pick")} /></div>
        )}
      </div>
      {savingSplit && <SplitDialog query={term} box={effective} onClose={() => setSavingSplit(false)} onSaved={(id) => setBox(`split:${id}`)} />}
    </div>
  );
}
