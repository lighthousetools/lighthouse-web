import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import type { components } from "../api/schema";
import { t, type Key } from "../i18n";
import { openExternal } from "../shell/bridge";
import { Badge, Btn, SearchField, ServiceIcon } from "../ui";

export type PresetConnector = components["schemas"]["PresetConnector"];

/** How many tiles show at once. Searching narrows the rest down. */
const SHOWN = 48;

/** Services many people use at home and at work. They come first when nothing is searched. */
const POPULAR = [
  "google-gmail", "google-drive", "google-calendar", "google-docs", "google-sheets", "microsoft-work-iq", "slack", "notion",
  "zoom", "dropbox", "atlassian-rovo", "asana", "monday", "clickup", "trello", "airtable", "figma", "canva", "miro",
  "hubspot", "salesforce", "pipedrive", "stripe", "paypal", "shopify", "zendesk", "intercom", "zapier", "pipedream",
  "make", "calendly", "docusign", "box", "todoist", "evernote", "linear", "github", "gitlab", "vercel", "cloudflare",
  "sentry", "supabase", "webflow", "wix",
];

/** Popular services first in their listed order, then everything else by name. */
export function rank(preset: PresetConnector) {
  const index = POPULAR.indexOf(preset.id);
  return index === -1 ? POPULAR.length : index;
}

/** How connecting works, in the words of the badge. */
export function setupOf(preset: PresetConnector): "oneClick" | "ownApp" | "token" | "open" {
  if (preset.auth === "oauth") return preset.registration === "preregistered" ? "ownApp" : "oneClick";
  if (preset.auth === "bearer") return "token";
  return "open";
}

const SETUP_TONE = { oneClick: "ok", ownApp: "warn", token: "", open: "info" } as const;

function categoryLabel(category: string) {
  return t(`catalog.category.${category}` as Key);
}

/** Matches every word of the query against name, vendor and group. */
export function matches(preset: PresetConnector, query: string) {
  const haystack = [preset.label, preset.vendor, preset.id, preset.category && categoryLabel(preset.category)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** The catalog of ready connectors: search, groups and one tile per server. */
export function ConnectorCatalog({ presets, selected, onPick }: { presets: PresetConnector[]; selected?: string; onPick: (preset: PresetConnector) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const preset of presets) if (preset.category) counts.set(preset.category, (counts.get(preset.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [presets]);
  const found = useMemo(
    () =>
      presets
        .filter((preset) => (!category || preset.category === category) && matches(preset, query))
        .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)),
    [presets, category, query],
  );
  const picked = presets.find((preset) => preset.id === selected);
  return (
    <div className="cat">
      <SearchField value={query} onChange={setQuery} placeholder={t("catalog.search", { count: presets.length })} />
      <div className="cat-groups" role="tablist" aria-label={t("catalog.groups")}>
        <button type="button" role="tab" aria-selected={!category} className={!category ? "on" : ""} onClick={() => setCategory(null)}>
          {t("catalog.all")} <span>{presets.length}</span>
        </button>
        {categories.map(([name, count]) => (
          <button key={name} type="button" role="tab" aria-selected={category === name} className={category === name ? "on" : ""} onClick={() => setCategory(category === name ? null : name)}>
            {categoryLabel(name)} <span>{count}</span>
          </button>
        ))}
      </div>
      <div className="cat-grid">
        {found.slice(0, SHOWN).map((preset) => {
          const setup = setupOf(preset);
          return (
            <button key={preset.id} type="button" className={`cat-tile ${preset.id === selected ? "on" : ""}`} aria-pressed={preset.id === selected} onClick={() => onPick(preset)}>
              <ServiceIcon name={preset.id} fallback={preset.label} size={28} />
              <span className="cat-name">
                <b>{preset.label}</b>
                <small>{preset.category ? categoryLabel(preset.category) : preset.vendor}</small>
              </span>
              <Badge tone={SETUP_TONE[setup]}>{t(`catalog.setup.${setup}`)}</Badge>
            </button>
          );
        })}
      </div>
      {found.length === 0 && <p className="faint">{t("catalog.none")}</p>}
      {found.length > SHOWN && <p className="faint">{t("catalog.more", { count: found.length - SHOWN })}</p>}
      {picked && <CatalogNote preset={picked} />}
    </div>
  );
}

/** What to know about the chosen server before connecting. */
function CatalogNote({ preset }: { preset: PresetConnector }) {
  const setup = setupOf(preset);
  const lines = [
    t(`catalog.explain.${setup}`),
    preset.url.includes("{") ? t("catalog.template") : null,
    preset.note,
  ].filter(Boolean);
  return (
    <div className="cat-note">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <div className="cat-links">
        {preset.docs && (
          <Btn size="sm" onClick={() => openExternal(preset.docs!)}>
            <ExternalLink />
            {t("catalog.docs")}
          </Btn>
        )}
        {preset.key_url && (
          <Btn size="sm" onClick={() => openExternal(preset.key_url!)}>
            <ExternalLink />
            {t("catalog.keyUrl")}
          </Btn>
        )}
      </div>
    </div>
  );
}
