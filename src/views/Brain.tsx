import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight, Columns2, Download, Eye, FilePlus2, FileText, Folder, FolderOpen, Info, Link2, ListTree,
  PencilLine, Search, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { api, download, must, originalBlob, upload, type Schemas } from "../api/client";
import { createEditor } from "../brain/editor";
import { dateTime, dayTime, plainSnippet } from "../format";
import { t, tOr, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { createStore } from "../store";
import { Btn, Confirm, Dot, Failure, Seg, Skeleton } from "../ui";
import { Markdown, headingsOf, toggleTask } from "../ui/markdown";
import { useAsk } from "./Ask";
import "./brain.css";

type Summary = Schemas["EntrySummary"];
type Detail = Schemas["EntryDetail"];
type Mode = "edit" | "split" | "read";
type SideTab = "links" | "outline" | "info";
const SAVE_DELAY = 800;

/** Open tabs and folder state survive navigation between views. */
const tabsStore = createStore<{ id: string; title: string }[]>([]);
const openFolders = createStore<string[]>(["note"]);
const modeStore = createStore<Mode>("split");

const kindLabel = (kind: string) => tOr(`kind.${kind}`, kind);

/** Entries grouped by type, files apart, each group newest first. */
export function groupEntries(entries: Summary[]) {
  const groups = new Map<string, Summary[]>();
  for (const entry of entries) {
    const key = entry.original ? "file" : entry.type;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function Preview({ entry }: { entry: Detail }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const name = (entry.original ?? "").toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const isImage = /\.(png|jpe?g|gif|webp|heic)$/.test(name);
  useEffect(() => {
    if (!isPdf && !isImage) return;
    let revoked = false;
    let created: string | null = null;
    originalBlob(entry.id)
      .then((blob) => {
        if (revoked) return;
        created = URL.createObjectURL(isPdf ? new Blob([blob], { type: "application/pdf" }) : blob);
        setUrl(created);
      })
      .catch(() => setFailed(true));
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [entry.id, isImage, isPdf]);
  if (failed) return <p className="fail">{t("brain.previewFailed")}</p>;
  if (!url) return null;
  return isPdf ? <iframe src={url} title={entry.title} /> : <img className="br-img" src={url} alt={entry.title} />;
}

/** Saves text after a pause, and at once when the entry closes. */
function useAutosave(id: string, initial: { title: string; body: string }) {
  const client = useQueryClient();
  const saved = useRef(initial);
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState<"saved" | "saving" | "failed">("saved");
  const flush = async () => {
    clearTimeout(timer.current);
    const next = latest.current;
    if (next.title === saved.current.title && next.body === saved.current.body) return;
    setState("saving");
    try {
      await must(api.PATCH("/brain/entries/{id}", { params: { path: { id } }, body: next }));
      saved.current = next;
      setState("saved");
      tabsStore.set((tabs) => tabs.map((tab) => (tab.id === id ? { ...tab, title: next.title } : tab)));
      void client.invalidateQueries({ queryKey: ["brain", "list"] });
    } catch {
      setState("failed");
    }
  };
  const change = (patch: Partial<{ title: string; body: string }>) => {
    latest.current = { ...latest.current, ...patch };
    setState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  };
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { state, change, latest };
}

function Side({ entry, body, tab, setTab }: { entry: Detail; body: string; tab: SideTab; setTab: (tab: SideTab) => void }) {
  const outline = headingsOf(body);
  const backlinks = entry.backlinks ?? [];
  const tabs: [SideTab, typeof Link2, string][] = [["links", Link2, t("brain.backlinks")], ["outline", ListTree, t("brain.outline")], ["info", Info, t("brain.info")]];
  return (
    <aside className="br-side">
      <div className="br-stabs" role="tablist">
        {tabs.map(([id, Icon, label]) => (
          <button type="button" key={id} role="tab" aria-selected={tab === id} aria-label={label} title={label} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            <Icon size={15} />
          </button>
        ))}
      </div>
      <div className="br-sbody">
        {tab === "links" && (
          <>
            <div className="br-cap">{t("brain.backlinks")} <em>{backlinks.length}</em></div>
            {backlinks.length === 0 && <p className="br-hint">{t("brain.noBacklinks")}</p>}
            {backlinks.map((link) => (
              <button type="button" key={link.id} className="br-link" onClick={() => go("brain", link.id)}>
                <span className="t"><FileText size={14} /><span className="clip">{link.title}</span></span>
                {link.snippet && <span className="s">{plainSnippet(link.snippet)}</span>}
              </button>
            ))}
            {(entry.links?.length ?? 0) > 0 && (
              <>
                <div className="br-cap" style={{ marginTop: 12 }}>{t("brain.linksTo")} <em>{entry.links!.length}</em></div>
                {entry.links!.map((link) => (
                  <button type="button" key={link} className="br-link" onClick={() => go("brain", link)}>
                    <span className="t"><FileText size={14} /><span className="clip">{link}</span></span>
                  </button>
                ))}
              </>
            )}
          </>
        )}
        {tab === "outline" && (
          <>
            <div className="br-cap">{t("brain.outline")} <em>{outline.length}</em></div>
            {outline.length === 0 && <p className="br-hint">{t("brain.noOutline")}</p>}
            {outline.map((heading) => (
              <button
                type="button"
                key={heading.line}
                className="br-oln"
                style={{ paddingLeft: 8 + (heading.level - 1) * 12 }}
                onClick={() => document.querySelector(`.br-pv [data-line="${heading.line}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                {heading.text}
              </button>
            ))}
          </>
        )}
        {tab === "info" && (
          <>
            <div className="br-cap">{t("brain.info")}</div>
            <dl className="facts" style={{ padding: "4px 8px" }}>
              <dt>{t("brain.type")}</dt><dd>{kindLabel(entry.type)}</dd>
              <dt>{t("brain.created")}</dt><dd>{dateTime(entry.created)}</dd>
              <dt>{t("brain.changed")}</dt><dd>{dateTime(entry.updated)}</dd>
              <dt>{t("brain.scope")}</dt><dd>{entry.scope}</dd>
              {entry.sources.map((source, index) => (
                <div key={index} style={{ display: "contents" }}>
                  <dt>{t("brain.source")}</dt>
                  <dd className="clip">{tOr(`source.${source.kind}`, source.kind)} <span className="faint">{source.ref}</span></dd>
                </div>
              ))}
              {entry.original && <><dt>{t("brain.originalFile")}</dt><dd className="clip">{entry.original}</dd></>}
            </dl>
          </>
        )}
      </div>
    </aside>
  );
}

function Workspace({ entry }: { entry: Detail }) {
  const client = useQueryClient();
  const { state, change, latest } = useAutosave(entry.id, { title: entry.title, body: entry.body });
  const storedMode = modeStore.use();
  const mode: Mode = entry.original && !entry.body ? "read" : storedMode;
  const [body, setBody] = useState(entry.body);
  const [confirming, setConfirming] = useState(false);
  const [side, setSide] = useState<SideTab>("links");
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<ReturnType<typeof createEditor> | null>(null);

  useEffect(() => {
    if (mode === "read" || !host.current) return;
    const editor = createEditor(host.current, latest.current.body, (text) => {
      setBody(text);
      change({ body: text });
    });
    view.current = editor;
    if (!entry.body) editor.focus();
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useMutation({
    mutationFn: () => must(api.DELETE("/brain/entries/{id}", { params: { path: { id: entry.id } } })),
    onSuccess: () => {
      tabsStore.set((tabs) => tabs.filter((tab) => tab.id !== entry.id));
      toast(t("brain.deleted"));
      void client.invalidateQueries({ queryKey: ["brain"] });
      go("brain");
    },
  });
  const status = useMutation({
    mutationFn: (value: string) => must(api.PATCH("/brain/entries/{id}", { params: { path: { id: entry.id } }, body: { status: value } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["brain"] }),
  });
  const follow = async (title: string) => {
    const found = await api.GET("/brain/resolve", { params: { query: { title } } });
    if (found.data) go("brain", found.data.id);
    else toast(t("brain.linkMissing", { title }), "bad");
  };
  const toggle = (line: number) => {
    const next = toggleTask(latest.current.body, line);
    setBody(next);
    change({ body: next });
    const editor = view.current;
    if (editor) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: next } });
  };
  const source = entry.sources[0];
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <>
      <div className="br-main">
        <div className="br-head">
          <div className="crumbs">
            <span>{kindLabel(entry.original ? "file" : entry.type)}<ChevronRight size={12} /></span>
            <span className="cur clip">{entry.title}</span>
          </div>
          <input className="br-title" aria-label={t("brain.title")} defaultValue={entry.title} onChange={(event) => change({ title: event.target.value })} />
          <div className="br-meta">
            <span><small>{t("brain.type")}</small>{kindLabel(entry.type)}</span>
            {source && <span><small>{t("brain.source")}</small>{tOr(`source.${source.kind}`, source.kind)}</span>}
            <span><small>{t("brain.changed")}</small>{dayTime(entry.updated)}</span>
            <span>
              <small>{t("brain.status")}</small>
              <select aria-label={t("brain.status")} defaultValue={entry.status} onChange={(event) => status.mutate(event.target.value)}>
                {["active", "superseded", "archived"].map((value) => (
                  <option key={value} value={value}>{tOr(`status.${value}`, value)}</option>
                ))}
              </select>
            </span>
            <span className="grow" />
            <span className="faint" role="status">
              {state === "saving" ? t("brain.saving") : state === "failed" ? t("brain.saveFailed") : t("brain.saved")}
            </span>
            {entry.original && (
              <Btn size="xs" onClick={() => void download(entry.id, entry.original!)}><Download />{t("brain.original")}</Btn>
            )}
            <Btn size="xs" icon variant="ghost" aria-label={t("common.delete")} onClick={() => setConfirming(true)}><Trash2 /></Btn>
          </div>
          <Failure error={remove.error ?? status.error} />
        </div>
        <div className={`br-ed ${mode}`}>
          {mode !== "read" && (
            <div className="br-src">
              <div className="br-tools">
                <span className="grow" />
                <span className="tn">{t("brain.words", { count: words })}</span>
              </div>
              <div className="cm-host" ref={host} />
            </div>
          )}
          {mode !== "edit" && (
            <div className="br-pv">
              <div className="br-pvin">
                {entry.original && <div className="br-file"><Preview entry={entry} /></div>}
                {body ? (
                  <Markdown source={body} onWiki={(title) => void follow(title)} onToggle={toggle} />
                ) : (
                  !entry.original && <p className="faint">{t("brain.nothingToRead")}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <Side entry={entry} body={body} tab={side} setTab={setSide} />
      {confirming && (
        <Confirm title={t("brain.deleteTitle")} body={t("brain.deleteBody")} action={t("common.delete")} onConfirm={() => remove.mutate()} onClose={() => setConfirming(false)} />
      )}
    </>
  );
}

function Opened({ id }: { id: string }) {
  const entry = useQuery({
    queryKey: ["brain", "entry", id],
    queryFn: () => must(api.GET("/brain/entries/{id}", { params: { path: { id } } })),
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  useEffect(() => {
    if (!entry.data) return;
    const { title } = entry.data;
    tabsStore.set((tabs) => (tabs.some((tab) => tab.id === id) ? tabs : [...tabs.slice(-5), { id, title }]));
  }, [entry.data, id]);
  if (entry.isPending) return <div className="br-main"><div className="br-head"><Skeleton count={3} height={28} /></div></div>;
  if (entry.isError) return <div className="br-main"><div className="br-head"><Failure error={entry.error} /></div></div>;
  return <Workspace key={id} entry={entry.data} />;
}

function Tabs({ current }: { current?: string }) {
  const tabs = tabsStore.use();
  const mode = modeStore.use();
  const close = (id: string) => {
    const rest = tabs.filter((tab) => tab.id !== id);
    tabsStore.set(rest);
    if (id === current) go("brain", rest[rest.length - 1]?.id);
  };
  return (
    <div className="br-tabs" role="tablist">
      {tabs.map((tab) => (
        <div key={tab.id} role="tab" aria-selected={tab.id === current} className={tab.id === current ? "on" : ""} onClick={() => go("brain", tab.id)}>
          <span className="ic"><FileText size={13} /></span>
          <span className="clip">{tab.title}</span>
          <button
            type="button"
            aria-label={t("brain.closeTab", { title: tab.title })}
            onClick={(event) => {
              event.stopPropagation();
              close(tab.id);
            }}
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <span className="grow" />
      {current && (
        <Seg<Mode>
          label={t("brain.mode")}
          value={mode}
          onChange={modeStore.set}
          options={[["edit", <PencilLine key="e" size={13} aria-label={t("brain.write")} />], ["split", <Columns2 key="s" size={13} aria-label={t("brain.split")} />], ["read", <Eye key="r" size={13} aria-label={t("brain.read")} />]]}
        />
      )}
    </div>
  );
}

function Tree({ current, onNew, creating, onUpload, uploading }: { current?: string; onNew: () => void; creating: boolean; onUpload: () => void; uploading: boolean }) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const folders = openFolders.use();
  useEffect(() => {
    const pause = setTimeout(() => setTerm(text.trim()), 250);
    return () => clearTimeout(pause);
  }, [text]);
  const recent = useQuery({
    queryKey: ["brain", "list", "recent"],
    queryFn: () => must(api.GET("/brain/entries", { params: { query: { limit: 200 } } })),
  });
  const hits = useQuery({
    queryKey: ["brain", "list", "search", term],
    enabled: term !== "",
    queryFn: () => must(api.GET("/brain/search", { params: { query: { q: term, limit: 30 } } })),
  });
  const groups = useMemo(() => groupEntries(recent.data ?? []), [recent.data]);
  const flip = (key: string) => openFolders.set((open) => (open.includes(key) ? open.filter((item) => item !== key) : [...open, key]));
  return (
    <div className="br-tree">
      <div className="br-th">
        <Btn size="sm" disabled={creating} onClick={onNew}><FilePlus2 />{t("brain.newNote")}</Btn>
        <span className="grow" />
        <Btn size="sm" icon variant="ghost" aria-label={t("brain.upload")} title={t("brain.upload")} disabled={uploading} onClick={onUpload}><Upload /></Btn>
      </div>
      <label className="field br-q">
        <Search />
        <input type="search" aria-label={t("brain.search")} placeholder={t("brain.search")} value={text} onChange={(event) => setText(event.target.value)} />
        {text && <button type="button" aria-label={t("common.clear")} onClick={() => setText("")}><X size={12} /></button>}
      </label>
      <div className="br-list">
        <Failure error={recent.error ?? hits.error} />
        {term ? (
          <>
            <div className="br-cap">{t("brain.results")} <em>{hits.data?.length ?? ""}</em></div>
            {hits.isPending && <Skeleton count={3} height={44} />}
            {hits.data?.length === 0 && <div className="br-none">{t("brain.nothing")}</div>}
            {hits.data?.map(({ entry }) => (
              <button type="button" key={entry.id} className={`br-hit ${entry.id === current ? "on" : ""}`} onClick={() => go("brain", entry.id)}>
                <span className="t"><FileText size={14} /><span className="clip">{entry.title}</span></span>
                {entry.snippet && <span className="s">{plainSnippet(entry.snippet)}</span>}
              </button>
            ))}
          </>
        ) : (
          <>
            {recent.isPending && <Skeleton count={6} height={30} />}
            {recent.data?.length === 0 && <div className="br-none">{t("brain.empty")}<span>{t("brain.emptyHint")}</span></div>}
            {groups.map(([key, entries]) => {
              const open = folders.includes(key) || entries.some((entry) => entry.id === current);
              return (
                <div key={key}>
                  <div className="br-row" role="button" tabIndex={0} aria-expanded={open} onClick={() => flip(key)} onKeyDown={(event) => event.key === "Enter" && flip(key)}>
                    <ChevronRight size={12} className={`chev ${open ? "open" : ""}`} />
                    <span className="ic">{open ? <FolderOpen size={14} /> : <Folder size={14} />}</span>
                    <span className="grow clip">{kindLabel(key)}</span>
                    <em className="count">{entries.length}</em>
                  </div>
                  {open &&
                    entries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`br-row ${entry.id === current ? "on" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-current={entry.id === current || undefined}
                        style={{ paddingLeft: 28 }}
                        onClick={() => go("brain", entry.id)}
                        onKeyDown={(event) => event.key === "Enter" && go("brain", entry.id)}
                      >
                        <span className="ic"><FileText size={14} /></span>
                        <span className="grow clip">{entry.title}</span>
                      </div>
                    ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function AskBar({ count }: { count?: number }) {
  const [question, setQuestion] = useState("");
  const state = useAsk();
  const open = state.busy || !!state.text || !!state.failure;
  return (
    <>
      <form
        className="br-ask"
        onSubmit={(event) => {
          event.preventDefault();
          void state.ask(question);
        }}
      >
        <Sparkles size={14} />
        <input aria-label={t("brain.askLabel")} placeholder={t("brain.askLabel")} value={question} onChange={(event) => setQuestion(event.target.value)} />
        <kbd>↵</kbd>
      </form>
      {count != null && <span className="br-count"><Dot tone="ok" />{t("brain.count", { count })}</span>}
      {open && (
        <div className="br-answ" aria-live="polite">
          <div className="br-ans">
            <div className="ah">
              <Sparkles size={14} />
              <span className="clip">{state.asked}</span>
              <button type="button" className="x" aria-label={t("common.close")} onClick={state.reset}><X size={13} /></button>
            </div>
            {state.failure && <p className="fail" role="alert">{t("ask.failed", { reason: state.failure })}</p>}
            {state.text ? (
              <div className="tx"><Markdown source={state.text} /></div>
            ) : (
              state.busy && <div className="brax-work"><i className="spin" />{t("ask.thinking")}</div>
            )}
            {state.sources && state.sources.length > 0 && (
              <div className="brax-foot">
                <span className="faint">{t("ask.sources")}</span>
                {state.sources.map((source) => (
                  <button type="button" className="src" key={source.id} onClick={() => go("brain", source.id)}>
                    <FileText size={12} />
                    <span className="clip">{source.title}</span>
                  </button>
                ))}
              </div>
            )}
            {state.sources?.length === 0 && <p className="faint" style={{ marginTop: 8, fontSize: 12 }}>{t("ask.noSources")}</p>}
          </div>
        </div>
      )}
    </>
  );
}

export function Brain() {
  useLanguage();
  const client = useQueryClient();
  const route = useRoute();
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [failure, setFailure] = useState<Error | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const recent = useQuery({
    queryKey: ["brain", "list", "recent"],
    queryFn: () => must(api.GET("/brain/entries", { params: { query: { limit: 200 } } })),
  });
  const newNote = useMutation({
    mutationFn: () => must(api.POST("/brain/entries", { body: { type: "note", title: t("brain.untitled"), body: "" } })),
    onSuccess: (entry) => {
      void client.invalidateQueries({ queryKey: ["brain", "list"] });
      go("brain", entry.id);
    },
  });
  const wantsNew = route.param === "new";
  useEffect(() => {
    if (wantsNew && !newNote.isPending) newNote.mutate();
  }, [wantsNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (files: File[]) => {
    let last: string | undefined;
    setFailure(null);
    for (const file of files) {
      setUploads((count) => count + 1);
      try {
        last = (await upload(file)).id;
        toast(t("brain.uploaded", { name: file.name }));
      } catch (error) {
        setFailure(new Error(t("brain.uploadFailed", { name: file.name, reason: (error as Error).message })));
      }
      setUploads((count) => count - 1);
    }
    void client.invalidateQueries({ queryKey: ["brain", "list"] });
    if (last) go("brain", last);
  };

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files");
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth -= 1;
      if (depth <= 0) setDragging(false);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      void send(Array.from(event.dataTransfer?.files ?? []));
    };
    addEventListener("dragenter", enter);
    addEventListener("dragleave", leave);
    addEventListener("dragover", over);
    addEventListener("drop", drop);
    return () => {
      removeEventListener("dragenter", enter);
      removeEventListener("dragleave", leave);
      removeEventListener("dragover", over);
      removeEventListener("drop", drop);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    void send(Array.from(event.target.files ?? []));
    event.target.value = "";
  };
  const current = route.param && !wantsNew ? route.param : undefined;

  return (
    <div className="br">
      <div className="br-top">
        <AskBar count={recent.data?.length} />
        <span className="grow" />
        <Btn size="sm" disabled={uploads > 0} onClick={() => picker.current?.click()}>
          <Upload />
          {uploads > 0 ? t("brain.uploading") : t("brain.upload")}
        </Btn>
        <input ref={picker} type="file" multiple hidden onChange={pick} aria-label={t("brain.upload")} />
      </div>
      <div className="br-body">
        <Tree current={current} onNew={() => newNote.mutate()} creating={newNote.isPending} onUpload={() => picker.current?.click()} uploading={uploads > 0} />
        <div className="br-main" style={{ minWidth: 0 }}>
          <Tabs current={current} />
          {(failure || newNote.error) && <div style={{ padding: "8px 16px 0" }}><Failure error={failure ?? newNote.error} /></div>}
          <div className="br-body" style={{ minHeight: 0 }}>
            {current ? (
              <Opened key={current} id={current} />
            ) : (
              <div className="br-empty">
                <FileText size={22} className="faint" />
                <b style={{ fontWeight: 500, color: "var(--ink)" }}>{t("brain.pick")}</b>
                <span style={{ fontSize: 13 }}>{t("brain.dropHint")}</span>
                <Btn variant="primary" disabled={newNote.isPending} onClick={() => newNote.mutate()}><FilePlus2 />{t("brain.newNote")}</Btn>
              </div>
            )}
          </div>
        </div>
      </div>
      {dragging && (
        <div className="br-dropper">
          <i className="beam" />
          <p>
            {t("brain.dropTitle")}
            <small>{t("brain.dropHint")}</small>
          </p>
        </div>
      )}
    </div>
  );
}
