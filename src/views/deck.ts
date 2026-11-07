// Slides from a deck's Markdown. A line with only `---` starts a new slide, as on the server.
// Lines starting with `Note:` are speaker notes: the presenter shows them, the slide does not.

export type Layout = "cover" | "closing" | "statement" | "number" | "quote" | "bullets" | "text";
export type Slide = { layout: Layout; title: string; sub?: string; items: string[]; body: string; note: string; source: string };

export function splitSlides(markdown: string): string[] {
  const slides: string[] = [];
  let current: string[] = [];
  for (const line of markdown.split("\n")) {
    if (line.trim() === "---") {
      slides.push(current.join("\n"));
      current = [];
    } else current.push(line);
  }
  slides.push(current.join("\n"));
  return slides.map((slide) => slide.trim()).filter(Boolean);
}

export const joinSlides = (slides: string[]) => `${slides.map((slide) => slide.trim()).join("\n\n---\n\n")}\n`;

const NUMBER = /^[~≈+-]?\d[\d.,]*\s?(%|[a-zA-Z€$£]{0,4})$/;

export function parseSlide(source: string, index: number, count: number): Slide {
  const lines = source.split("\n");
  const note = lines.filter((line) => /^note:/i.test(line.trim())).map((line) => line.trim().replace(/^note:\s*/i, "")).join(" ");
  const content = lines.filter((line) => !/^note:/i.test(line.trim()));
  const heading = content.findIndex((line) => /^#{1,3}\s/.test(line));
  const title = heading === -1 ? "" : content[heading]!.replace(/^#{1,3}\s+/, "").trim();
  const rest = content.filter((_, at) => at !== heading);
  const items = rest.filter((line) => /^\s*([-*]|\d+\.)\s/.test(line)).map((line) => line.replace(/^\s*([-*]|\d+\.)\s+/, "").trim());
  const quote = rest.filter((line) => line.trim().startsWith(">")).map((line) => line.replace(/^\s*>\s?/, "")).join(" ").trim();
  const prose = rest.filter((line) => line.trim() && !/^\s*([-*]|\d+\.)\s/.test(line) && !line.trim().startsWith(">"));
  const body = rest.join("\n").trim();
  const sub = prose.length ? prose.join(" ").trim() : undefined;
  const base = { title, sub, items, body, note, source };
  if (quote && !items.length) return { ...base, layout: "quote", title: quote, sub: title || sub };
  if (NUMBER.test(title) && !items.length) return { ...base, layout: "number" };
  if (index === 0 && count > 1 && !items.length) return { ...base, layout: "cover" };
  if (index === count - 1 && count > 2 && !items.length && prose.length <= 2) return { ...base, layout: "closing" };
  if (items.length && prose.length <= 1) return { ...base, layout: "bullets" };
  if (!rest.some((line) => line.trim()) || (prose.length === 1 && (sub?.length ?? 0) < 90)) return { ...base, layout: "statement" };
  return { ...base, layout: "text" };
}

export const slidesOf = (markdown: string) => {
  const parts = splitSlides(markdown);
  return parts.map((part, index) => parseSlide(part, index, parts.length));
};

/** Speaking time, about a minute and a half per slide. */
export const minutesFor = (count: number) => Math.max(1, Math.round(count * 1.5));
