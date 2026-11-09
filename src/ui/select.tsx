import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Menu } from ".";
import "./pick.css";

/** Compact select built on the kit menu. Options are [value, label] pairs. */
export function Select<T extends string>({ value, onChange, options, label, width, lead, size }: {
  value: T; onChange: (value: T) => void; options: readonly (readonly [T, ReactNode])[];
  label?: string; width?: number; lead?: ReactNode; size?: "sm";
}) {
  const current = options.find(([key]) => key === value);
  return (
    <Menu
      label={label}
      width={width}
      trigger={(open, isOpen) => (
        <button
          type="button"
          className={`pick ${size ?? ""}`}
          style={{ width }}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={open}
        >
          {lead}
          <span className="grow clip">{current?.[1] ?? value}</span>
          <ChevronDown size={14} className="faint" />
        </button>
      )}
      items={options.map(([key, text]) => ({
        label: (
          <>
            <span className="grow clip">{text}</span>
            {key === value && <Check size={14} />}
          </>
        ),
        run: () => onChange(key),
      }))}
    />
  );
}
