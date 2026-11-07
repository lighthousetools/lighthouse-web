import { ChevronLeft, ChevronRight, EyeOff, Pause, Play, StickyNote, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import { Btn, cx, Seg } from "../ui";
import type { Slide as SlideData } from "./deck";
import { Slide } from "./Slide";

/** Full screen with a speaker view: timer with pause, the next slide, notes, black screen, audience view. */
export default function Presenter({ slides, name, start, onClose }: { slides: SlideData[]; name: string; start: number; onClose: () => void }) {
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

