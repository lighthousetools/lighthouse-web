import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api, download, must, originalBlob, upload, type Schemas } from "../api/client";
import { createEditor } from "../brain/editor";
import { dateTime, plainSnippet, shortDate } from "../format";
import { t, tOr, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { Confirm, Empty, Failure, Markdown, Skeleton } from "../ui";
import { AskBox } from "./Ask";

type Summary = Schemas["EntrySummary"];
type Detail = Schemas["EntryDetail"];
const SAVE_DELAY = 800;

function kindLabel(kind: string) {
  return tOr(`kind.${kind}`, kind);
}

function Row({ entry, active }: { entry: Summary; active: boolean }) {
  const snippet = plainSnippet(entry.snippet);
  return (
    <button className="entry-row" aria-current={active} onClick={() => go("brain", entry.id)}>
      <div className="top">
        <span className="src">{kindLabel(entry.original ? "file" : entry.type)}</span>
        {shortDate(entry.updated_at)}
      </div>
      <div className="ti">{entry.title}</div>
      {snippet && <div className="de">{snippet}</div>}
    </button>
  );
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
  if (failed) return <p className="error">{t("brain.previewFailed")}</p>;
  if (!url) return null;
  return (
    <div className="preview">
      {isPdf ? <iframe src={url} title={entry.title} /> : <img src={url} alt={entry.title} />}
    </div>
  );
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

function Workspace({ entry }: { entry: Detail }) {
  const client = useQueryClient();
  const { state, change, latest } = useAutosave(entry.id, { title: entry.title, body: entry.body });
  const [mode, setMode] = useState<"write" | "read">(entry.original ? "read" : "write");
  const [body, setBody] = useState(entry.body);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== "write" || !host.current) return;
    const view = createEditor(host.current, latest.current.body, (text) => {
      setBody(text);
      change({ body: text });
    });
    if (!entry.body) view.focus();
    return () => view.destroy();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useMutation({
    mutationFn: () => must(api.DELETE("/brain/entries/{id}", { params: { path: { id: entry.id } } })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["brain"] });
      go("brain");
    },
  });
  const status = useMutation({
    mutationFn: (value: string) =>
      must(api.PATCH("/brain/entries/{id}", { params: { path: { id: entry.id } }, body: { status: value } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["brain"] }),
  });
  const follow = async (title: string) => {
    const found = await api.GET("/brain/resolve", { params: { query: { title } } });
    if (found.data) go("brain", found.data.id);
    else setNotice(t("brain.linkMissing", { title }));
  };
  const source = entry.sources[0];

  return (
    <div className="sheet fade">
      <div className="sheet-bar">
        <div className="actions">
          <button className="btn sm only-phone" onClick={() => go("brain")}>{t("common.back")}</button>
          <div className="segment" role="group" aria-label={t("brain.write")}>
            <button aria-pressed={mode === "write"} onClick={() => setMode("write")}>{t("brain.write")}</button>
            <button aria-pressed={mode === "read"} onClick={() => setMode("read")}>{t("brain.read")}</button>
          </div>
        </div>
        <div className="actions">
          <span className="muted" role="status">
            {state === "saving" ? t("brain.saving") : state === "failed" ? t("brain.saveFailed") : t("brain.saved")}
          </span>
          {entry.original && (
            <button className="btn sm" onClick={() => void download(entry.id, entry.original!)}>
              {t("brain.original")}
            </button>
          )}
          <button className="btn sm danger" onClick={() => setConfirming(true)}>{t("common.delete")}</button>
        </div>
      </div>
      <input
        className="title-input"
        aria-label={t("brain.title")}
        defaultValue={entry.title}
        onChange={(event) => change({ title: event.target.value })}
      />
      <div className="props">
        <span className="src">{kindLabel(entry.type)}</span>
        {source && <span>{t("brain.from", { source: tOr(`source.${source.kind}`, source.kind) })}</span>}
        <span>{dateTime(entry.updated)}</span>
        <select
          aria-label={t("brain.status")}
          defaultValue={entry.status}
          onChange={(event) => status.mutate(event.target.value)}
        >
          {["active", "superseded", "archived"].map((value) => (
            <option key={value} value={value}>{tOr(`status.${value}`, value)}</option>
          ))}
        </select>
      </div>
      <Failure error={remove.error ?? status.error} />
      {notice && <p className="note">{notice}</p>}
      {mode === "write" ? (
        <div className="cm-host" ref={host} />
      ) : (
        <>
          <Preview entry={entry} />
          {body ? (
            <Markdown text={body} onWikiLink={(title) => void follow(title)} />
          ) : (
            !entry.original && <p className="muted">{t("brain.nothingToRead")}</p>
          )}
        </>
      )}
      {(entry.backlinks?.length ?? 0) > 0 && (
        <div style={{ marginTop: 32 }}>
          <div className="eyebrow">{t("brain.backlinks")}</div>
          <div className="chips">
            {entry.backlinks!.map((link) => (
              <a className="chip" key={link.id} href={`#brain/${link.id}`}>{link.title}</a>
            ))}
          </div>
        </div>
      )}
      {confirming && (
        <Confirm
          title={t("brain.deleteTitle")}
          body={t("brain.deleteBody")}
          action={t("common.delete")}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function Opened({ id }: { id: string }) {
  const entry = useQuery({
    queryKey: ["brain", "entry", id],
    queryFn: () => must(api.GET("/brain/entries/{id}", { params: { path: { id } } })),
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  if (entry.isPending) return <div className="sheet"><Skeleton /></div>;
  if (entry.isError) return <div className="sheet"><Failure error={entry.error} /></div>;
  return <Workspace key={id} entry={entry.data} />;
}

export function Brain() {
  useLanguage();
  const client = useQueryClient();
  const route = useRoute();
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [asking, setAsking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [failure, setFailure] = useState<Error | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const pause = setTimeout(() => setTerm(text.trim()), 250);
    return () => clearTimeout(pause);
  }, [text]);

  const recent = useQuery({
    queryKey: ["brain", "list", "recent"],
    queryFn: () => must(api.GET("/brain/entries", { params: { query: { limit: 60 } } })),
  });
  const hits = useQuery({
    queryKey: ["brain", "list", "search", term],
    enabled: term !== "",
    queryFn: () => must(api.GET("/brain/search", { params: { query: { q: term, limit: 30 } } })),
  });
  const list = term ? hits.data?.map((hit) => hit.entry) : recent.data;
  const newNote = useMutation({
    mutationFn: () =>
      must(api.POST("/brain/entries", { body: { type: "note", title: t("brain.untitled"), body: "" } })),
    onSuccess: (entry) => {
      void client.invalidateQueries({ queryKey: ["brain", "list"] });
      go("brain", entry.id);
    },
  });

  const send = async (files: File[]) => {
    let last: string | undefined;
    setFailure(null);
    for (const file of files) {
      setUploads((count) => count + 1);
      try {
        last = (await upload(file)).id;
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

  return (
    <div className={`brain ${route.param ? "detail" : ""}`}>
      <div className="brain-list">
        <h1>{t("nav.brain")}</h1>
        <p className="sub">{t("brain.lead")}</p>
        <input
          className="field"
          type="search"
          aria-label={t("brain.search")}
          placeholder={t("brain.search")}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setAsking(false);
          }}
        />
        <div className="actions" style={{ margin: "10px 0 14px" }}>
          <button className="btn primary" disabled={newNote.isPending} onClick={() => newNote.mutate()}>
            {t("brain.newNote")}
          </button>
          <button className="btn" onClick={() => picker.current?.click()}>
            {uploads > 0 ? t("brain.uploading") : t("brain.upload")}
          </button>
          {text.trim() && (
            <button className="btn" onClick={() => setAsking(true)}>{t("brain.ask")}</button>
          )}
          <input ref={picker} type="file" multiple hidden onChange={pick} aria-label={t("brain.upload")} />
        </div>
        {asking && (
          <div style={{ marginBottom: 12 }}>
            <AskBox key={text} initial={text} />
          </div>
        )}
        <Failure error={failure ?? newNote.error ?? recent.error ?? hits.error} />
        <div className="eyebrow" style={{ padding: "0 10px 4px" }}>
          {term ? t("brain.results") : t("brain.recent")}
        </div>
        {!list && <Skeleton />}
        {list?.length === 0 &&
          (term ? <Empty title={t("brain.nothing")} /> : <Empty title={t("brain.empty")} hint={t("brain.emptyHint")} />)}
        {list?.map((entry) => <Row key={entry.id} entry={entry} active={entry.id === route.param} />)}
      </div>
      <div className="brain-main">
        {route.param ? <Opened key={route.param} id={route.param} /> : <Empty title={t("brain.pick")} hint={t("brain.dropHint")} />}
      </div>
      {dragging && (
        <div className="drop">
          <strong>{t("brain.dropTitle")}</strong>
          <span>{t("brain.dropHint")}</span>
        </div>
      )}
    </div>
  );
}
