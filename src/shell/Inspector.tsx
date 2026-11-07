import { ArrowLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../i18n";
import { Btn, ServiceIcon } from "../ui";
import { closeInspector, inspector, inspectorBack } from "./state";

/** The right-hand panel. Views open it with `inspect(key, <Something />)`. */
export function Inspector() {
  const stack = inspector.use();
  const top = stack[stack.length - 1];
  return top ? <div key={top.key} style={{ display: "contents" }}>{top.node}</div> : null;
}

export function InspectorPanel({ kind, icon, title, facts = [], children, actions, wide }: {
  kind: ReactNode; icon?: ReactNode; title: ReactNode; facts?: [ReactNode, ReactNode][];
  children?: ReactNode; actions?: ReactNode; wide?: boolean;
}) {
  const depth = inspector.use().length;
  return (
    <aside className={`insp ${wide ? "wide" : ""}`} aria-label={t("inspector.label")}>
      <div className="ih">
        <div className="top">
          {depth > 1 && (
            <Btn icon size="xs" variant="ghost" aria-label={t("common.back")} onClick={inspectorBack}>
              <ArrowLeft />
            </Btn>
          )}
          {icon ?? <ServiceIcon name="lighthouse" fallback="L" size={16} />}
          <span className="grow clip">{kind}</span>
          <Btn icon size="xs" variant="ghost" aria-label={t("common.close")} onClick={closeInspector}>
            <X />
          </Btn>
        </div>
        <h2>{title}</h2>
      </div>
      <div className="ib">
        {facts.length > 0 && (
          <dl className="facts">
            {facts.map(([label, value], index) => (
              <div key={index} style={{ display: "contents" }}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {children && <div style={{ marginTop: facts.length ? 16 : 0 }}>{children}</div>}
      </div>
      {actions && <div className="ia">{actions}</div>}
    </aside>
  );
}
