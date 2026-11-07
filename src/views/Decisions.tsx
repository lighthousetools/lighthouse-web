import { tOr } from "../i18n";

type Field = { key: string; label: string; value: string };

/** Reads like the thing it describes, so a mail starts with its recipient. */
const FIELD_ORDER = [
  "from", "to", "cc", "bcc", "channel", "subject", "title", "command", "path", "file_path", "url",
  "query", "message", "description", "comment", "body", "text", "content",
];

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(", ");
  return JSON.stringify(value);
}

/** Lists tool arguments as labeled text. Names we don't know keep their own. */
export function plainFields(input: unknown): Field[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input === null || input === undefined ? [] : [{ key: "value", label: "", value: asText(input) }];
  }
  const rank = (key: string) => {
    const index = FIELD_ORDER.indexOf(key);
    return index === -1 ? FIELD_ORDER.length : index;
  };
  return Object.entries(input)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([key, value]) => ({
      key,
      label: tOr(`field.${key}`, key.replace(/[-_]+/g, " ")),
      value: asText(value),
    }));
}
