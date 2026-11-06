import { useRef, useState, type FormEvent } from "react";
import { askStream, type Schemas } from "../api/client";
import { t, useLanguage } from "../i18n";
import { go } from "../router";
import { Markdown } from "../ui";

export function AskBox({ initial = "" }: { initial?: string }) {
  useLanguage();
  const [question, setQuestion] = useState(initial);
  const [text, setText] = useState("");
  const [sources, setSources] = useState<Schemas["EntrySummary"][] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef<AbortController | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) {
      running.current?.abort();
      return;
    }
    if (!question.trim()) return;
    const control = new AbortController();
    running.current = control;
    setBusy(true);
    setText("");
    setSources(null);
    setFailure(null);
    try {
      const answer = await askStream(
        question,
        (piece) => setText((current) => current + piece),
        control.signal,
      );
      setSources(answer.sources);
    } catch (error) {
      if (!control.signal.aborted) setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form className="ask-box" onSubmit={(event) => void submit(event)}>
        <input
          aria-label={t("ask.label")}
          placeholder={t("ask.placeholder")}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button className="btn primary" disabled={!busy && !question.trim()}>
          {busy ? t("ask.stop") : t("ask.submit")}
        </button>
      </form>
      {failure && (
        <p className="error" role="alert">
          {t("ask.failed", { reason: failure })}
        </p>
      )}
      {(busy || text) && (
        <div className="answer fade" aria-live="polite">
          {text ? <Markdown text={text} /> : <span className="muted">{t("ask.thinking")}</span>}
          {sources && sources.length > 0 && (
            <div className="chips">
              <span className="muted">{t("ask.sources")}</span>
              {sources.map((source) => (
                <a className="chip" key={source.id} href={`#brain/${source.id}`} onClick={(event) => {
                  event.preventDefault();
                  go("brain", source.id);
                }}>
                  {source.title}
                </a>
              ))}
            </div>
          )}
          {sources?.length === 0 && <p className="muted" style={{ marginTop: 8 }}>{t("ask.noSources")}</p>}
        </div>
      )}
    </div>
  );
}
