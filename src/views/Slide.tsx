import { cx } from "../ui";
import { inline } from "../ui/markdown";
import type { Slide as SlideData } from "./deck";

const text = (value: string) => inline(value, {});

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

