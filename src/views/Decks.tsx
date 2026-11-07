import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Maximize2, Paperclip, Pencil, Plus, Printer, StickyNote } from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { api, must } from "../api/client";
import { language, t } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { Btn, cx, Empty, Failure, Field, Menu, Modal, Page, SearchField, Seg, Skeleton } from "../ui";
import { canDo, useItems, useSources } from "./connected";
import { joinSlides, minutesFor, moveSlide, slidesOf, splitSlides } from "./deck";
import { Slide } from "./Slide";

// The presenter goes full screen and is only needed on stage, so it loads on first use.
const Presenter = lazy(() => import("./Presenter"));
import "./decks.css";

const locale = () => (language() === "de" ? "de-DE" : "en-GB");

const useDecks = () => useQuery({ queryKey: ["decks"], queryFn: () => must(api.GET("/decks")) });
const useDeck = (id: string | undefined) =>
  useQuery({ queryKey: ["decks", id], enabled: !!id, queryFn: () => must(api.GET("/brain/entries/{id}", { params: { path: { id: id! } } })) });

async function exportDeck(id: string, format: "html" | "markdown", title: string, print = false) {
  const body = await must(api.GET("/decks/{id}/export", { params: { path: { id }, query: { format } }, parseAs: "text" })) as unknown as string;
  const blob = new Blob([body], { type: format === "html" ? "text/html" : "text/markdown" });
  const url = URL.createObjectURL(blob);
  if (print) {
    const view = window.open(url, "_blank", "noopener");
    if (!view) toast(t("decks.popupBlocked"), "bad");
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^\p{L}\d]+/gu, "-").replace(/^-|-$/g, "") || "deck"}.${format === "html" ? "html" : "md"}`;
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const SLIDE = "application/x-lighthouse-slide";

/** Drag a slide onto another to move it there; Alt with the arrow keys does the same from the keyboard. */
function useSlideDrag(onMove: (from: number, to: number) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (index: number) => ({
    draggable: true,
    className: cx(dragging === index && "ghost", over === index && dragging !== index && "over"),
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(SLIDE, String(index));
      event.dataTransfer.effectAllowed = "move";
      setDragging(index);
    },
    onDragEnd: () => { setDragging(null); setOver(null); },
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(SLIDE)) return;
      event.preventDefault();
      setOver(index);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData(SLIDE));
      setDragging(null);
      setOver(null);
      if (!Number.isNaN(from)) onMove(from, index);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (!event.altKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); onMove(index, index - 1); }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); onMove(index, index + 1); }
    },
  });
}

/** One slide large, with its Markdown and notes next to it. */
function SlideEditor({ parts, name, index, onIndex, onChange, onClose }: { parts: string[]; name: string; index: number; onIndex: (index: number) => void; onChange: (parts: string[]) => void; onClose: () => void }) {
  const slides = slidesOf(joinSlides(parts));
  const slide = slides[index];
  const drag = useSlideDrag((from, to) => {
    if (to < 0 || to >= parts.length) return;
    onChange(moveSlide(parts, from, to));
    if (from === index) onIndex(to);
  });
  if (!slide) return null;
  const set = (value: string) => onChange(parts.map((part, at) => (at === index ? value : part)));
  return (
    <div className="sed" role="dialog" aria-label={t("decks.editSlide")}>
      <header>
        <Btn icon size="sm" variant="ghost" aria-label={t("common.close")} onClick={onClose}><ArrowLeft /></Btn>
        <b>{t("decks.slideOf", { index: index + 1, count: slides.length })}</b>
        <span className="faint">{t(`decks.layout.${slide.layout}`)}</span>
      </header>
      <div className="sedb">
        <div className="rail2">
          {slides.map((item, at) => (
            <div key={at} {...drag(at)} className={cx("drli", at === index && "on", drag(at).className)} onClick={() => onIndex(at)} role="button" tabIndex={0} aria-label={t("decks.slideOf", { index: at + 1, count: slides.length })} onKeyDown={(event) => { if (event.key === "Enter") onIndex(at); drag(at).onKeyDown(event); }}>
              <span className="tn">{at + 1}</span><div><Slide slide={item} index={at} count={slides.length} name={name} /></div>
            </div>
          ))}
        </div>
        <div className="decx-stage"><div className="dstg"><Slide slide={slide} index={index} count={slides.length} name={name} /></div></div>
        <div className="sedr">
          <label className="lbl" style={{ marginTop: 0 }} htmlFor="slide-source">{t("decks.markdown")}</label>
          <textarea id="slide-source" className="ta" style={{ width: "100%", minHeight: 260, fontFamily: "var(--mono)" }} value={parts[index] ?? ""} onChange={(event) => set(event.target.value)} />
          <p className="faint" style={{ fontSize: "var(--t-12)", marginTop: 6 }}>{t("decks.markdownHint")}</p>
          <div className="sedact">
            <Btn size="sm" onClick={() => { onChange([...parts.slice(0, index + 1), "# ", ...parts.slice(index + 1)]); onIndex(index + 1); }}><Plus />{t("decks.addSlide")}</Btn>
            {parts.length > 1 && <Btn size="sm" variant="ghost" onClick={() => { onChange(parts.filter((_, at) => at !== index)); onIndex(Math.max(0, index - 1)); }}>{t("decks.removeSlide")}</Btn>}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewDeck({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"empty" | "brief">("empty");
  const [brief, setBrief] = useState("");
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: () => {
      const clean = title.trim();
      // A brief goes to the writer, which drafts the slides in your voice and marks gaps with [TODO].
      return mode === "brief"
        ? must(api.POST("/decks/generate", { body: { title: clean, brief: brief.trim() } }))
        : must(api.POST("/decks", { body: { title: clean, markdown: `# ${clean}\n\n---\n\n# ${t("decks.firstSlide")}\n\n- \n`, links: [] } }));
    },
    onSuccess: (entry) => {
      void client.invalidateQueries({ queryKey: ["decks"] });
      onCreated(entry.id);
      onClose();
    },
    onError: (error) => toast(error.message, "bad"),
  });
  const ready = title.trim() && (mode === "empty" || brief.trim());
  return (
    <Modal
      title={t("decks.new")}
      sub={mode === "brief" ? t("decks.briefSub") : t("decks.newSub")}
      onClose={onClose}
      actions={<><Btn onClick={onClose}>{t("common.cancel")}</Btn><Btn variant="primary" disabled={!ready || create.isPending} onClick={() => create.mutate()}>{create.isPending ? t("decks.writing") : mode === "brief" ? t("decks.draft") : t("decks.create")}</Btn></>}
    >
      <div style={{ marginBottom: 10 }}><Seg label={t("decks.start")} value={mode} onChange={setMode} options={[["empty", t("decks.startEmpty")], ["brief", t("decks.startBrief")]]} /></div>
      <Field autoFocus value={title} onChange={setTitle} onEnter={() => ready && create.mutate()} placeholder={t("decks.titlePlaceholder")} label={t("decks.title")} />
      {mode === "brief" && (
        <textarea className="ta" style={{ width: "100%", minHeight: 140, marginTop: 8 }} aria-label={t("decks.brief")} placeholder={t("decks.briefPlaceholder")} value={brief} onChange={(event) => setBrief(event.target.value)} />
      )}
    </Modal>
  );
}

