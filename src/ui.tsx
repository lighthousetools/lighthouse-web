import type { UseQueryResult } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from "react";
import { statusLabel } from "./format";
import { t } from "./i18n";

const WIKI_LINK = /\[\[([^\]\n]+)\]\]/g;

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Turns Markdown into safe HTML. Everything from models and files is untrusted. */
export function renderMarkdown(text: string) {
  const linked = text.replace(WIKI_LINK, (_, title: string) => {
    const safe = escapeHtml(title.trim());
    return `<a href="#" data-wiki="${safe}">${safe}</a>`;
  });
  return DOMPurify.sanitize(marked.parse(linked, { async: false, gfm: true }));
}

export function Markdown({
  text,
  onWikiLink,
}: {
  text: string;
  onWikiLink?: (title: string) => void;
}) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  const follow = (event: MouseEvent) => {
    const link = (event.target as HTMLElement).closest<HTMLElement>("a[data-wiki]");
    if (!link) return;
    event.preventDefault();
    onWikiLink?.(link.dataset.wiki ?? "");
  };
  return <div className="markdown" onClick={follow} dangerouslySetInnerHTML={{ __html: html }} />;
}

const TONES: Record<string, string> = {
  succeeded: "ok", done: "ok", allowed: "ok", approved: "ok", active: "ok",
  waiting: "attn", pending: "attn", running: "run", superseded: "",
  failed: "err", rejected: "err", denied: "err", limit_exceeded: "err", expired: "err",
};

export function Status({ value }: { value: string }) {
  return <span className={`pill ${TONES[value] ?? ""}`}>{statusLabel(value)}</span>;
}

export function Dot({ tone }: { tone?: "ok" | "run" | "attn" | "err" | "off" }) {
  return <span className={`dot ${tone ?? ""}`} aria-hidden="true" />;
}

export function Skeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-label={t("common.loading")} role="status">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton" key={index} />
      ))}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint && <span className="muted">{hint}</span>}
    </div>
  );
}

export function Loaded<T>({
  query,
  empty,
  hint,
  children,
}: {
  query: UseQueryResult<T[]>;
  empty: string;
  hint?: string;
  children: (items: T[]) => ReactNode;
}) {
  if (query.isPending) return <Skeleton />;
  if (query.isError) return <p className="error">{query.error.message}</p>;
  if (query.data.length === 0) return <Empty title={empty} hint={hint} />;
  return <>{children(query.data)}</>;
}

export function Failure({ error }: { error: Error | null | undefined }) {
  return error ? (
    <p className="error" role="alert">
      {error.message}
    </p>
  ) : null;
}

export function Head({
  title,
  lead,
  eyebrow,
  children,
}: {
  title: string;
  lead?: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <header className="head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {lead && <p className="sub">{lead}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  );
}

export function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="sec">
      <h2 className="sec-h">
        {title}
        {count !== undefined && <small>{count}</small>}
      </h2>
      {children}
    </section>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.3 22h5.4l-1.1-13h-3.2z" fill="currentColor" />
      <path d="M12 2.5l3.2 3.2H8.8z" fill="currentColor" />
      <path d="M10 6.2h4v2.3h-4z" fill="var(--lamp)" />
      <path d="M2 7.4h5M17 7.4h5" stroke="var(--lamp)" strokeWidth="1.5" />
    </svg>
  );
}

/** A modal dialog that traps focus and closes on Escape. */
export function Dialog({
  label,
  small,
  onClose,
  children,
}: {
  label: string;
  small?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        ref={box}
        className={`dialog fade ${small ? "small" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

export function Confirm({
  title,
  body,
  action,
  onConfirm,
  onClose,
}: {
  title: string;
  body?: string;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog label={title} small onClose={onClose}>
      <h2>{title}</h2>
      {body && <p className="sub">{body}</p>}
      <div className="actions" style={{ marginTop: 14 }}>
        <button className="btn" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          className="btn danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {action}
        </button>
      </div>
    </Dialog>
  );
}
