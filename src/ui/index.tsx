import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, Search } from "lucide-react";
import {
  useEffect, useId, useLayoutEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import { BRANDS } from "./brands";

export type Tone = "" | "ok" | "warn" | "bad" | "info" | "vio";

export const cx = (...names: (string | false | undefined | null)[]) => names.filter(Boolean).join(" ");

const overlayRoot = () => document.getElementById("overlays") ?? document.body;

export function Page({ children, flush, narrow, style }: {
  children: ReactNode; flush?: boolean; narrow?: boolean; style?: CSSProperties;
}) {
  return <div className={cx("page", flush && "flush", narrow && "narrow")} style={style}>{children}</div>;
}

export function PageHeader({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="ph">
      <div className="grow">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="acts">{children}</div>}
    </header>
  );
}

export function Section({ title, hint, children, actions }: {
  title: ReactNode; hint?: ReactNode; children?: ReactNode; actions?: ReactNode;
}) {
  return (
    <>
      <h2 className="sh">
        {title}
        {hint != null && <small>{hint}</small>}
        {actions && <div className="acts">{actions}</div>}
      </h2>
      {children}
    </>
  );
}

type BtnProps = {
  children?: ReactNode;
  onClick?: (event: MouseEvent) => void;
  variant?: "primary" | "accent" | "ghost" | "danger" | "";
  size?: "xs" | "sm" | "lg" | "";
  icon?: boolean;
  title?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
  kbd?: string;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
};

export function Btn({ children, onClick, variant = "", size = "", icon, kbd, type = "button", ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={cx("btn", variant, size, icon && "icon")}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  );
}

export type SegOption<T> = T | [T, ReactNode, ReactNode?];

export function Seg<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (value: T) => void; options: SegOption<T>[]; label?: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => {
        const [key, text, count] = Array.isArray(option) ? option : [option, option];
        return (
          <button
            type="button"
            key={key}
            className={key === value ? "on" : ""}
            aria-pressed={key === value}
            onClick={(event) => {
              event.stopPropagation();
              onChange(key);
            }}
          >
            {text}
            {count != null && <em>{count}</em>}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: {
  value: T; onChange: (value: T) => void; options: (T | [T, ReactNode])[];
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((option) => {
        const [key, text] = Array.isArray(option) ? option : [option, option];
        return (
          <button
            type="button"
            key={key}
            role="tab"
            aria-selected={key === value}
            className={key === value ? "on" : ""}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

export function Badge({ children, tone = "" }: { children: ReactNode; tone?: Tone }) {
  return <span className={cx("badge", tone)}>{children}</span>;
}

export function Dot({ tone = "" }: { tone?: Tone | "live" }) {
  return <i className={cx("dot", tone)} aria-hidden="true" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

export function Card({ children, pad, onClick, style, title, hint, actions, className }: {
  children?: ReactNode; pad?: boolean; onClick?: () => void; style?: CSSProperties;
  title?: ReactNode; hint?: ReactNode; actions?: ReactNode; className?: string;
}) {
  const head = title ? (
    <div className="ch">
      {title}
      {hint != null && <small>{hint}</small>}
      {actions && <div className="acts" onClick={(event) => event.stopPropagation()}>{actions}</div>}
    </div>
  ) : null;
  return onClick ? (
    <button type="button" className={cx("card click", pad && "pad", className)} onClick={onClick} style={style}>
      {head}
      {children}
    </button>
  ) : (
    <div className={cx("card", pad && "pad", className)} style={style}>
      {head}
      {children}
    </div>
  );
}

export function Row({ title, sub, lead, trail, onClick, dense, on, style, label }: {
  title: ReactNode; sub?: ReactNode; lead?: ReactNode; trail?: ReactNode; onClick?: () => void;
  dense?: boolean; on?: boolean; style?: CSSProperties; label?: string;
}) {
  const press = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.();
    }
  };
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={label}
      onKeyDown={onClick ? press : undefined}
      className={cx("row", dense && "dense", onClick && "click", on && "on")}
      onClick={onClick}
      style={style}
    >
      {lead}
      <span className="grow">
        <span className="tt">{title}</span>
        {sub && <span className="st">{sub}</span>}
      </span>
      {trail}
    </div>
  );
}

export function Stat({ label, value, delta, tone, spark, onClick }: {
  label: ReactNode; value: ReactNode; delta?: ReactNode; tone?: "up" | "down"; spark?: number[]; onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {delta && <div className={cx("d", tone)}>{delta}</div>}
      {spark && spark.length > 1 && <Spark data={spark} />}
    </>
  );
  return onClick ? (
    <button type="button" className="card click stat" onClick={onClick}>{inner}</button>
  ) : (
    <div className="card stat">{inner}</div>
  );
}

export function Field({ value, onChange, placeholder, icon, large, autoFocus, label, onEnter, type = "text" }: {
  value: string; onChange: (value: string) => void; placeholder?: string; icon?: ReactNode; large?: boolean;
  autoFocus?: boolean; label?: string; onEnter?: () => void; type?: string;
}) {
  return (
    <label className={cx("field", large && "lg")}>
      {icon}
      <input
        type={type}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter?.();
        }}
      />
    </label>
  );
}

export function SearchField(props: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <Field {...props} icon={<Search />} />;
}

export function Toggle({ on, onChange, label, disabled }: {
  on: boolean; onChange: (value: boolean) => void; label?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={cx("toggle", on && "on")}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!on);
      }}
    >
      <i />
    </button>
  );
}

