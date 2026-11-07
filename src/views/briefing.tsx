import { ArrowRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { t } from "../i18n";
import { ServiceIcon } from "../ui";
import "./briefing.css";

const DAY = 86_400_000;
const isoDay = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** Costs per day for the last `days` days, oldest first, with zero for quiet days. */
export function costsByDay(costs: { day: string; cost_eur: number }[], days: number, today = new Date()) {
  return Array.from({ length: days }, (_, index) => {
    const day = isoDay(new Date(today.getTime() - (days - 1 - index) * DAY));
    return { day, cost: costs.filter((cost) => cost.day === day).reduce((sum, cost) => sum + cost.cost_eur, 0) };
  });
}

export const todayIso = () => isoDay(new Date());

export type Link = { svc?: string; label: string; fallback?: string; run: () => void };

export function Thesis({ kicker, title, lead, children, side }: {
  kicker: ReactNode; title: ReactNode; lead: ReactNode; children?: ReactNode; side?: ReactNode;
}) {
  return (
    <header className="bf-top">
      <div className="bf-th">
        <div className="kick">{kicker}</div>
        <h1>{title}</h1>
        <p>{lead}</p>
        {children && <div className="acts">{children}</div>}
      </div>
      {side}
    </header>
  );
}

/** A big number with bars below it, such as costs per day. The highlighted bar is today. */
export function Gauge({ big, label, bars, foot, onClick, hot, tip, title }: {
  big: ReactNode; label: ReactNode; bars: number[]; foot: ReactNode; onClick: () => void;
  hot?: number; tip?: (index: number) => string; title: string;
}) {
  const max = Math.max(...bars, 0);
  return (
    <button type="button" className="bf-g" onClick={onClick} aria-label={title}>
      <div className="gh">
        <b className="tn">{big}</b>
        <span>{label}</span>
      </div>
      <div className="gb">
        {bars.map((value, index) => (
          <i key={index} title={tip?.(index)} className={index === hot ? "on" : ""} style={{ height: `${max ? Math.max(6, (value / max) * 100) : 6}%` }} />
        ))}
      </div>
      <div className="gf">{foot}</div>
    </button>
  );
}

export function Linked({ label, children, chain = [], onClick, action }: {
  label: ReactNode; children: ReactNode; chain?: Link[]; onClick?: () => void; action?: ReactNode;
}) {
  return (
    <div
      className={`bf-l ${onClick ? "" : "static"}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && event.key === "Enter" && event.target === event.currentTarget) onClick();
      }}
    >
      <div className="lh">{label}</div>
      {children}
      {(chain.length > 0 || action) && (
        <div className="chain">
          {chain.map((link, index) => (
            <Fragment key={link.label}>
              {index > 0 && <ArrowRight size={14} className="arw" />}
              <Src {...link} />
            </Fragment>
          ))}
          <span className="grow" />
          {action}
        </div>
      )}
    </div>
  );
}

export function Src({ svc, label, run, fallback }: Link) {
  return (
    <button
      type="button"
      className="srcc"
      onClick={(event) => {
        event.stopPropagation();
        run();
      }}
    >
      <ServiceIcon name={svc} size={16} fallback={fallback ?? label} />
      {label}
    </button>
  );
}

export function Sec({ title, hint, children, label }: { title: ReactNode; hint?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section className="bf-s" aria-label={label}>
      <h2 className="sh2">
        {title}
        {hint != null && <small>{hint}</small>}
      </h2>
      {children}
    </section>
  );
}

export const linkedLabel = () => t("briefing.linked");
