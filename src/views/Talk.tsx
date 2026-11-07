import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Brain as BrainIcon, Check, Copy, FileText, MoreHorizontal, Pin, PinOff, RotateCcw, Search, SquarePen, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { useMe, useReady } from "../data";
import { greeting } from "../format";
import { language, t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { Badge, Btn, Confirm, Dot, Empty, Failure, Menu, ServiceIcon, Skeleton, brandOf } from "../ui";
import { Markdown } from "../ui/markdown";
import { useSources } from "./connected";
import { openRun } from "./runs";
import "./talk.css";

type Thread = Schemas["TalkThread"];
type Message = Schemas["TalkMessage"];
type Source = { id: string; title?: string; type?: string };
export type Group = "pinned" | "today" | "yesterday" | "week" | "older";

/** Where a thread sits in the list: pinned first, then by its last message. */
export function groupOf(thread: Pick<Thread, "pinned" | "updated_at">, now = new Date()): Group {
  if (thread.pinned) return "pinned";
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(thread.updated_at))) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? "week" : "older";
}
const GROUPS: Group[] = ["pinned", "today", "yesterday", "week", "older"];

export const sourcesOf = (message: Pick<Message, "sources">): Source[] =>
  Array.isArray(message.sources) ? (message.sources as Source[]).filter((source) => source && typeof source.id === "string") : [];

const useThreads = () => useQuery({ queryKey: ["talk", "threads"], queryFn: () => must(api.GET("/talk/threads")) });
function useThread(id: string | undefined) {
  return useQuery({
    queryKey: ["talk", "thread", id],
    enabled: !!id,
    queryFn: () => must(api.GET("/talk/threads/{id}", { params: { path: { id: id! } } })),
    // A pending answer arrives with `talk.changed`; polling is the fallback when the stream is down.
    refetchInterval: (query) => (query.state.data?.messages.some((message) => message.status === "pending") ? 4000 : false),
  });
}

function useTalkActions() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: ["talk"] });
  const fail = (error: Error) => toast(error.message, "bad");
  return {
    create: () => must(api.POST("/talk/threads", { body: {} })).then((thread) => (refresh(), thread)),
    patch: (id: string, body: Schemas["ThreadPatch"]) => must(api.PATCH("/talk/threads/{id}", { params: { path: { id } }, body })).then(refresh, fail),
    remove: (id: string) => must(api.DELETE("/talk/threads/{id}", { params: { path: { id } } })).then(refresh, fail),
  };
}

function useSend(threadId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ thread, text }: { thread: string; text: string }) => must(api.POST("/talk/threads/{id}/messages", { params: { path: { id: thread } }, body: { text } })),
    onMutate: async ({ thread, text }) => {
      // Show the question at once, before the server answers.
      const key = ["talk", "thread", thread];
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<Schemas["ThreadDetail"]>(key, (detail) =>
        detail ? { ...detail, messages: [...detail.messages, { id: `local-${Date.now()}`, thread_id: thread, role: "owner", text, status: "done", created_at: new Date().toISOString(), run_id: null, sources: [] }] } : detail,
      );
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ["talk"] }),
    onError: (error) => toast(error.message, "bad"),
    mutationKey: ["talk", "send", threadId],
  });
}

