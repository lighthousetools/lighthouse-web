import { useMutation, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, must } from "../api/client";
import { sessionKey, useAgents, useAutomations, useSessions, useTasks } from "../data";
import { t } from "../i18n";
import { VIEWS, go } from "../router";
import { Kbd, Row, ServiceIcon } from "../ui";
import { setLook } from "./look";
import { visibleNav } from "./nav";
import { useDomains, viewOfDomain } from "../views/connected";
import { palette } from "./state";

type Hit = { id: string; group: string; label: string; icon?: ReactNode; run: () => void };

export function Palette() {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const query = text.trim();
  const close = () => palette.set(false);
  const agents = useAgents();
  const sessions = useSessions();
  const domains = useDomains();
  const connected = useQuery({
    queryKey: ["connected", "palette", query],
    enabled: query.length > 1 && domains.size > 0,
    queryFn: () => must(api.GET("/connected/search", { params: { query: { q: query, limit: 8 } } })),
  });
  const tasks = useTasks("all");
  const automations = useAutomations();
  const newNote = useMutation({
    mutationFn: () => must(api.POST("/brain/entries", { body: { type: "note", title: t("brain.untitled"), body: "" } })),
    onSuccess: (entry) => go("brain", entry.id),
  });
  const found = useQuery({
    queryKey: ["brain", "palette", query],
    enabled: query.length > 1,
    queryFn: () => must(api.GET("/brain/search", { params: { query: { q: query, limit: 6 } } })),
  });
  const items = useMemo<Hit[]>(() => {
    const views = visibleNav(domains).flatMap((group) => group.items).sort((a, b) => VIEWS.indexOf(a.view) - VIEWS.indexOf(b.view));
    const all: Hit[] = [
      ...views.map((item) => ({ id: `view:${item.view}`, group: t("palette.views"), label: t(item.label), icon: <item.icon size={16} className="faint" />, run: () => go(item.view) })),
      { id: "new-note", group: t("palette.actions"), label: t("brain.newNote"), run: () => newNote.mutate() },
      { id: "new-agent", group: t("palette.actions"), label: t("agents.new"), run: () => go("agents", "new") },
      { id: "new-task", group: t("palette.actions"), label: t("tasks.new"), run: () => go("tasks") },
      { id: "new-automation", group: t("palette.actions"), label: t("automations.new"), run: () => go("automations", "new") },
      { id: "new-rule", group: t("palette.actions"), label: t("rules.new"), run: () => go("rules") },
      { id: "look-glass", group: t("palette.actions"), label: t("palette.lookGlass"), run: () => setLook("glass") },
      { id: "look-light", group: t("palette.actions"), label: t("palette.lookLight"), run: () => setLook("light") },
      { id: "look-system", group: t("palette.actions"), label: t("palette.lookSystem"), run: () => setLook("system") },
      ...(agents.data ?? []).map((agent) => ({ id: `agent:${agent.id}`, group: t("nav.agents"), label: agent.name, run: () => go("agents", agent.id) })),
      ...(tasks.data ?? []).filter((task) => task.status === "open").map((task) => ({ id: `task:${task.id}`, group: t("nav.tasks"), label: task.title, run: () => go("tasks", task.id) })),
      ...(automations.data ?? []).map((item) => ({ id: `automation:${item.id}`, group: t("nav.automations"), label: item.name, run: () => go("automations", item.id) })),
      ...(sessions.data ?? []).map((session) => ({
        id: `session:${sessionKey(session)}`,
        group: t("nav.sessions"),
        label: `${session.project}${session.branch ? ` · ${session.branch}` : ""}`,
        icon: <ServiceIcon name="claude" size={18} />,
        run: () => go("sessions", sessionKey(session)),
      })),
    ];
    const needle = query.toLowerCase();
    const matched = needle ? all.filter((item) => item.label.toLowerCase().includes(needle)) : all.slice(0, 14);
    for (const item of connected.data?.items ?? []) {
      matched.push({
        id: `item:${item.id}`,
        group: t(`connected.domain.${item.domain as "mail"}`),
        label: item.title ?? item.external_id,
        icon: <ServiceIcon name={item.source} size={18} />,
        run: () => go(viewOfDomain(item.domain), item.parent_id && item.kind === "message" ? item.parent_id : item.id),
      });
    }
    for (const hit of found.data ?? []) {
      matched.push({ id: `entry:${hit.entry.id}`, group: t("palette.entries"), label: hit.entry.title, run: () => go("brain", hit.entry.id) });
    }
    return matched.slice(0, 50);
  }, [query, agents.data, sessions.data, tasks.data, automations.data, found.data, connected.data, domains]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setActive(0), [query]);
  const selected = Math.min(active, Math.max(items.length - 1, 0));
  const run = (hit?: Hit) => {
    if (!hit) return;
    close();
    hit.run();
  };
  return (
    <div className="palbg" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="pal" role="dialog" aria-modal="true" aria-label={t("palette.label")}>
        <div className="q">
          <Search size={16} className="faint" />
          <input
            autoFocus
            value={text}
            aria-label={t("palette.label")}
            placeholder={t("palette.placeholder")}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") setActive(Math.min(selected + 1, items.length - 1));
              else if (event.key === "ArrowUp") setActive(Math.max(selected - 1, 0));
              else if (event.key === "Enter") run(items[selected]);
              else if (event.key === "Escape") close();
              else return;
              event.preventDefault();
            }}
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="res" role="listbox">
          {items.map((item, index) => (
            <div key={item.id} role="option" aria-selected={index === selected} onMouseMove={() => index !== selected && setActive(index)}>
              {(index === 0 || items[index - 1]!.group !== item.group) && <div className="gh">{item.group}</div>}
              <Row dense on={index === selected} title={item.label} lead={item.icon} onClick={() => run(item)} />
            </div>
          ))}
          {!items.length && <p className="none">{t("palette.empty")}</p>}
        </div>
        <div className="ft">
          <span><Kbd>↑↓</Kbd> {t("palette.choose")}</span>
          <span><Kbd>↵</Kbd> {t("palette.open")}</span>
          <span className="grow" />
          <span>{t("palette.hint")}</span>
        </div>
      </div>
    </div>
  );
}
