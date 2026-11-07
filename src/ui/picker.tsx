import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import "./picker.css";

export type PickerOption = { id: string; label: ReactNode; sub?: ReactNode; lead?: ReactNode; search?: string };

/** A button that opens a searchable list. Arrow keys, Enter and Esc work, a click outside closes it. */
export function PickerButton({ value, items, onPick, placeholder, lead, width = 320, label }: {
  value?: string; items: PickerOption[]; onPick: (id: string) => void; placeholder?: string; lead?: ReactNode;
  width?: number; label?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useMemo(() => {
    const needle = query.toLowerCase();
    return items.filter((item) =>
      !needle || `${item.search ?? ""} ${typeof item.label === "string" ? item.label : ""}`.toLowerCase().includes(needle),
    );
  }, [query, items]);
  const current = items.find((item) => item.id === value);
  const open = () => {
    const box = button.current!.getBoundingClientRect();
    const up = box.bottom + 320 > innerHeight;
    setPos({ x: Math.min(box.left, innerWidth - width - 12), y: up ? innerHeight - box.top + 4 : box.bottom + 4, up });
    setQuery("");
    setCursor(0);
  };
  const pick = (id: string) => {
    onPick(id);
    setPos(null);
    button.current?.focus();
  };
  useEffect(() => {
    if (!pos) return;
    const close = (event: MouseEvent) => {
      if (!pop.current?.contains(event.target as Node)) setPos(null);
    };
    const timer = setTimeout(() => addEventListener("click", close), 0);
    return () => {
      clearTimeout(timer);
      removeEventListener("click", close);
    };
  }, [pos]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="pk"
        aria-haspopup="listbox"
        aria-expanded={!!pos}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          if (pos) setPos(null);
          else open();
        }}
      >
        {current?.lead ?? lead}
        <span className="clip">{current ? current.label : <span className="faint">{placeholder ?? t("ui.choose")}</span>}</span>
        <ChevronDown size={12} className="faint" />
      </button>
      {pos &&
        createPortal(
          <div
            ref={pop}
            className="pkp"
            role="listbox"
            style={{ left: pos.x, width, ...(pos.up ? { bottom: pos.y } : { top: pos.y }) }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor(Math.min(list.length - 1, cursor + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor(Math.max(0, cursor - 1));
              }
              if (event.key === "Enter" && list[cursor]) {
                event.preventDefault();
                pick(list[cursor].id);
              }
              if (event.key === "Escape") {
                event.stopPropagation();
                setPos(null);
                button.current?.focus();
              }
            }}
          >
            <label className="pks">
              <Search size={13} className="faint" />
              <input
                autoFocus
                aria-label={t("ui.search")}
                placeholder={t("ui.search")}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                }}
              />
            </label>
            <div className="pkl">
              {list.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  role="option"
                  aria-selected={item.id === value}
                  className={index === cursor ? "on" : ""}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => pick(item.id)}
                >
                  {item.lead}
                  <span className="grow">
                    <span className="clip tt">{item.label}</span>
                    {item.sub && <span className="clip z-st">{item.sub}</span>}
                  </span>
                  {item.id === value && <Check size={13} />}
                </button>
              ))}
              {list.length === 0 && <div className="pke">{t("ui.nothingFound")}</div>}
            </div>
          </div>,
          document.getElementById("overlays") ?? document.body,
        )}
    </>
  );
}
