import type { UseQueryResult } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ReactNode } from "react";

/** Renders Markdown from models and files, which is untrusted, after sanitizing. */
export function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false }));
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

const TONES: Record<string, string> = {
  succeeded: "ok", allowed: "ok", approved: "ok", active: "ok", done: "ok",
  waiting: "warn", pending: "warn", running: "warn", superseded: "warn",
  failed: "bad", rejected: "bad", denied: "bad", limit_exceeded: "bad", expired: "bad",
};

export function Status({ value }: { value: string }) {
  return <span className={`pill ${TONES[value] ?? ""}`}>{value.replace("_", " ")}</span>;
}

export function Loaded<T>({
  query,
  empty,
  children,
}: {
  query: UseQueryResult<T[]>;
  empty: string;
  children: (items: T[]) => ReactNode;
}) {
  if (query.isPending) return <p className="empty">Loading…</p>;
  if (query.isError) return <p className="error">{query.error.message}</p>;
  if (query.data.length === 0) return <p className="empty">{empty}</p>;
  return <>{children(query.data)}</>;
}

export function Failure({ error }: { error: Error | null }) {
  return error ? (
    <p className="error" role="alert">
      {error.message}
    </p>
  ) : null;
}

export function when(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "–";
}

export function euro(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(value);
}
