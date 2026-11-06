import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { api, download, must, upload, type Schemas } from "../api/client";
import { Failure, Markdown, Status, when } from "../ui";

function Entry({ id, onClose }: { id: string; onClose: () => void }) {
  const client = useQueryClient();
  const entry = useQuery({
    queryKey: ["brain", "entry", id],
    queryFn: () => must(api.GET("/brain/entries/{id}", { params: { path: { id } } })),
    refetchInterval: false,
  });
  const remove = useMutation({
    mutationFn: () => must(api.DELETE("/brain/entries/{id}", { params: { path: { id } } })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["brain"] });
      onClose();
    },
  });
  if (!entry.data) return <Failure error={entry.error} />;
  const { title, body, original, sources, status, type } = entry.data;
  return (
    <div className="card">
      <div className="row">
        <strong>{title}</strong>
        <button className="plain" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted">
        {type}, <Status value={status} />, source:{" "}
        {sources.map((source) => `${source.kind} ${source.ref}`).join(", ")}
      </p>
      <Markdown text={body} />
      <Failure error={remove.error} />
      <div className="actions">
        {original && (
          <button className="plain" onClick={() => void download(id, original)}>
            Download original
          </button>
        )}
        <button className="danger" onClick={() => remove.mutate()}>
          Delete for good
        </button>
      </div>
    </div>
  );
}

function Results({
  items,
  onOpen,
}: {
  items: Schemas["EntrySummary"][];
  onOpen: (id: string) => void;
}) {
  return items.map((entry) => (
    <button key={entry.id} className="card plain" style={{ width: "100%", textAlign: "left" }} onClick={() => onOpen(entry.id)}>
      <div className="row">
        <strong>{entry.title}</strong>
        <span className="muted">
          {entry.type}, {when(entry.updated_at)}
        </span>
      </div>
      <p className="muted">{entry.snippet}</p>
    </button>
  ));
}

function NewNote() {
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: ["brain"] });
  const save = useMutation({
    mutationFn: () => must(api.POST("/brain/entries", { body: { type: "note", title, body } })),
    onSuccess: () => {
      setTitle("");
      setBody("");
      void refresh();
    },
  });
  const send = useMutation({ mutationFn: upload, onSuccess: refresh });
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) send.mutate(file);
    event.target.value = "";
  };
  return (
    <div className="card">
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Note
        <textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <Failure error={save.error ?? send.error} />
      <div className="actions">
        <button className="primary" disabled={save.isPending || !title.trim()} onClick={() => save.mutate()}>
          Save note
        </button>
        <label className="plain" style={{ margin: 0 }}>
          {send.isPending ? "Uploading…" : "Or upload a file: "}
          <input type="file" onChange={pick} style={{ width: "auto" }} />
        </label>
      </div>
    </div>
  );
}

export function Brain() {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const recent = useQuery({
    queryKey: ["brain", "recent"],
    queryFn: () => must(api.GET("/brain/entries", { params: { query: { limit: 20 } } })),
  });
  const hits = useQuery({
    queryKey: ["brain", "search", term],
    enabled: term !== "",
    queryFn: () => must(api.GET("/brain/search", { params: { query: { q: term } } })),
    refetchInterval: false,
  });
  const ask = useMutation({
    mutationFn: () => must(api.POST("/brain/ask", { body: { question: text } })),
  });
  const search = (event: FormEvent) => {
    event.preventDefault();
    setTerm(text.trim());
    ask.reset();
  };
  const found = term ? hits.data?.map((hit) => hit.entry) : recent.data;
  return (
    <>
      <h1>Brain</h1>
      <form onSubmit={search} className="card">
        <label>
          Search or ask
          <input value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <div className="actions">
          <button className="primary" disabled={!text.trim()}>
            Search
          </button>
          <button
            type="button"
            className="plain"
            disabled={!text.trim() || ask.isPending}
            onClick={() => ask.mutate()}
          >
            {ask.isPending ? "Thinking…" : "Ask"}
          </button>
        </div>
      </form>
      <Failure error={ask.error ?? hits.error ?? recent.error} />
      {ask.data && (
        <div className="card">
          <Markdown text={ask.data.answer} />
          <p className="muted">
            Based on: {ask.data.sources.map((source) => source.title).join(", ") || "no entries"}
          </p>
        </div>
      )}
      {open && <Entry id={open} onClose={() => setOpen(null)} />}
      <h2>{term ? `Results for “${term}”` : "Recent"}</h2>
      {found?.length === 0 && <p className="empty">Nothing found.</p>}
      {found && <Results items={found} onOpen={setOpen} />}
      <h2>Add</h2>
      <NewNote />
    </>
  );
}
