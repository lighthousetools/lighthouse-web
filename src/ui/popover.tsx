import { Check, Search } from "lucide-react";
import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type MouseEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import "./popover.css";

export type Anchor = { left: number; right: number; top: number; bottom: number };

/** Where a popover goes: below its anchor, or above (or left) when the window ends first. */
export function placePopover(
  anchor: Anchor,
  box: { width: number; height: number },
  view: { width: number; height: number },
  side: "bottom" | "right" = "bottom",
) {
  const margin = 8;
  if (side === "right") {
    const roomRight = anchor.right + 8 + box.width < view.width - margin;
    const left = roomRight ? anchor.right + 8 : Math.max(margin, anchor.left - 8 - box.width);
    return { left, top: Math.max(margin, Math.min(anchor.top, view.height - box.height - margin)) };
  }
  const below = anchor.bottom + 4 + box.height < view.height - margin;
  return {
    left: Math.max(margin, Math.min(anchor.left, view.width - box.width - margin)),
    top: below ? anchor.bottom + 4 : Math.max(margin, anchor.top - 4 - box.height),
  };
}

/** Popover pinned to an anchor. Esc and a press outside close it. */
export function Popover({ anchor, onClose, children, width, style, side = "bottom", label }: {
  anchor: Anchor; onClose: () => void; children: ReactNode; width?: number; style?: CSSProperties;
  side?: "bottom" | "right"; label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current!;
    setPos(placePopover(anchor, { width: element.offsetWidth, height: element.offsetHeight }, { width: innerWidth, height: innerHeight }, side));
  }, [anchor, side]);
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        onClose();
      }
    };
    const timer = setTimeout(() => addEventListener("pointerdown", down, true), 0);
    addEventListener("keydown", key, true);
    return () => {
      clearTimeout(timer);
      removeEventListener("pointerdown", down, true);
      removeEventListener("keydown", key, true);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      className="popv"
      role="dialog"
      aria-label={label}
      style={{ width, ...(pos ?? { left: -9999, top: 0 }), ...style }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.getElementById("overlays") ?? document.body,
  );
}

export type PickItem<T> = { value: T; label: ReactNode; text?: string; icon?: ReactNode; hint?: ReactNode; group?: string };

export function filterItems<T>(items: PickItem<T>[], query: string) {
  const needle = query.trim().toLowerCase();
  return needle ? items.filter((item) => (item.text ?? String(item.label)).toLowerCase().includes(needle)) : items;
}

/** Searchable list with arrow keys. A single choice closes on pick, multiple choice stays open. */
export function Picker<T>({ anchor, items, value, onPick, onClose, placeholder, multi, width = 240, search = true }: {
  anchor: Anchor; items: PickItem<T>[]; value?: T | T[]; onPick: (value: T) => void; onClose: () => void;
  placeholder?: string; multi?: boolean; width?: number; search?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => filterItems(items, query), [items, query]);
  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [cursor]);
  const has = (item: T) => (Array.isArray(value) ? value.includes(item) : value === item);
  const pick = (item: T) => {
    onPick(item);
    if (!multi) onClose();
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") setCursor((current) => Math.min(current + 1, shown.length - 1));
      else if (event.key === "ArrowUp") setCursor((current) => Math.max(current - 1, 0));
      else if (event.key === "Enter" && shown[cursor]) pick(shown[cursor].value);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  });
  const hint = placeholder ?? t("ui.search");
  return (
    <Popover anchor={anchor} onClose={onClose} width={width}>
      <div className="ppk">
        {search && (
          <label className="ppk-q">
            <Search />
            <input autoFocus aria-label={hint} value={query} placeholder={hint} onChange={(event) => setQuery(event.target.value)} />
          </label>
        )}
        <div className="ppk-l" ref={list} role="listbox">
          {shown.length === 0 && <div className="ppk-e">{t("ui.nothingFound")}</div>}
          {shown.map((item, index) => (
            <div key={index}>
              {item.group && item.group !== shown[index - 1]?.group && <div className="ppk-g">{item.group}</div>}
              <button
                type="button"
                role="option"
                aria-selected={has(item.value)}
                data-i={index}
                className={`ppk-i ${index === cursor ? "on" : ""}`}
                onMouseMove={() => cursor !== index && setCursor(index)}
                onClick={(event) => {
                  event.stopPropagation();
                  pick(item.value);
                }}
              >
                {item.icon}
                <span className="lb">{item.label}</span>
                {item.hint != null && <span className="hint">{item.hint}</span>}
                {has(item.value) && <Check className="ck" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Popover>
  );
}

/** A trigger plus a Picker. `trigger` receives an opener that takes the click event. */
export function Pick<T>({ trigger, ...props }: {
  trigger: (open: (event: MouseEvent | Anchor) => void) => ReactNode; items: PickItem<T>[]; value?: T | T[];
  onPick: (value: T) => void; placeholder?: string; multi?: boolean; width?: number; search?: boolean;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  return (
    <>
      {trigger((event) => {
        if ("currentTarget" in event) {
          event.stopPropagation();
          const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
          setAnchor({ left: box.left, right: box.right, top: box.top, bottom: box.bottom });
        } else setAnchor(event);
      })}
      {anchor && <Picker {...props} anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  );
}

/** Quiet confirmation with a real undo. Stays for `ms`, then calls onDone. */
export function UndoBar({ text, onUndo, onDone, ms = 6000 }: {
  text: ReactNode; onUndo?: () => void; onDone: () => void; ms?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, ms);
    return () => clearTimeout(timer);
  }, [onDone, ms, text]);
  return (
    <div className="undo" role="status">
      <span>{text}</span>
      {onUndo && (
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            onUndo();
            onDone();
          }}
        >
          {t("ui.undo")}
          <kbd>Z</kbd>
        </button>
      )}
      <i key={String(text)} style={{ animationDuration: `${ms}ms` }} />
    </div>
  );
}
