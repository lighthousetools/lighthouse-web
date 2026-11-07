import { language, t, tOr } from "./i18n";

const locale = () => (language() === "de" ? "de-DE" : "en-GB");

export function time(value?: string | null) {
  if (!value) return t("common.none");
  return new Date(value).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(value?: string | null) {
  if (!value) return t("common.none");
  return new Date(value).toLocaleString(locale(), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortDate(value: string) {
  return new Date(value).toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

export function weekday(value: string) {
  return new Date(value).toLocaleDateString(locale(), { weekday: "long" });
}

export function longDate(date: Date) {
  return date.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
}

export function euro(value: number) {
  return new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR" }).format(value);
}

/** Returns the ISO 8601 week. */
export function isoWeek(date: Date) {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const start = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - start) / 86_400_000 + 1) / 7);
}

/** Turns `morning-brief` or `send_draft` into `Morning brief` and `Send draft`. */
export function humanize(id: string) {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function agentName(id: string, names: Record<string, string> = {}) {
  if (id === "brain-ask") return t("agent.brainAsk");
  if (id === "agent-draft") return t("agent.draft");
  return names[id] ?? humanize(id);
}

/** Turns `mail.send_draft` into `Mail: Send draft`. */
export function toolName(tool: string) {
  const [connector, ...rest] = tool.split(".");
  if (rest.length === 0) return humanize(tool);
  return `${humanize(connector ?? "")}: ${humanize(rest.join("."))}`;
}

export function statusLabel(status: string) {
  return tOr(`status.${status}`, humanize(status));
}

export function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return t("today.morning");
  if (hour >= 12 && hour < 18) return t("today.afternoon");
  return t("today.evening");
}

/** Reduces the start of a Markdown text to one plain line. */
export function plainSnippet(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/^[#>\-*+\s]+/, ""))
    .filter((line) => line && !line.startsWith("|") && !line.startsWith("```"))
    .join(" ")
    .replace(/[*`]/g, "")
    .replace(/\[\[|\]\]/g, "");
}

/** 980, 12.4k, 1.2M: token counts at a glance. */
export function tokens(value: number) {
  const format = (n: number, unit: string) =>
    `${n.toLocaleString(locale(), { maximumFractionDigits: n < 10 ? 1 : 0 })}${unit}`;
  if (value < 1000) return String(value);
  if (value < 1_000_000) return format(value / 1000, "k");
  return format(value / 1_000_000, "M");
}

export function number(value: number) {
  return value.toLocaleString(locale());
}

export function weekdayShort(value: string | Date) {
  return new Date(value).toLocaleDateString(locale(), { weekday: "short" });
}

/** Today, yesterday, or the date, followed by the time. */
export function dayTime(value?: string | null, now = new Date()) {
  if (!value) return t("common.none");
  const date = new Date(value);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  const clock = time(value);
  if (days === 0) return t("time.today", { time: clock });
  if (days === 1) return t("time.yesterday", { time: clock });
  if (days === -1) return t("time.tomorrow", { time: clock });
  if (Math.abs(days) < 7) return `${weekdayShort(date)} ${clock}`;
  return dateTime(value);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
