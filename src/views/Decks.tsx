import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, EyeOff, Maximize2, Pause, Pencil, Play, Plus, Printer, StickyNote, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, must } from "../api/client";
import { language, t } from "../i18n";
import { go, useRoute } from "../router";
import { toast } from "../shell/state";
import { Btn, cx, Empty, Failure, Field, Modal, Page, SearchField, Seg, Skeleton } from "../ui";
import { inline } from "../ui/markdown";
import { joinSlides, minutesFor, slidesOf, splitSlides, type Slide as SlideData } from "./deck";
import "./decks.css";

const locale = () => (language() === "de" ? "de-DE" : "en-GB");
const text = (value: string) => inline(value, {});

const useDecks = () => useQuery({ queryKey: ["decks"], queryFn: () => must(api.GET("/decks")) });
const useDeck = (id: string | undefined) =>
  useQuery({ queryKey: ["decks", id], enabled: !!id, queryFn: () => must(api.GET("/brain/entries/{id}", { params: { path: { id: id! } } })) });

/** One slide, drawn at any size: everything scales with its width. */
export function Slide({ slide, index, count, name, dark }: { slide: SlideData; index: number; count: number; name: string; dark?: boolean }) {
  const inverted = dark ?? (slide.layout === "cover" || slide.layout === "closing" || slide.layout === "quote");
  return (
    <div className={cx("dslide", `l-${slide.layout}`, inverted && "dk")}>
      <div className="in">
        {slide.layout === "number" ? (
          <div className="nm"><span className="big">{slide.title}</span>{slide.sub && <p>{text(slide.sub)}</p>}</div>
        ) : slide.layout === "quote" ? (
          <div className="qu"><h1>{text(slide.title)}</h1>{slide.sub && <p>{text(slide.sub)}</p>}</div>
        ) : (
          <>
            {slide.title && <h1>{text(slide.title)}</h1>}
            {slide.sub && slide.layout !== "text" && <p className="ssb">{text(slide.sub)}</p>}
          </>
        )}
        {slide.layout === "bullets" && <ul>{slide.items.map((item, at) => <li key={at}>{text(item)}</li>)}</ul>}
        {slide.layout === "text" && (
          <div className="ssb" style={{ marginTop: "2.4cqw", display: "grid", gap: "1.2cqw", fontSize: "2.2cqw", lineHeight: 1.45, maxWidth: "80%" }}>
            {slide.body.split(/\n{2,}/).map((paragraph, at) => <p key={at}>{text(paragraph.replace(/\n/g, " "))}</p>)}
          </div>
        )}
        <footer><span>{name}</span><em>{index + 1} / {count}</em></footer>
      </div>
    </div>
  );
}

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

