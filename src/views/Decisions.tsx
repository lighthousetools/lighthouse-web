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
/** Ids such as `thread_id` or `issueId` mean nothing to a person; they stay in the technical details. */
export const isInternalKey = (key: string) => /^(id|uuid)$|(_id|Id|_uuid)$/.test(key);

/** `due_date` and `dueDate` as "Due date", for keys without a translation. */
export function humanizeKey(key: string) {
  const words = key.replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function plainFields(input: unknown): Field[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input === null || input === undefined ? [] : [{ key: "value", label: "", value: asText(input) }];
  }
  const rank = (key: string) => {
    const index = FIELD_ORDER.indexOf(key);
    return index === -1 ? FIELD_ORDER.length : index;
  };
  return Object.entries(input)
    .filter(([key, value]) => value !== null && value !== undefined && value !== "" && !isInternalKey(key))
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([key, value]) => ({
      key,
      label: tOr(`field.${key}`, humanizeKey(key)),
      value: asText(value),
    }));
}