/** Attaches the deck to a deal room. Uploading is a writing call, so it waits for approval; nothing gets published. */
function AttachMenu({ id }: { id: string }) {
  const sources = useSources();
  const rooms = useItems("/rooms", { limit: 100 }, canDo(sources.data, "rooms", "attach"));
  const attach = useMutation({
    mutationFn: async (roomId: string) => {
      const { data, error, response } = await api.POST("/decks/{id}/attach", { params: { path: { id } }, body: { room_id: roomId } });
      if (error !== undefined || !data) throw new Error((error as unknown as { error?: string } | undefined)?.error ?? t("error.server", { status: response.status }));
      return data;
    },
    onSuccess: (result) => toast(result.status === "proposed" ? t("decks.attachWaits") : t("decks.attached")),
    onError: (error) => toast(error.message, "bad"),
  });
  const list = (rooms.data?.items ?? []).filter((item) => item.kind === "room");
  if (!canDo(sources.data, "rooms", "attach") || !list.length) return null;
  return (
    <Menu
      label={t("decks.attach")}
      items={list.map((room) => ({ label: room.title ?? room.external_id, run: () => attach.mutate(room.id) }))}
      trigger={(open, isOpen) => <Btn size="sm" disabled={attach.isPending} onClick={open} aria-expanded={isOpen}><Paperclip />{t("decks.attach")}</Btn>}
    />
  );
}