function Presenter({ slides, name, start, onClose }: { slides: SlideData[]; name: string; start: number; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [view, setView] = useState<"speaker" | "audience">("speaker");
  const [black, setBlack] = useState(false);
  const [running, setRunning] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const count = slides.length;
  const goTo = (next: number) => {
    setIndex(Math.max(0, Math.min(count - 1, next)));
    setBlack(false);
  };
  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onClose();
  };
  useEffect(() => {
    void root.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(tick);
  }, [running]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(event.key)) { event.preventDefault(); goTo(index + 1); }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); goTo(index - 1); }
      if (event.key === "Home") goTo(0);
      if (event.key === "End") goTo(count - 1);
      if (event.key === "Escape") close();
      if (event.key.toLowerCase() === "b") setBlack((value) => !value);
      if (event.key.toLowerCase() === "p") setView((value) => (value === "speaker" ? "audience" : "speaker"));
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  });
  const slide = slides[index]!;
  const next = slides[index + 1];
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return createPortal(
    <div ref={root} className={cx("prs", view === "audience" && "aud")} data-look="glass" role="dialog" aria-label={t("decks.presenting")} onClick={view === "audience" ? () => goTo(index + 1) : undefined}>
      <div className="pstage">
        <div className="pslide" key={index}><Slide slide={slide} index={index} count={count} name={name} /></div>
        {black && <div className="pblk" />}
      </div>
      {view === "speaker" && (
        <aside className="pside">
          <div className="ptime">
            <b className="tn">{clock}</b>
            <span className="tn">{t("decks.slideOf", { index: index + 1, count })}</span>
            <Btn icon size="xs" variant="ghost" aria-label={running ? t("decks.pause") : t("decks.resume")} title={running ? t("decks.pause") : t("decks.resume")} onClick={() => setRunning(!running)}>{running ? <Pause /> : <Play />}</Btn>
          </div>
          <div className="pnext"><span>{t("decks.upNext")}</span>{next ? <Slide slide={next} index={index + 1} count={count} name={name} /> : <div className="pend">{t("decks.end")}</div>}</div>
          <div className="pnote"><span><StickyNote size={12} />{t("decks.note")}</span><p>{slide.note || t("decks.noNote")}</p></div>
        </aside>
      )}
      <div className="prsbar"><i style={{ width: `${((index + 1) / count) * 100}%` }} /></div>
      <div className="pctl" onClick={(event) => event.stopPropagation()}>
        <Btn icon size="sm" variant="ghost" aria-label={t("decks.previous")} onClick={() => goTo(index - 1)}><ChevronLeft /></Btn>
        <Btn icon size="sm" variant="ghost" aria-label={t("decks.next")} onClick={() => goTo(index + 1)}><ChevronRight /></Btn>
        <Btn icon size="sm" variant="ghost" aria-label={t("decks.black")} title={t("decks.black")} onClick={() => setBlack(!black)}><EyeOff /></Btn>
        <Seg label={t("decks.view")} value={view} onChange={setView} options={[["speaker", t("decks.speaker")], ["audience", t("decks.audience")]]} />
        <Btn icon size="sm" variant="ghost" aria-label={t("decks.stop")} title={t("decks.stop")} onClick={close}><X /></Btn>
      </div>
    </div>,
    document.body,
  );
}

/** One slide large, with its Markdown and notes next to it. */
function SlideEditor({ parts, name, index, onIndex, onChange, onClose }: { parts: string[]; name: string; index: number; onIndex: (index: number) => void; onChange: (parts: string[]) => void; onClose: () => void }) {
  const slides = slidesOf(joinSlides(parts));
  const slide = slides[index];
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
            <div key={at} className={cx("drli", at === index && "on")} onClick={() => onIndex(at)} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onIndex(at)}>
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
  const client = useQueryClient();
  const create = () => {
    const clean = title.trim();
    if (!clean) return;
    void must(api.POST("/decks", { body: { title: clean, markdown: `# ${clean}\n\n---\n\n# ${t("decks.firstSlide")}\n\n- \n`, links: [] } }))
      .then((entry) => {
        void client.invalidateQueries({ queryKey: ["decks"] });
        onCreated(entry.id);
        onClose();
      }, (error: Error) => toast(error.message, "bad"));
  };
  return (
    <Modal title={t("decks.new")} sub={t("decks.newSub")} onClose={onClose} actions={<><Btn onClick={onClose}>{t("common.cancel")}</Btn><Btn variant="primary" disabled={!title.trim()} onClick={create}>{t("decks.create")}</Btn></>}>
      <Field autoFocus value={title} onChange={setTitle} onEnter={create} placeholder={t("decks.titlePlaceholder")} label={t("decks.title")} />
    </Modal>
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
                        <div key={index} className="dsth" style={{ cursor: "pointer" }} onClick={() => setSlideAt(index)} onDoubleClick={() => setPresenting(index)} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setSlideAt(index)}>
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
              </div>
            </>
          )}
        </aside>
      </div>
      {creating && <NewDeck onClose={() => setCreating(false)} onCreated={(created) => go("decks", created)} />}
      {presenting !== null && slides.length > 0 && <Presenter slides={slides} name={name} start={presenting} onClose={() => setPresenting(null)} />}
    </Page>
  );
}
