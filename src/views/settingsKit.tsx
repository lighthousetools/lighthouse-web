import type { ReactNode } from "react";
import { t } from "../i18n";
import { toast } from "../shell/state";

/** A titled card of settings rows. */
export function Group({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="st-g">
      <div className="st-gh">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      <div className="card">{children}</div>
    </section>
  );
}

export function SettingRow({ title, sub, children, icon }: { title: ReactNode; sub?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="st-row">
      {icon}
      <div className="grow">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </div>
      {children}
    </div>
  );
}

/** A note for members on what only owners and admins change. */
export function ReadOnly({ children }: { children: ReactNode }) {
  return <p className="st-ro" role="note">{children}</p>;
}

export async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast(t("settings.copied"));
  } catch {
    toast(t("settings.copyFailed"), "bad");
  }
}
