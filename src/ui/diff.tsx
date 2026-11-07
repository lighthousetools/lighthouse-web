import { ChevronDown, ChevronRight, MessageSquarePlus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n";
import { Avatar, Btn, CheckBox, scrollMotion } from ".";
import "./diff.css";

export type Hunk = { head: string; o: number; n: number; lines: ["+" | "-" | " ", string][] };
export type DiffFile = { path: string; add: number; del: number; hunks: Hunk[] };
export type DiffComment = { who: string; text: string; at: string };
export type DiffNote = { path: string; line: string; text: string; ev?: string };

const split = (path: string) => {
  const index = path.lastIndexOf("/");
  return [path.slice(0, index + 1), path.slice(index + 1)] as const;
};

/** Reads a unified diff, as `git diff` prints it, into files and hunks. */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: Hunk | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git")) {
      file = null;
      hunk = null;
      continue;
    }
    if (line.startsWith("+++ ")) {
      file = { path: line.slice(4).replace(/^b\//, ""), add: 0, del: 0, hunks: [] };
      files.push(file);
      continue;
    }
    if (line.startsWith("--- ") || !file) continue;
    const head = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(line);
    if (head) {
      hunk = { o: Number(head[1]), n: Number(head[2]), head: head[3] ?? "", lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    const sign = line[0];
    if (sign === "+") file.add++;
    if (sign === "-") file.del++;
    if (sign === "+" || sign === "-" || sign === " ") hunk.lines.push([sign, line.slice(1)]);
  }
  return files;
}

type Side = { n: number | ""; text: string; sign: "+" | "-" | " " } | null;

/** Pairs removed and added lines side by side; context lines stand on both sides. */
export function splitRows(hunk: Hunk): [Side, Side][] {
  const rows: [Side, Side][] = [];
  let oldLine = hunk.o;
  let newLine = hunk.n;
  let index = 0;
  while (index < hunk.lines.length) {
    const [sign, text] = hunk.lines[index]!;
    if (sign === " ") {
      rows.push([{ n: oldLine++, text, sign }, { n: newLine++, text, sign }]);
      index++;
      continue;
    }
    const removed: Side[] = [];
    const added: Side[] = [];
    while (index < hunk.lines.length && hunk.lines[index]![0] === "-") removed.push({ n: oldLine++, text: hunk.lines[index++]![1], sign: "-" });
    while (index < hunk.lines.length && hunk.lines[index]![0] === "+") added.push({ n: newLine++, text: hunk.lines[index++]![1], sign: "+" });
    for (let row = 0; row < Math.max(removed.length, added.length); row++) rows.push([removed[row] ?? null, added[row] ?? null]);
  }
  return rows;
}

function SplitHunk({ hunk }: { hunk: Hunk }) {
  const cell = (side: Side) =>
    side ? (
      <>
        <span className="ln tn">{side.n}</span>
        <code className={side.sign === "+" ? "add" : side.sign === "-" ? "del" : ""}>{side.text || " "}</code>
      </>
    ) : (
      <>
        <span className="ln" />
        <code className="nil"> </code>
      </>
    );
  return (
    <div className="dfh">
      <div className="dfhh mono">@@ −{hunk.o} +{hunk.n} @@ <span>{hunk.head}</span></div>
      {splitRows(hunk).map(([left, right], index) => (
        <div key={index} className="dfr2">{cell(left)}{cell(right)}</div>
      ))}
    </div>
  );
}

const Counts = ({ add, del }: { add: number; del: number }) => (
  <span className="dfn tn">
    <b>+{add}</b>
    <i>−{del}</i>
  </span>
);

/** Files list plus hunks. Each changed line takes a comment, notes render in amber at their line. */
export function DiffViewer({ files, comments = {}, onComment, onDelete, notes = [], viewed = [], onViewed, focus, toolbar, me, sideBySide }: {
  sideBySide?: boolean; files: DiffFile[]; comments?: Record<string, DiffComment[]>; onComment?: (key: string, text: string) => void;
  onDelete?: (key: string, index: number) => void; notes?: DiffNote[]; viewed?: string[]; onViewed?: (path: string) => void;
  focus?: string | null; toolbar?: ReactNode; me?: string;
}) {
  const [closed, setClosed] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const total = useMemo(
    () => files.reduce((sum, file) => ({ add: sum.add + file.add, del: sum.del + file.del }), { add: 0, del: 0 }),
    [files],
  );
  const reveal = (path: string) => {
    setClosed((current) => current.filter((item) => item !== path));
    requestAnimationFrame(() => refs.current[path]?.scrollIntoView?.({ behavior: scrollMotion(), block: "start" }));
  };
  useEffect(() => {
    if (focus) reveal(focus);
  }, [focus]);
  const send = (key: string) => {
    if (!text.trim()) return;
    onComment?.(key, text.trim());
    setText("");
    setOpen(null);
  };
  const countOf = (path: string) =>
    Object.entries(comments)
      .filter(([key]) => key.startsWith(`${path}#`))
      .reduce((sum, [, list]) => sum + list.length, 0) + notes.filter((note) => note.path === path).length;
  return (
    <div className="dfx">
      <div className="dfl">
        <div className="dflh">
          <span className="clip">{t("diff.files", { count: files.length })}</span>
          <Counts {...total} />
        </div>
        {toolbar}
        {onViewed && (
          <div className="dflv tn">
            {t("diff.viewed", { done: viewed.filter((path) => files.some((file) => file.path === path)).length, count: files.length })}
          </div>
        )}
        {files.map((file) => {
          const [dir, name] = split(file.path);
          const count = countOf(file.path);
          return (
            <button type="button" key={file.path} className={viewed.includes(file.path) ? "seen" : ""} onClick={() => reveal(file.path)} title={file.path}>
              <span className="clip nm">
                {name}
                <small>{dir.replace(/\/$/, "")}</small>
              </span>
              {count > 0 && <em className="tn">{count}</em>}
              <Counts add={file.add} del={file.del} />
            </button>
          );
        })}
      </div>
      <div className="dfm">
        {files.map((file) => {
          const [dir, name] = split(file.path);
          const shut = closed.includes(file.path);
          const toggle = () => setClosed((current) => (shut ? current.filter((item) => item !== file.path) : [...current, file.path]));
          return (
            <section key={file.path} className="dff" ref={(element) => { refs.current[file.path] = element; }}>
              <header onClick={toggle}>
                <button type="button" aria-expanded={!shut} aria-label={shut ? t("diff.expand") : t("diff.collapse")}>
                  {shut ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <span className="clip mono">
                  <span className="faint">{dir}</span>
                  {name}
                </span>
                <Counts add={file.add} del={file.del} />
                {onViewed && (
                  <span className="dfv" onClick={(event) => event.stopPropagation()}>
                    <CheckBox
                      on={viewed.includes(file.path)}
                      label={t("diff.markViewed")}
                      onChange={() => {
                        if (!viewed.includes(file.path)) setClosed((current) => [...current, file.path]);
                        onViewed(file.path);
                      }}
                    />
                    {t("diff.seen")}
                  </span>
                )}
              </header>
              {!shut && sideBySide && file.hunks.map((hunk, hunkIndex) => <SplitHunk key={hunkIndex} hunk={hunk} />)}
              {!shut && !sideBySide &&
                file.hunks.map((hunk, hunkIndex) => {
                  let oldLine = hunk.o;
                  let newLine = hunk.n;
                  return (
                    <div key={hunkIndex} className="dfh">
                      <div className="dfhh mono">
                        @@ −{hunk.o} +{hunk.n} @@ <span>{hunk.head}</span>
                      </div>
                      {hunk.lines.map(([sign, content], lineIndex) => {
                        const before = sign === "+" ? "" : oldLine++;
                        const after = sign === "-" ? "" : newLine++;
                        const key = `${file.path}#${hunkIndex}:${lineIndex}`;
                        const list = comments[key] ?? [];
                        const lineNotes = notes.filter((note) => note.path === file.path && note.line === `${hunkIndex}:${lineIndex}`);
                        return (
                          <div key={lineIndex}>
                            <div className={`dfr ${sign === "+" ? "add" : sign === "-" ? "del" : ""}`}>
                              <span className="ln tn">{before}</span>
                              <span className="ln tn">{after}</span>
                              {onComment ? (
                                <button
                                  type="button"
                                  className="dfc"
                                  aria-label={t("diff.commentLine", { line: after || before })}
                                  onClick={() => {
                                    setOpen(open === key ? null : key);
                                    setText("");
                                  }}
                                >
                                  <MessageSquarePlus size={12} />
                                </button>
                              ) : (
                                <span className="dfc0" />
                              )}
                              <span className="sg">{sign === " " ? "" : sign === "-" ? "−" : "+"}</span>
                              <code>{content || " "}</code>
                            </div>
                            {lineNotes.map((note, index) => (
                              <div key={index} className="dfnote">
                                <div className="h">
                                  <Sparkles size={12} />
                                  {t("diff.note")}
                                </div>
                                <p>{note.text}</p>
                                {note.ev && <span className="z-ev mono">{note.ev}</span>}
                              </div>
                            ))}
                            {list.map((comment, index) => (
                              <div key={index} className="dfcm">
                                <Avatar name={comment.who} size={20} />
                                <div className="grow">
                                  <div className="h">
                                    <b>{comment.who}</b>
                                    <small className="tn">{comment.at}</small>
                                  </div>
                                  <p>{comment.text}</p>
                                </div>
                                {comment.who === me && onDelete && (
                                  <Btn size="xs" icon variant="ghost" aria-label={t("diff.deleteComment")} onClick={() => onDelete(key, index)}>
                                    <Trash2 />
                                  </Btn>
                                )}
                              </div>
                            ))}
                            {open === key && (
                              <div className="dfnew">
                                <textarea
                                  autoFocus
                                  aria-label={t("diff.comment")}
                                  placeholder={t("diff.commentPlaceholder")}
                                  value={text}
                                  onChange={(event) => setText(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send(key);
                                    if (event.key === "Escape") {
                                      event.stopPropagation();
                                      setOpen(null);
                                    }
                                  }}
                                />
                                <div className="ft">
                                  <span className="faint" />
                                  <Btn size="xs" variant="ghost" onClick={() => setOpen(null)}>{t("common.cancel")}</Btn>
                                  <Btn size="xs" variant="primary" kbd="⌘↵" disabled={!text.trim()} onClick={() => send(key)}>
                                    {t("diff.comment")}
                                  </Btn>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
