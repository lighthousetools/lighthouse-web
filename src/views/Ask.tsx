import { ArrowUp, Sparkles, Square } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { askStream, type Schemas } from "../api/client";
import { t, useLanguage } from "../i18n";
import { go } from "../router";
import { Btn } from "../ui";
import { Markdown } from "../ui/markdown";

/** Streams an answer from the Brain while it is written. */
export function useAsk() {
  const [text, setText] = useState("");
  const [sources, setSources] = useState<Schemas["EntrySummary"][] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState("");
  const running = useRef<AbortController | null>(null);
  const ask = async (question: string) => {
    if (busy) {
      running.current?.abort();
      return;
    }
    if (!question.trim()) return;
    const control = new AbortController();
    running.current = control;
    setBusy(true);
    setAsked(question.trim());
    setText("");
    setSources(null);
    setFailure(null);
    try {
      const answer = await askStream(question, (piece) => setText((current) => current + piece), control.signal);
      setSources(answer.sources);
    } catch (error) {
      if (!control.signal.aborted) setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    running.current?.abort();
    setText("");
    setSources(null);
    setFailure(null);
    setAsked("");
  };
  return { text, sources, failure, busy, asked, ask, reset };
}

export function Answer({ state }: { state: ReturnType<typeof useAsk> }) {
  const { text, sources, failure, busy, asked } = state;
  if (!busy && !text && !failure) return null;
  return (
    <div className="bf-ans" aria-live="polite">
      <div className="ah">
        <Sparkles size={13} />
        <span className="grow clip">{asked}</span>
      </div>
      {failure && <p className="fail" role="alert">{t("ask.failed", { reason: failure })}</p>}
      {text ? <Markdown source={text} /> : busy && <p className="muted">{t("ask.thinking")}</p>}
      {sources && sources.length > 0 && (
        <div className="src">
          <span>{t("ask.sources")}</span>
          {sources.map((source) => (
            <button type="button" className="chip plain" key={source.id} onClick={() => go("brain", source.id)}>
              {source.title}
            </button>
          ))}
        </div>
      )}
      {sources?.length === 0 && <p className="faint" style={{ marginTop: 8, fontSize: 12 }}>{t("ask.noSources")}</p>}
    </div>
  );
}

export function AskBox({ initial = "" }: { initial?: string }) {
  useLanguage();
  const [question, setQuestion] = useState(initial);
  const state = useAsk();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void state.ask(question);
  };
  return (
    <div style={{ width: "100%" }}>
      <form className="bf-ask" onSubmit={submit}>
        <label className="field lg">
          <Sparkles />
          <input
            aria-label={t("ask.label")}
            placeholder={t("ask.placeholder")}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <Btn type="submit" size="lg" variant="primary" disabled={!state.busy && !question.trim()} aria-label={state.busy ? t("ask.stop") : t("ask.submit")}>
          {state.busy ? <Square /> : <ArrowUp />}
          {state.busy ? t("ask.stop") : t("ask.submit")}
        </Btn>
      </form>
      <Answer state={state} />
    </div>
  );
}
