import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, must } from "./api/client";
import { t, type Key } from "./i18n";
import { VIEWS, go } from "./router";
import { Dialog } from "./ui";

type Item = { id: string; group: string; label: string; run: () => void };

export function Palette({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const query = text.trim();
  const newNote = useMutation({
    mutationFn: () =>
      must(api.POST("/brain/entries", { body: { type: "note", title: t("brain.untitled"), body: "" } })),
    onSuccess: (entry) => go("brain", entry.id),
  });
  const hits = useQuery({
    queryKey: ["brain", "palette", query],
    enabled: query.length > 1,
    queryFn: () => must(api.GET("/brain/search", { params: { query: { q: query, limit: 6 } } })),
  });
  const close = (run: () => void) => () => {
    run();
    onClose();
  };
  const matches = (label: string) => label.toLowerCase().includes(query.toLowerCase());
  const items: Item[] = [
    ...VIEWS.map((view) => ({
      id: view,
      group: t("palette.views"),
      label: t(`nav.${view}` as Key),
      run: close(() => go(view)),
    })),
    {
      id: "new-note",
      group: t("palette.actions"),
      label: t("brain.newNote"),
      run: close(() => newNote.mutate()),
    },
  ].filter((item) => matches(item.label));
  for (const hit of hits.data ?? []) {
    items.push({
      id: hit.entry.id,
      group: t("palette.entries"),
      label: hit.entry.title,
      run: close(() => go("brain", hit.entry.id)),
    });
  }
  const selected = Math.min(active, Math.max(items.length - 1, 0));
  const press = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") setActive(Math.min(selected + 1, items.length - 1));
    else if (event.key === "ArrowUp") setActive(Math.max(selected - 1, 0));
    else if (event.key === "Enter") items[selected]?.run();
    else return;
    event.preventDefault();
  };
  return (
    <Dialog label={t("palette.label")} onClose={onClose}>
      <input
        className="palette-input"
        aria-label={t("palette.label")}
        placeholder={t("palette.placeholder")}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
        }}
        onKeyDown={press}
      />
      <div className="palette-list" role="listbox">
        {items.length === 0 && <div className="palette-foot">{t("palette.empty")}</div>}
        {items.map((item, index) => (
          <div key={item.id}>
            {item.group !== items[index - 1]?.group && (
              <div className="palette-group">{item.group}</div>
            )}
            <button
              className="palette-item"
              role="option"
              aria-selected={index === selected}
              data-active={index === selected}
              onMouseEnter={() => setActive(index)}
              onClick={item.run}
            >
              {item.label}
            </button>
          </div>
        ))}
      </div>
      <div className="palette-foot">{t("palette.hint")}</div>
    </Dialog>
  );
}
