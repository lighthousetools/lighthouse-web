import { Check } from "lucide-react";
import { Fragment, type ReactNode } from "react";

// A small Markdown renderer for notes, reports and answers. It builds React elements, never HTML, so text
// from models and files cannot inject markup. It handles what the Brain writes: headings, lists, checkboxes,
// quotes, callouts, code, tables, links, wiki links, tags and citation markers.
export type MarkdownOptions = {
  onWiki?: (name: string) => void;
  wikiExists?: (name: string) => boolean;
  onTag?: (tag: string) => void;
  onLink?: (target: string) => void;
  onToggle?: (line: number) => void;
  cite?: (index: number) => ReactNode;
};

const INLINE =
  /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|==[^=]+==|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)\s]+\)|\[\^\d+\]|(?<![\p{L}\d/&])#[\p{L}][\p{L}\d_-]*)/gu;

const isWeb = (target: string) => /^https?:\/\//i.test(target) || /^mailto:/i.test(target);

export function inline(text: string, options: MarkdownOptions, key = "i"): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    const k = `${key}${index}`;
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={k}>{inline(part.slice(2, -2), options, k)}</strong>;
    if (part.startsWith("==") && part.endsWith("==") && part.length > 4) return <mark key={k}>{part.slice(2, -2)}</mark>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={k}>{part.slice(1, -1)}</code>;
    if (part.startsWith("[[") && part.endsWith("]]")) {
      const [name = "", alias] = part.slice(2, -2).split("|").map((value) => value.trim());
      const exists = options.wikiExists ? options.wikiExists(name) : true;
      return (
        <button
          key={k}
          type="button"
          className={exists ? "md-wl" : "md-wl new"}
          title={name}
          onClick={(event) => {
            event.stopPropagation();
            options.onWiki?.(name);
          }}
        >
          {alias ?? name}
        </button>
      );
    }
    const cite = /^\[\^(\d+)\]$/.exec(part);
    if (cite) return <Fragment key={k}>{options.cite?.(Number(cite[1]))}</Fragment>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, target = ""] = link;
      return isWeb(target) ? (
        <a key={k} className="md-link" href={target} target="_blank" rel="noopener noreferrer">{label}</a>
      ) : (
        <button
          key={k}
          type="button"
          className="md-link"
          onClick={(event) => {
            event.stopPropagation();
            options.onLink?.(target);
          }}
        >
          {label}
        </button>
      );
    }
    if (part.startsWith("#") && part.length > 1) {
      return options.onTag ? (
        <button
          key={k}
          type="button"
          className="md-tag"
          onClick={(event) => {
            event.stopPropagation();
            options.onTag?.(part.slice(1));
          }}
        >
          {part}
        </button>
      ) : (
        <span key={k} className="md-tag">{part}</span>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={k}>{inline(part.slice(1, -1), options, k)}</em>;
    return <Fragment key={k}>{part}</Fragment>;
  });
}

/** The headings of a text with their line numbers, outside code blocks. */
export function headingsOf(source: string) {
  let fence = false;
  return source.split("\n").flatMap((line, index) => {
    if (line.startsWith("```")) fence = !fence;
    const match = !fence && /^(#{1,6})\s+(.+)/.exec(line);
    return match ? [{ level: Math.min(match[1]!.length, 3), text: match[2]!, line: index }] : [];
  });
}

const LIST = /^\s*([-*+]|\d+\.)\s/;
const BLOCK_START = /^(#{1,6}\s|```|>|\||\s*([-*+]|\d+\.)\s|-{3,}$|\*{3,}$)/;

export function Markdown({ source, className, ...options }: MarkdownOptions & { source: string; className?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const start = index;
    if (!line.trim()) {
      index++;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      index++;
      while (index < lines.length && !lines[index]!.startsWith("```")) body.push(lines[index++]!);
      index++;
      out.push(<pre key={start}>{body.join("\n")}</pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)/.exec(line);
    if (heading) {
      const Tag = `h${Math.min(heading[1]!.length, 3)}` as "h1";
      out.push(<Tag key={start} data-line={start}>{inline(heading[2]!, options)}</Tag>);
      index++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      out.push(<hr key={start} />);
      index++;
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (index < lines.length && lines[index]!.startsWith(">")) body.push(lines[index++]!.replace(/^>\s?/, ""));
      const call = /^\[!(warn|warning|info|note|ok|tip)\]\s*(.*)/i.exec(body[0] ?? "");
      const tone = call ? ({ warning: "warn", note: "info", tip: "ok" } as Record<string, string>)[call[1]!.toLowerCase()] ?? call[1]!.toLowerCase() : "";
      if (call) body[0] = call[2] ?? "";
      out.push(
        <blockquote key={start} className={call ? `md-call ${tone}` : ""}>
          {body.filter((text, n) => text || n > 0).map((text, n) => <p key={n}>{inline(text, options)}</p>)}
        </blockquote>,
      );
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index]!.startsWith("|")) {
        const row = lines[index]!.trim();
        if (!/^\|[\s:|-]+\|$/.test(row)) rows.push(row.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
        index++;
      }
      const [head = [], ...body] = rows;
      out.push(
        <div className="md-tw" key={start}>
          <table>
            <thead>
              <tr>{head.map((cell, n) => <th key={n}>{inline(cell, options)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, n) => (
                <tr key={n}>{row.map((cell, m) => <td key={m}>{inline(cell, options)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (LIST.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length && LIST.test(lines[index]!)) {
        const raw = lines[index]!.replace(LIST, "");
        const box = /^\[( |x)\]\s(.*)/i.exec(raw);
        const lineNumber = index;
        const nested = /^\s{2,}/.test(lines[index]!);
        const done = box?.[1] !== " ";
        items.push(
          box ? (
            <li key={index} className={`md-task${nested ? " sub" : ""}${done ? " done" : ""}`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={box[2]}
                disabled={!options.onToggle}
                onClick={(event) => {
                  event.stopPropagation();
                  options.onToggle?.(lineNumber);
                }}
              >
                {done && <Check size={10} strokeWidth={3} />}
              </button>
              <span>{inline(box[2]!, options)}</span>
            </li>
          ) : (
            <li key={index} className={nested ? "sub" : ""}>{inline(raw, options)}</li>
          ),
        );
        index++;
      }
      const List = ordered ? "ol" : "ul";
      out.push(<List key={start}>{items}</List>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() && !BLOCK_START.test(lines[index]!)) paragraph.push(lines[index++]!);
    if (!paragraph.length) {
      paragraph.push(line);
      index++;
    }
    out.push(<p key={start}>{inline(paragraph.join(" "), options)}</p>);
  }
  return <div className={className ? `md ${className}` : "md"}>{out}</div>;
}

/** Flips the checkbox on one line of a Markdown text. */
export function toggleTask(source: string, line: number) {
  const lines = source.split("\n");
  const current = lines[line];
  if (current === undefined) return source;
  lines[line] = current.replace(/\[( |x)\]/i, (match) => (match === "[ ]" ? "[x]" : "[ ]"));
  return lines.join("\n");
}