function DeckThumb({ id, name }: { id: string; name: string }) {
  const deck = useDeck(id);
  const slides = deck.data ? slidesOf(deck.data.body) : [];
  if (!slides[0]) return <div className="dslide dk"><div className="in"><footer><span>{name}</span></footer></div></div>;
  return <Slide slide={slides[0]} index={0} count={slides.length} name={name} />;
}

export default function Decks() {
  const route = useRoute();
  const decks = useDecks();
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [slideAt, setSlideAt] = useState<number | null>(null);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const list = (decks.data ?? []).filter((deck) => !query || deck.title.toLowerCase().includes(query.toLowerCase()));
  const id = route.param ?? decks.data?.[0]?.id;
  const deck = useDeck(id);
  const saved = useRef<string | null>(null);

  useEffect(() => {
    setDraft(null);
    setEditing(false);
    setSlideAt(null);
  }, [id]);
  useEffect(() => {
    if (draft === null || !id || draft === saved.current) return;
    const pause = setTimeout(() => {
      saved.current = draft;
      void must(api.PATCH("/brain/entries/{id}", { params: { path: { id } }, body: { body: draft } }))
        .then(() => client.invalidateQueries({ queryKey: ["decks"] }), (error: Error) => toast(error.message, "bad"));
    }, 800);
    return () => clearTimeout(pause);
  }, [draft]);

  const markdown = draft ?? deck.data?.body ?? "";
  const drag = useSlideDrag((from, to) => {
    const current = splitSlides(markdown);
    if (to >= 0 && to < current.length) setDraft(joinSlides(moveSlide(current, from, to)));
  });
  const parts = splitSlides(markdown);
  const slides = slidesOf(markdown);
  const name = deck.data?.title ?? "";
  const summary = decks.data?.find((item) => item.id === id);

  return (
    <Page flush>
      <div className="dk3">
        <aside className="dls" aria-label={t("nav.decks")}>
          <div className="dlh"><b>{t("nav.decks")}</b><Btn icon size="xs" variant="ghost" aria-label={t("decks.new")} title={t("decks.new")} onClick={() => setCreating(true)}><Plus /></Btn></div>
          <SearchField value={query} onChange={setQuery} placeholder={t("posts.search")} />
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gap: 4, alignContent: "start" }}>
            {decks.isLoading ? <Skeleton count={3} height={130} /> : list.map((item) => (
              <button type="button" key={item.id} className={cx("dli", item.id === id && "on")} onClick={() => go("decks", item.id)}>
                <div className="dtb"><DeckThumb id={item.id} name={item.title} /></div>
                <b className="clip">{item.title}</b>
                <span className="tn">{new Date(item.updated_at).toLocaleDateString(locale(), { day: "numeric", month: "short" })}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="dmid">
          {decks.error ? <Failure error={decks.error} /> : !id ? (
            <Empty title={t("decks.none")} sub={t("decks.noneSub")} action={<Btn size="sm" variant="primary" onClick={() => setCreating(true)}><Plus />{t("decks.new")}</Btn>} />
          ) : (
            <>
              <header className="dmh">
                <h1 className="clip">{name}</h1>
                <span className="grow" />
                <Btn size="sm" onClick={() => setEditing(!editing)}><Pencil />{editing ? t("decks.slides") : t("decks.edit")}</Btn>
                <Btn size="sm" variant="primary" disabled={!slides.length} onClick={() => setPresenting(0)}><Maximize2 />{t("decks.present")}</Btn>
              </header>
              <div className="dthr">
                <div className="dthc">
                  {deck.isLoading ? <Skeleton count={2} height={160} /> : editing ? (
                    <textarea className="ta" aria-label={t("decks.markdown")} style={{ flex: 1, minHeight: 420, fontFamily: "var(--mono)", fontSize: "var(--t-13)", lineHeight: "20px", padding: "var(--s3)" }} value={markdown} onChange={(event) => setDraft(event.target.value)} />
                  ) : slides.length ? (
                    <div className="sgrid">
                      {slides.map((slide, index) => (
                        <div key={index} {...drag(index)} className={cx("dsth", drag(index).className)} title={t("decks.dragHint")} onClick={() => setSlideAt(index)} onDoubleClick={() => setPresenting(index)} role="button" tabIndex={0} aria-label={t("decks.slideOf", { index: index + 1, count: slides.length })} onKeyDown={(event) => { if (event.key === "Enter") setSlideAt(index); drag(index).onKeyDown(event); }}>
                          <Slide slide={slide} index={index} count={slides.length} name={name} />
                          <span className="no tn">{index + 1}</span>
                          {slide.note && <span className="fl" title={slide.note}><StickyNote size={10} /></span>}
                        </div>
                      ))}
                    </div>
                  ) : <Empty title={t("decks.empty")} action={<Btn size="sm" onClick={() => setEditing(true)}>{t("decks.edit")}</Btn>} />}
                </div>
              </div>
            </>
          )}
          {slideAt !== null && <SlideEditor parts={parts} name={name} index={slideAt} onIndex={setSlideAt} onChange={(next) => setDraft(joinSlides(next))} onClose={() => setSlideAt(null)} />}
        </section>
        <aside className="dbr">
          {id && (
            <>
              <div className="dbrb">
                <label className="lbl" style={{ marginTop: 0 }}>{t("decks.outline")}</label>
                <div className="dopt">
                  {slides.map((slide, index) => (
                    <button type="button" key={index} onClick={() => setSlideAt(index)}>
                      <span className="tn faint" style={{ width: 18 }}>{index + 1}</span>
                      <span className="grow clip">{slide.title || t(`decks.layout.${slide.layout}`)}</span>
                    </button>
                  ))}
                </div>
                {(deck.data?.links ?? []).length > 0 && (
                  <>
                    <label className="lbl">{t("decks.links")}</label>
                    <div className="drow" style={{ flexWrap: "wrap" }}>{deck.data!.links!.map((link) => <span key={link} className="dpill">{link}</span>)}</div>
                  </>
                )}
              </div>
              <div className="dbrf">
                <div className="drow">
                  <span className="dpill tn">{t("decks.slideCount", { count: slides.length })}</span>
                  <span className="dpill tn">{t("decks.minutes", { count: minutesFor(slides.length) })}</span>
                  {summary && <span className="dpill tn">{new Date(summary.updated_at).toLocaleDateString(locale())}</span>}
                </div>
                <div className="drow">
                  <Btn size="sm" onClick={() => void exportDeck(id, "html", name).catch((error: Error) => toast(error.message, "bad"))}><Download />HTML</Btn>
                  <Btn size="sm" onClick={() => void exportDeck(id, "markdown", name).catch((error: Error) => toast(error.message, "bad"))}><Download />Markdown</Btn>
                  <Btn size="sm" onClick={() => void exportDeck(id, "html", name, true).catch((error: Error) => toast(error.message, "bad"))}><Printer />{t("decks.print")}</Btn>
                </div>
                <div className="drow">
                  <AttachMenu id={id} />
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      {creating && <NewDeck onClose={() => setCreating(false)} onCreated={(created) => go("decks", created)} />}
      {presenting !== null && slides.length > 0 && <Suspense fallback={null}><Presenter slides={slides} name={name} start={presenting} onClose={() => setPresenting(null)} /></Suspense>}
    </Page>
  );
}