function Composer({ onSend, busy, hero, placeholder }: { onSend: (text: string) => void; busy?: boolean; hero?: boolean; placeholder?: string }) {
  const sources = useSources();
  const [value, setValue] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(180, Math.max(hero ? 52 : 44, element.scrollHeight))}px`;
  }, [value, hero]);
  const send = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
  };
  const services = [...new Set((sources.data ?? []).map((source) => brandOf(source.name)).filter(Boolean))].slice(0, 5) as string[];
  return (
    <div className="as-comp">
      <div className="wr">
        <textarea
          ref={area}
          autoFocus={hero}
          aria-label={t("talk.message")}
          value={value}
          placeholder={placeholder ?? t("talk.placeholder")}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="row">
          <span className="grow" />
          <span className="steer faint"><kbd>↵</kbd> {t("talk.send")} <kbd>⇧↵</kbd> {t("talk.newLine")}</span>
          <button type="button" className={`as-send ${value.trim() ? "on" : ""}`} aria-label={t("talk.send")} title={t("talk.send")} disabled={busy || !value.trim()} onClick={send}>
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
      <div className="tray">
        <button type="button" onClick={() => go("brain")}><BrainIcon size={13} />{t("talk.withBrain")}</button>
        <span className="grow" />
        {services.length > 0 && (
          <button type="button" onClick={() => go("connections")}>
            {t("talk.connected")}
            <span className="lg">{services.map((name) => <ServiceIcon key={name} name={name} size={14} />)}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Answer({ message, onRetry }: { message: Message; onRetry: () => void }) {
  const sources = sourcesOf(message);
  if (message.status === "pending") {
    return (
      <div className="as-a" aria-live="polite">
        <p className="faint"><i className="talx-as-spin" /> {t("talk.thinking")}</p>
        {message.run_id && <div className="as-acts"><Btn size="xs" variant="ghost" onClick={() => openRun(message.run_id!)}>{t("talk.openRun")}</Btn></div>}
      </div>
    );
  }
  if (message.status === "failed") {
    return (
      <div className="as-a">
        <p className="down">{message.text || t("talk.failed")}</p>
        <div className="as-acts">
          <Btn size="xs" variant="ghost" onClick={onRetry}><RotateCcw />{t("talk.retry")}</Btn>
          {message.run_id && <Btn size="xs" variant="ghost" onClick={() => openRun(message.run_id!)}>{t("talk.openRun")}</Btn>}
        </div>
      </div>
    );
  }
  return (
    <div className="as-a">
      <Markdown source={message.text} />
      {sources.length > 0 && (
        <div className="as-srcs">
          {sources.map((source, index) => (
            <button type="button" key={source.id} className="as-src" title={source.type} onClick={() => go("brain", source.id)}>
              <em>{index + 1}</em><FileText size={13} /><span className="clip">{source.title ?? source.id.slice(0, 8)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="as-acts">
        <Btn icon size="xs" variant="ghost" aria-label={t("talk.copy")} title={t("talk.copy")} onClick={() => { void navigator.clipboard?.writeText(message.text); toast(t("posts.copied")); }}><Copy /></Btn>
        {message.run_id && <Btn size="xs" variant="ghost" onClick={() => openRun(message.run_id!)}>{t("talk.openRun")}</Btn>}
        <span className="faint tn">{new Date(message.created_at).toLocaleTimeString(language() === "de" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </div>
  );
}

function Hero({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const me = useMe();
  const ready = useReady();
  const first = me.data?.name.split(" ")[0];
  const hello = greeting(new Date().getHours());
  const waiting = ready.data?.items.length ?? 0;
  const prompts = [t("talk.prompt.today"), t("talk.prompt.week"), t("talk.prompt.drafts"), t("talk.prompt.brain")];
  return (
    <div className="as-hero">
      <div className="orb" />
      <h1>{first ? `${hello}, ${first}.` : `${hello}.`}</h1>
      <p>{waiting ? t("talk.heroWaiting", { count: waiting }) : t("talk.heroClear")}</p>
      {waiting > 0 && (
        <div className="cta">
          <Btn variant="primary" onClick={() => go("ready")}>{t("talk.toReady")}</Btn>
          <Btn onClick={() => go("brief")}>{t("nav.brief")}</Btn>
        </div>
      )}
      <div className="as-hc"><Composer hero busy={busy} onSend={onSend} /></div>
      <div className="as-sugg">
        {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => onSend(prompt)}>{prompt}</button>)}
      </div>
    </div>
  );
}

function Threads({ threads, current, onNew }: { threads: Thread[]; current?: string; onNew: () => void }) {
  const actions = useTalkActions();
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Thread | null>(null);
  const needle = query.trim().toLowerCase();
  const list = threads.filter((thread) => !needle || thread.title.toLowerCase().includes(needle));
  return (
    <aside className="as-side">
      <button type="button" className="nw" onClick={onNew}><SquarePen size={15} />{t("talk.new")}</button>
      <label className="field sr">
        <Search />
        <input aria-label={t("talk.search")} placeholder={t("talk.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && <button type="button" aria-label={t("common.clear")} onClick={() => setQuery("")}><X size={12} /></button>}
      </label>
      <div className="ls">
        {GROUPS.map((group) => {
          const items = list.filter((thread) => groupOf(thread) === group);
          if (!items.length) return null;
          return (
            <div key={group}>
              <h4>{t(`talk.group.${group}`)}</h4>
              {items.map((thread) => (
                <div key={thread.id} role="button" tabIndex={0} aria-current={thread.id === current ? "true" : undefined} className={`talx-th ${thread.id === current ? "on" : ""}`} onClick={() => go("talk", thread.id)} onKeyDown={(event) => event.key === "Enter" && go("talk", thread.id)}>
                  {renaming === thread.id ? (
                    <input
                      autoFocus
                      aria-label={t("talk.rename")}
                      defaultValue={thread.title}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={(event) => {
                        const title = event.target.value.trim();
                        if (title && title !== thread.title) void actions.patch(thread.id, { title });
                        setRenaming(null);
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <span className="grow clip">{thread.title}</span>
                  )}
                  {thread.pinned && <Pin size={12} className="faint" />}
                  <span className="mo" onClick={(event) => event.stopPropagation()}>
                    <Menu
                      label={t("talk.more")}
                      items={[
                        { label: t("talk.rename"), icon: <SquarePen size={14} />, run: () => setRenaming(thread.id) },
                        { label: thread.pinned ? t("talk.unpin") : t("talk.pin"), icon: thread.pinned ? <PinOff size={14} /> : <Pin size={14} />, run: () => void actions.patch(thread.id, { pinned: !thread.pinned }) },
                        "sep",
                        { label: t("common.delete"), icon: <Trash2 size={14} />, danger: true, run: () => setRemoving(thread) },
                      ]}
                      trigger={(open, isOpen) => <button type="button" aria-label={t("talk.more")} aria-expanded={isOpen} onClick={open}><MoreHorizontal size={14} /></button>}
                    />
                  </span>
                </div>
              ))}
            </div>
          );
        })}
        {!list.length && <p className="none">{needle ? t("talk.noHits") : t("talk.none")}</p>}
      </div>
      {removing && (
        <Confirm
          title={t("talk.deleteTitle", { title: removing.title })}
          body={t("talk.deleteBody")}
          action={t("common.delete")}
          onConfirm={() => {
            const id = removing.id;
            setRemoving(null);
            void actions.remove(id).then(() => id === current && go("talk"));
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </aside>
  );
}

export function Talk() {
  useLanguage();
  const route = useRoute();
  const threads = useThreads();
  const actions = useTalkActions();
  const id = route.param;
  const detail = useThread(id);
  const send = useSend(id);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const messages = detail.data?.messages ?? [];
  const pending = messages.some((message) => message.status === "pending");
  useEffect(() => {
    const element = scroller.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  });
  useEffect(() => {
    stick.current = true;
  }, [id]);

  // Sending without a thread starts one first, so the hero's composer works on its own.
  const ask = async (text: string) => {
    let thread = id;
    if (!thread) {
      try {
        thread = (await actions.create()).id;
      } catch (error) {
        toast((error as Error).message, "bad");
        return;
      }
      go("talk", thread);
    }
    stick.current = true;
    send.mutate({ thread, text });
  };
  const retry = (answer: Message) => {
    const index = messages.findIndex((message) => message.id === answer.id);
    const question = [...messages.slice(0, index)].reverse().find((message) => message.role === "owner");
    if (question && id) send.mutate({ thread: id, text: question.text });
  };
  // A new chat is a thread of its own right away, so it shows in the list and can be named.
  const newThread = () => void actions.create().then((created) => go("talk", created.id), (error: Error) => toast(error.message, "bad"));
  const thread = detail.data?.thread ?? threads.data?.find((item) => item.id === id);
  const empty = !id || (detail.data && messages.length === 0);

  return (
    <div className="as">
      <Threads threads={threads.data ?? []} current={id} onNew={newThread} />
      <main className="as-main">
        <header className="as-top">
          <span className="clip">{thread?.title ?? t("talk.newTitle")}</span>
          {pending && <Badge tone="info"><Dot tone="live" />{t("talk.working")}</Badge>}
          <span className="grow" />
          {thread && <Btn icon size="sm" variant="ghost" aria-label={thread.pinned ? t("talk.unpin") : t("talk.pin")} title={thread.pinned ? t("talk.unpin") : t("talk.pin")} onClick={() => void actions.patch(thread.id, { pinned: !thread.pinned })}>{thread.pinned ? <PinOff /> : <Pin />}</Btn>}
        </header>
        <Failure error={threads.error ?? detail.error} />
        {id && detail.isPending ? (
          <div className="as-scroll"><div className="as-col"><Skeleton count={4} height={48} /></div></div>
        ) : empty ? (
          <Hero busy={send.isPending} onSend={(text) => void ask(text)} />
        ) : detail.data ? (
          <>
            <div className="as-scroll" ref={scroller} onScroll={(event) => {
              const element = event.currentTarget;
              stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
            }}>
              <div className="as-col">
                {messages.map((message) =>
                  message.role === "owner" ? (
                    <div key={message.id} className="as-user"><div>{message.text}</div></div>
                  ) : (
                    <Answer key={message.id} message={message} onRetry={() => retry(message)} />
                  ),
                )}
                {send.isPending && !pending && <div className="as-a"><p className="faint"><i className="talx-as-spin" /> {t("talk.thinking")}</p></div>}
              </div>
            </div>
            <div className="as-foot"><Composer busy={send.isPending} onSend={(text) => void ask(text)} placeholder={pending ? t("talk.placeholderBusy") : undefined} /></div>
          </>
        ) : (
          <Empty title={t("talk.gone")} action={<Btn onClick={newThread}><Check />{t("talk.new")}</Btn>} />
        )}
      </main>
    </div>
  );
}
