import { Pause, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import { language, t } from "../i18n";
import { Btn } from "../ui";
import { figures, formatNumber, thesis, type BriefingDocument } from "./document";

export type Pattern = "grid" | "rise" | "bars" | "heat" | "drift" | "ring" | "beam";
export type Slide = {
  id: string; pattern: Pattern; number?: { value: number; unit?: string | null }; count?: number; lines?: string[];
  caption: string; rgb: [number, number, number]; end?: boolean;
};

const DURATION = 5400;
const PARTICLES = 680;
const BLUE: [number, number, number] = [91, 154, 255];
const GREEN: [number, number, number] = [76, 195, 138];
const AMBER: [number, number, number] = [245, 166, 35];
const WARM: [number, number, number] = [255, 232, 196];
const NUMBER_PATTERNS: Pattern[] = ["grid", "bars", "ring", "drift"];
const NUMBER_COLORS = [BLUE, GREEN, AMBER, [150, 200, 255] as [number, number, number]];

/** Halves a sentence at the word nearest its middle, for a headline in two lines. */
export function twoLines(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length < 3) return [text.trim()];
  let best = 1;
  const half = text.length / 2;
  for (let index = 1, length = 0; index < words.length; index++) {
    length += words[index - 1]!.length + 1;
    if (Math.abs(length - half) < Math.abs(words.slice(0, best).join(" ").length - half)) best = index;
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/** The film's slides, all from the recap document: its thesis, its numbers, its sections, and a close. */
export function slidesOf(document: BriefingDocument): Slide[] {
  const slides: Slide[] = [];
  const parts = thesis(document.content.summary);
  const headline = parts.title || document.content.title;
  slides.push({ id: "thesis", pattern: "rise", lines: twoLines(headline), caption: parts.lead || document.content.title, rgb: GREEN });
  figures(document).slice(0, 4).forEach(({ item, number }, index) => {
    slides.push({
      id: `number-${index}`,
      pattern: NUMBER_PATTERNS[index % NUMBER_PATTERNS.length]!,
      number: { value: number.value, unit: number.unit },
      count: Math.round(Math.abs(number.value)),
      caption: item.text,
      rgb: NUMBER_COLORS[index % NUMBER_COLORS.length]!,
    });
  });
  const sections = document.content.sections.filter((section) => (section.items ?? []).length && !(section.items ?? []).every((item) => item.numbers?.length));
  sections.slice(0, 2).forEach((section, index) => {
    slides.push({ id: `section-${index}`, pattern: "heat", lines: twoLines(section.title), caption: section.items?.[0]?.text ?? "", rgb: BLUE });
  });
  const last = document.content.sections[document.content.sections.length - 1];
  slides.push({
    id: "end",
    pattern: "beam",
    lines: twoLines(t("film.end")),
    caption: last?.items?.[0]?.text ?? document.content.title,
    rgb: WARM,
    end: true,
  });
  return slides;
}

const random = (index: number, seed = 1) => {
  const value = Math.sin(index * 127.1 * seed + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const heatValue = (day: number, hour: number) =>
  (hour < 8 || hour > 20 || day > 4 ? 0.05 : 0.22 + Math.abs(Math.sin((day * 24 + hour) * 1.7)) * 0.55) * (day === 0 ? 1.5 : 1);

type Particle = { x: number; y: number; tx: number; ty: number; s: number; ts: number; a: number; ta: number; c: number; tc: number; d: number };

/** One field of particles that reshapes itself from slide to slide, so the film never cuts. */
function useField(ref: RefObject<HTMLCanvasElement | null>, slide: () => Slide, age: () => number) {
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    let ratio = 1;
    const particles: Particle[] = Array.from({ length: PARTICLES }, (_, index) => ({
      x: random(index) * 1600, y: random(index, 2) * 900, tx: 0, ty: 0, s: 1, ts: 1, a: 0, ta: 0.1, c: 0, tc: 0, d: 0.03 + random(index, 3) * 0.05,
    }));
    const resize = () => {
      ratio = Math.min(2, devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const rgb = [...slide().rgb];
    let last = 0;
    const middle = () => ({ cx: width * 0.73, cy: height * 0.5, r: Math.min(width * 0.22, height * 0.36) });
    const star = (p: Particle, index: number, alpha = 0.09) => {
      p.tx = random(index, 4) * width;
      p.ty = random(index, 5) * height;
      p.ts = 0.8;
      p.ta = alpha;
      p.tc = 0;
    };
    const place = (current: Slide, time: number, reveal: number) => {
      const { cx, cy, r } = middle();
      const count = Math.max(1, Math.min(current.count ?? 0, 300));
      particles.forEach((p, index) => {
        switch (current.pattern) {
          case "grid": {
            if (index >= count) return star(p, index);
            const cols = count > 150 ? 20 : 15;
            const gap = (r * 2) / (cols - 1);
            p.tx = cx - r + (index % cols) * gap;
            p.ty = cy - gap * Math.ceil(count / cols / 2) + Math.floor(index / cols) * gap;
            p.ts = gap * 0.17;
            p.ta = index / count < reveal ? 1 : 0.08;
            p.tc = 1;
            return;
          }
          case "rise": {
            const first = index % 2 === 0;
            const u = index / PARTICLES;
            const smooth = (x: number) => {
              const v = Math.max(0, Math.min(1, x));
              return v * v * (3 - 2 * v);
            };
            const k = smooth((u - (first ? 0.42 : 0.56)) / (first ? 0.5 : 0.4));
            p.tx = width * (0.04 + u * 0.94);
            p.ty = height * (first ? 0.9 : 0.94) - k * height * (first ? 0.68 : 0.5) + Math.sin(u * 30 + time * 0.002) * 1.2;
            p.ts = first ? 1.7 : 1.4;
            p.ta = u < reveal ? 0.95 - random(index, 6) * 0.3 : 0;
            p.tc = first ? 1 : 0;
            return;
          }
          case "bars": {
            const per = 54;
            if (index >= per * 4) return star(p, index);
            const column = Math.floor(index / per);
            const j = index % per;
            const w = r * 0.42;
            const gap = r * 0.09;
            const step = w / 5;
            p.tx = cx - r + column * (w + gap) + (j % 6) * step;
            p.ty = cy + step * 4 - Math.floor(j / 6) * step + (reveal < 1 ? (1 - reveal) * 26 : 0);
            p.ts = 2.8;
            p.ta = (column + 1) / 4 - 0.25 < reveal ? 1 : 0.05;
            p.tc = 1;
            return;
          }
          case "heat": {
            if (index >= 168) return star(p, index);
            const day = Math.floor(index / 24);
            const hour = index % 24;
            const gap = Math.min((r * 2.1) / 23, 19);
            p.tx = cx - gap * 11.5 + hour * gap;
            p.ty = height * 0.79 - gap * 3 + day * gap;
            const value = Math.min(1, heatValue(day, hour));
            p.ts = gap * (0.12 + value * 0.28);
            p.ta = hour / 24 < reveal * 1.1 ? value : 0.03;
            p.tc = day === 0 ? 1 : 0;
            return;
          }
          case "drift": {
            p.tx = random(index, 7) * width + Math.sin(time * 0.0006 + index) * 16;
            p.ty = ((random(index, 8) * height + time * (0.012 + random(index, 9) * 0.03)) % (height + 20)) - 10;
            p.ts = 0.8 + random(index, 2) * 1.6;
            p.ta = 0.16 + random(index, 3) * 0.42;
            p.tc = 1;
            return;
          }
          case "ring": {
            const lit = index < 420;
            const angle = (lit ? index / 420 : (index - 420) / (PARTICLES - 420)) * Math.PI * 2 - Math.PI / 2;
            const radius = r * (1 + (random(index, 3) - 0.5) * 0.05);
            p.tx = cx + Math.cos(angle) * radius;
            p.ty = cy + Math.sin(angle) * radius;
            p.ts = lit ? 2 : 1;
            p.ta = lit ? (index / 420 < 0.65 * reveal ? 1 : 0.08) : 0.1;
            p.tc = lit ? 1 : 0;
            return;
          }
          default: {
            const ox = width * 1.01;
            const oy = -height * 0.02;
            const spread = (random(index, 3) - 0.5) * 0.36;
            const direction = Math.atan2(height * 0.62, width * 0.86) + Math.sin(time * 0.00035) * 0.045 + spread;
            const diagonal = Math.hypot(width, height);
            const distance = (0.04 + random(index, 6) ** 0.7) * diagonal * 1.05;
            p.tx = ox - Math.cos(direction) * distance;
            p.ty = oy + Math.sin(direction) * distance;
            p.ts = 0.8 + random(index, 7) * 1.4;
            p.ta = (0.16 + random(index, 8) * 0.5) * (1 - distance / (diagonal * 1.3)) * (1 - Math.abs(spread) * 2) * reveal;
            p.tc = 1;
          }
        }
      });
    };
    const draw = (time: number) => {
      const tick = Math.min(5, (time - (last || time - 16.7)) / 16.7);
      last = time;
      const ease = (f: number) => 1 - (1 - f) ** tick;
      const current = slide();
      const reveal = calm ? 1 : Math.min(1, age() / 1500);
      place(current, time, 1 - (1 - reveal) ** 3);
      for (let k = 0; k < 3; k++) rgb[k]! += (current.rgb[k]! - rgb[k]!) * ease(0.03);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.fillStyle = calm ? "rgb(5,6,10)" : "rgba(5,6,10,.34)";
      context.fillRect(0, 0, width, height);
      const m = middle();
      const end = current.pattern === "beam";
      const gx = end ? width : m.cx;
      const gy = end ? 0 : m.cy;
      const gr = end ? width * 0.34 : m.r;
      const color = `${rgb[0]! | 0},${rgb[1]! | 0},${rgb[2]! | 0}`;
      const glow = context.createRadialGradient(gx, gy, 0, gx, gy, gr * 2.3);
      glow.addColorStop(0, `rgba(${color},${end ? 0.2 : 0.075})`);
      glow.addColorStop(1, `rgba(${color},0)`);
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      const accent = `rgb(${color})`;
      for (const p of particles) {
        const f = calm ? 1 : ease(p.d + (current.pattern === "drift" ? 0.12 : 0.02));
        p.x += (p.tx - p.x) * f;
        p.y += (p.ty - p.y) * f;
        p.s += (p.ts - p.s) * ease(0.08);
        p.a += (p.ta - p.a) * ease(0.1);
        p.c += (p.tc - p.c) * ease(0.08);
        if (p.a < 0.012) continue;
        context.globalAlpha = Math.min(1, p.a);
        context.fillStyle = p.c > 0.5 ? accent : "#fff";
        context.beginPath();
        context.arc(p.x, p.y, Math.max(0.4, p.s), 0, 6.283);
        context.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

function CountUp({ value, unit }: { value: number; unit?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const locale = language() === "de" ? "de-DE" : "en-GB";
  const format = (current: number) => formatNumber({ value: current, unit }, locale);
  useEffect(() => {
    const element = ref.current!;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.textContent = format(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (time: number) => {
      const k = Math.min(1, (time - start) / 1300);
      element.textContent = format(k < 1 ? Math.round(value * (1 - (1 - k) ** 3) * 10) / 10 : value);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const text = format(value);
  return <div ref={ref} className={`film-huge film-in ${text.length > 6 ? "long" : ""}`}>{format(0)}</div>;
}

/** The weekly recap as a short film: one slide at a time, with a particle field that follows the content. */
export function Film({ document, onClose, label }: { document: BriefingDocument; onClose: () => void; label: string }) {
  const slides = useMemo(() => slidesOf(document), [document]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bars = useRef<(HTMLElement | null)[]>([]);
  const state = useRef({ index: 0, elapsed: 0, hold: false, paused: false, last: 0, down: 0 });
  const start = useRef(0);
  const current = slides[index]!;
  const go = (next: number) => {
    const target = Math.max(0, Math.min(slides.length - 1, next));
    state.current.index = target;
    state.current.elapsed = 0;
    start.current = performance.now();
    setIndex(target);
  };
  useField(canvas, () => slides[state.current.index]!, () => performance.now() - start.current);
  useEffect(() => {
    start.current = performance.now();
    state.current.last = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const s = state.current;
      const delta = time - s.last;
      s.last = time;
      if (!s.hold && !s.paused) s.elapsed += delta;
      const k = Math.min(1, s.elapsed / DURATION);
      bars.current.forEach((bar, n) => {
        if (bar) bar.style.transform = `scaleX(${n < s.index ? 1 : n === s.index ? k : 0})`;
      });
      if (k >= 1 && s.index < slides.length - 1) go(s.index + 1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => {
    const value = !state.current.paused;
    state.current.paused = value;
    setPaused(value);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(state.current.index + 1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(state.current.index - 1);
      }
      if (event.key === " ") {
        event.preventDefault();
        toggle();
      }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  });
  const down = () => {
    state.current.hold = true;
    state.current.down = performance.now();
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    s.hold = false;
    if (performance.now() - s.down > 260 || (event.target as HTMLElement).closest("button")) return;
    const box = event.currentTarget.getBoundingClientRect();
    go(s.index + ((event.clientX - box.left) / box.width < 0.3 ? -1 : 1));
  };
  const stop = (event: PointerEvent) => event.stopPropagation();
  return (
    <div className="film" role="dialog" aria-label={t("film.label")} style={{ containerType: "inline-size" }} onPointerDown={down} onPointerUp={up}>
      <canvas ref={canvas} aria-hidden="true" />
      <div className="film-bars">
        {slides.map((slide, n) => (
          <span key={slide.id}><i ref={(element) => { bars.current[n] = element; }} /></span>
        ))}
      </div>
      <div className="film-top">
        <span className="grow">{label}{paused && ` · ${t("film.paused")}`}</span>
        <button type="button" aria-label={paused ? t("film.play") : t("film.pause")} onPointerUp={stop} onClick={toggle}>
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button type="button" aria-label={t("film.close")} onPointerUp={stop} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="film-txt" key={current.id}>
        {current.number && <CountUp value={current.number.value} unit={current.number.unit} />}
        {current.lines && (
          <div className="film-h">
            {current.lines.map((line, n) => (
              <span key={n}><b style={{ animationDelay: `${0.1 + n * 0.14}s` }}>{line}</b></span>
            ))}
          </div>
        )}
        <p className={`film-cap film-in ${current.number ? "d2" : "d1"}`}>{current.caption}</p>
        {current.end && (
          <div className="film-end film-in d3" onPointerUp={stop} onPointerDown={stop}>
            <Btn variant="primary" onClick={onClose}>{t("film.back")}</Btn>
            <Btn onClick={() => go(0)}><RotateCcw />{t("film.again")}</Btn>
          </div>
        )}
      </div>
      <div className="film-hint">
        <span><kbd>←</kbd><kbd>→</kbd> {t("film.browse")}</span>
        <span><kbd>{t("film.space")}</kbd> {t("film.pause")}</span>
        <span><kbd>Esc</kbd> {t("film.close")}</span>
      </div>
    </div>
  );
}