export function CheckBox({ on, onChange, label }: { on: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      className={cx("check", on && "on")}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
    >
      <Check />
    </button>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return (
    <span
      className="av"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg,hsl(${hue} 60% 52%),hsl(${(hue + 40) % 360} 62% 42%))`,
      }}
    >
      {initials(name)}
    </span>
  );
}

/** Finds the brand mark for a connector or tool name such as `github` or `mcp:linear`. */
export function brandOf(name?: string): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  if (BRANDS[lower]) return lower;
  if (/gmail|google|drive|calendar/.test(lower)) return "google";
  if (/claude|anthropic/.test(lower)) return "claude";
  return Object.keys(BRANDS).find((brand) => lower.includes(brand));
}

export function ServiceIcon({ name, size = 20, fallback }: { name?: string; size?: number; fallback?: string }) {
  const brand = brandOf(name);
  const src = brand ? BRANDS[brand] : undefined;
  return src ? (
    <span className="svc" style={{ width: size, height: size }}>
      <img src={src} alt="" />
    </span>
  ) : (
    <span className="svc fb" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {(fallback ?? name ?? "?")[0]?.toUpperCase()}
    </span>
  );
}

export function Empty({ icon, title, sub, action }: {
  icon?: ReactNode; title: ReactNode; sub?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <b className="empty-t">{title}</b>
      {sub && <span className="empty-s">{sub}</span>}
      {action}
    </div>
  );
}

/** Placeholder rows while data loads, in the shape of the rows that follow. */
export function Skeleton({ count = 3, height = 52 }: { count?: number; height?: number }) {
  return (
    <div className="skel" role="status" aria-label={t("common.loading")}>
      {Array.from({ length: count }, (_, index) => (
        <i key={index} style={{ height }} />
      ))}
    </div>
  );
}

export function Failure({ error }: { error: Error | null | undefined }) {
  return error ? <p className="fail" role="alert">{error.message}</p> : null;
}

function scale(data: number[]) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  return { min, max, range: max - min || 1 };
}

export function sparkPoints(data: number[], width = 200, height = 40) {
  const { min, range } = scale(data);
  const last = Math.max(data.length - 1, 1);
  return data.map((value, index) => `${(index / last) * width},${height - ((value - min) / range) * height * 0.8 - 2}`).join(" ");
}

export function Spark({ data, height = 34, color = "var(--chart)" }: { data: number[]; height?: number; color?: string }) {
  const id = `s${useId().replace(/:/g, "")}`;
  const points = sparkPoints(data);
  return (
    <svg className="spark" viewBox="0 0 200 40" preserveAspectRatio="none" style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".26" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,40 ${points} 200,40`} fill={`url(#${id})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Smooth cubic path through points, with horizontal tangents at each point. */
export function smoothPath(points: [number, number][]) {
  if (points.length === 0) return "";
  const [first] = points;
  let path = `M${first![0]} ${first![1]}`;
  for (let index = 1; index < points.length; index++) {
    const [px, py] = points[index - 1]!;
    const [x, y] = points[index]!;
    const mid = (px + x) / 2;
    path += ` C${mid} ${py},${mid} ${y},${x} ${y}`;
  }
  return path;
}

export function AreaChart({ data, labels, height = 200, color = "var(--chart)", compare, format = String }: {
  data: number[]; labels?: string[]; height?: number; color?: string; compare?: number[]; format?: (value: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const id = `a${useId().replace(/:/g, "")}`;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  if (data.length === 0) return null;
  const all = [...data, ...(compare ?? [])];
  const min = Math.min(...all) * 0.92;
  const max = Math.max(...all) * 1.04;
  const inner = height - 20;
  const last = Math.max(data.length - 1, 1);
  const x = (index: number) => (index / last) * width;
  const y = (value: number) => 6 + (1 - (value - min) / (max - min || 1)) * (inner - 6);
  const line = smoothPath(data.map((value, index) => [x(index), y(value)]));
  return (
    <div
      ref={ref}
      style={{ position: "relative", height }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        setHover(Math.round(((event.clientX - box.left) / box.width) * last));
      }}
    >
      <svg width={width} height={height} style={{ display: "block" }} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((index) => (
          <line key={index} x1="0" x2={width} y1={6 + (index / 3) * (inner - 6)} y2={6 + (index / 3) * (inner - 6)} stroke="var(--line)" />
        ))}
        <path d={`${line} L${width} ${inner} L0 ${inner}Z`} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.75" />
        {compare && (
          <path
            d={smoothPath(compare.map((value, index) => [x(index), y(value)]))}
            fill="none"
            stroke="var(--ink4)"
            strokeWidth="1.25"
            strokeDasharray="4 4"
          />
        )}
        {hover != null && data[hover] != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1="0" y2={inner} stroke="var(--line2)" />
            <circle cx={x(hover)} cy={y(data[hover]!)} r="4" fill={color} stroke="var(--pop)" strokeWidth="2" />
          </>
        )}
        {labels?.map((label, index) => (
          <text
            key={index}
            x={(index / Math.max(labels.length - 1, 1)) * width}
            y={height - 4}
            fontSize="11"
            fill="var(--ink3)"
            textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}
          >
            {label}
          </text>
        ))}
      </svg>
      {hover != null && data[hover] != null && (
        <div className="chart-tip tn" style={{ left: Math.min(Math.max(0, x(hover) - 40), width - 90) }}>
          {format(data[hover]!)}
        </div>
      )}
    </div>
  );
}

export function Bars({ data, height = 44, color = "var(--chart)", highlight, labels }: {
  data: number[]; height?: number; color?: string; highlight?: number; labels?: string[];
}) {
  const max = Math.max(...data, 0);
  return (
    <div className="bars" style={{ height }}>
      {data.map((value, index) => (
        <i
          key={index}
          title={labels?.[index]}
          style={{
            height: `${max ? Math.max(4, (value / max) * 100) : 4}%`,
            background: color,
            opacity: highlight == null || highlight === index ? 1 : 0.42,
          }}
        />
      ))}
    </div>
  );
}

export function VirtualList<T>({ items, height, render, style }: {
  items: T[]; height: number; render: (item: T, index: number) => ReactNode; style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => ref.current,
    estimateSize: () => height,
    overscan: 8,
    initialRect: { width: 0, height: 600 },
  });
  return (
    <div ref={ref} style={{ overflowY: "auto", flex: 1, minHeight: 0, ...style }}>
      <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
        {virtual.getVirtualItems().map((item) => (
          <div
            key={item.key}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height, transform: `translateY(${item.start}px)` }}
          >
            {render(items[item.index]!, item.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export type MenuItem = { label: ReactNode; icon?: ReactNode; run: () => void; danger?: boolean } | "sep";

/** Places a menu below its trigger, or above it when the window ends first. */
export function menuPosition(trigger: DOMRect, menu: { width: number; height: number }, view: { width: number; height: number }) {
  const left = Math.max(8, Math.min(trigger.left, view.width - menu.width - 8));
  const below = trigger.bottom + 4;
  const top = below + menu.height > view.height - 8 ? Math.max(8, trigger.top - menu.height - 4) : below;
  return { left, top };
}

export function Menu({ trigger, items, label }: {
  trigger: (open: () => void, isOpen: boolean) => ReactNode; items: MenuItem[]; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !menu.current || !anchor.current) return;
    const box = menu.current.getBoundingClientRect();
    setPos(menuPosition(anchor.current.getBoundingClientRect(), box, { width: innerWidth, height: innerHeight }));
    menu.current.querySelector<HTMLElement>("button")?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const down = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) close();
    };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        anchor.current?.querySelector<HTMLElement>("button")?.focus();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const buttons = [...(menu.current?.querySelectorAll<HTMLElement>("button") ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }
    };
    addEventListener("pointerdown", down, true);
    addEventListener("keydown", key, true);
    addEventListener("scroll", close, true);
    addEventListener("resize", close);
    return () => {
      removeEventListener("pointerdown", down, true);
      removeEventListener("keydown", key, true);
      removeEventListener("scroll", close, true);
      removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <span ref={anchor} style={{ display: "inline-flex" }}>
      {trigger(() => {
        setPos(null);
        setOpen((value) => !value);
      }, open)}
      {open &&
        createPortal(
          <div
            ref={menu}
            className="menu"
            role="menu"
            aria-label={label}
            style={pos ?? { left: -9999, top: 0 }}
          >
            {items.map((item, index) =>
              item === "sep" ? (
                <hr key={index} />
              ) : (
                <button
                  type="button"
                  key={index}
                  role="menuitem"
                  className={item.danger ? "danger" : undefined}
                  onClick={() => {
                    setOpen(false);
                    item.run();
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ),
            )}
          </div>,
          overlayRoot(),
        )}
    </span>
  );
}

export function Modal({ title, sub, children, onClose, actions, wide }: {
  title: ReactNode; sub?: ReactNode; children?: ReactNode; onClose: () => void; actions?: ReactNode; wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    addEventListener("keydown", key, true);
    return () => {
      removeEventListener("keydown", key, true);
      previous?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="modalbg" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={box} className={cx("modal", wide && "wide")} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <h2>{title}</h2>
        {sub && <p className="modal-sub">{sub}</p>}
        <div className="modal-b">{children}</div>
        {actions && <div className="modal-a">{actions}</div>}
      </div>
    </div>,
    overlayRoot(),
  );
}

export function Confirm({ title, body, action, onConfirm, onClose }: {
  title: string; body?: string; action: string; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      sub={body}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {action}
          </Btn>
        </>
      }
    />
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.3 22h5.4l-1.1-13h-3.2z" fill="currentColor" />
      <path d="M12 2.5l3.2 3.2H8.8z" fill="currentColor" />
      <path d="M10 6.2h4v2.3h-4z" fill="var(--warn)" />
      <path d="M2 7.4h5M17 7.4h5" stroke="var(--warn)" strokeWidth="1.5" />
    </svg>
  );
}
