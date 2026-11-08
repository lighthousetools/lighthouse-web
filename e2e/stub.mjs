// A generic stand-in for the Lighthouse API: answers every operation in openapi.json with sample data built from its
// schema. The data is made up ("Acme", "Jane Doe") and only has to be plausible enough to render every page.
import { readFileSync } from "node:fs";

const spec = JSON.parse(readFileSync(new URL("../openapi.json", import.meta.url), "utf8"));
const schemas = spec.components?.schemas ?? {};
const now = Date.now();

const WORDS = ["Acme", "Globex", "Initech", "Umbrella", "Contoso", "Northwind"];
const PEOPLE = ["Jane Doe", "John Smith", "Alex Example"];

function resolve(schema) {
  let current = schema;
  while (current?.$ref) current = schemas[current.$ref.split("/").pop()];
  return current ?? {};
}

function uuid(seed) {
  const hex = (seed * 2654435761 >>> 0).toString(16).padStart(8, "0");
  return `${hex}-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function text(name, index) {
  const key = name.toLowerCase();
  if (key === "id" || key.endsWith("_id")) return key === "id" ? uuid(index + 1) : uuid(index + 101);
  if (key.includes("email")) return `jane${index}@example.com`;
  if (key.includes("url") || key === "href" || key === "link") return `https://example.com/${index}`;
  if (key === "color") return ["#5B9AFF", "#2fb380", "#e0a03a"][index % 3];
  if (key === "time") return ["08:00", "10:00", "12:00"][index % 3];
  if (key === "currency") return "EUR";
  if (key === "timezone" || key === "time_zone") return "Europe/Berlin";
  if (key === "language") return "en";
  if (key === "kind" || key === "type") return ["note", "task", "document"][index % 3];
  if (key === "source" && index >= 0) return "";
  if (key === "schedule" || key === "cron") return "0 7 * * 1-5";
  if (key === "author" || key === "owner" || key === "assignee" || key.endsWith("name") && key.includes("person")) return PEOPLE[index % PEOPLE.length];
  if (key === "name" || key === "title" || key === "subject" || key === "label") return `${WORDS[index % WORDS.length]} ${name} ${index + 1}`;
  if (key === "body" || key === "markdown" || key === "content" || key === "report" || key === "summary" || key === "text") {
    return `# ${WORDS[index % WORDS.length]} update\n\nA short paragraph about the week.\n\n- First point\n- Second point\n\n---\n\n# Next step\n\nNote: Keep it short.`;
  }
  if (key === "status" || key === "state") return "active";
  if (key === "severity" || key === "level") return ["info", "warning", "critical"][index % 3];
  return `${name} ${index + 1}`;
}

/** Sample data for a schema. `name` is the property name, which picks plausible strings. */
export function sample(schema, name = "value", index = 0, depth = 0) {
  const resolved = resolve(schema);
  if (depth > 7) return null;
  if (resolved.allOf) return Object.assign({}, ...resolved.allOf.map((part) => sample(part, name, index, depth + 1)));
  const options = resolved.oneOf ?? resolved.anyOf;
  if (options) {
    const pick = options.find((option) => resolve(option).type !== "null") ?? options[0];
    return sample(pick, name, index, depth + 1);
  }
  if (resolved.enum) return resolved.enum[index % resolved.enum.length];
  const types = Array.isArray(resolved.type) ? resolved.type.filter((type) => type !== "null") : [resolved.type];
  const type = types[0] ?? (resolved.properties ? "object" : undefined);
  switch (type) {
    case "object": {
      const out = {};
      for (const [key, value] of Object.entries(resolved.properties ?? {})) out[key] = sample(value, key, index, depth + 1);
      return out;
    }
    case "array": {
      const count = depth > 3 ? 1 : 3;
      return Array.from({ length: count }, (_, at) => sample(resolved.items ?? {}, name.replace(/s$/, ""), at, depth + 1));
    }
    case "integer":
      return /year/.test(name) ? 2026 : /weekday/.test(name) ? (index % 5) + 1 : 3 + index * 7;
    case "number":
      return /share|ratio|progress|probability/.test(name) ? 0.4 : 1200 + index * 340.5;
    case "boolean":
      return /ok|enabled|editable|active|connected/.test(name);
    case "string":
      if (resolved.format === "date-time") return new Date(now - (index + 1) * 3_600_000 * 7).toISOString();
      if (resolved.format === "date") return new Date(now + index * 86_400_000).toISOString().slice(0, 10);
      if (resolved.format === "uuid") return uuid(index + 1);
      return text(name, index);
    default:
      // A schema without a type means any JSON; servers send an object there.
      return depth === 0 || /detail|data|metrics|raw|payload|meta/.test(name) ? {} : null;
  }
}

const routes = Object.entries(spec.paths).flatMap(([path, operations]) =>
  Object.entries(operations).map(([method, operation]) => ({
    method: method.toUpperCase(),
    path,
    pattern: new RegExp(`^${path.replace(/\{[^}]+\}/g, "[^/]+")}$`),
    operation,
  })),
);

/** The answer for a request, or null when the path is not part of the API. */
export function answer(method, pathname) {
  const route =
    routes.find((item) => item.method === method && item.pattern.test(pathname)) ??
    routes.find((item) => item.pattern.test(pathname));
  if (!route) return null;
  if (pathname === "/events") return { status: 200, contentType: "text/event-stream", body: ": stub\n\n" };
  if (pathname === "/auth/status") return { status: 200, json: { setup_required: false, signup: "open", email_required: false } };
  if (/\/original$/.test(pathname)) return { status: 404, body: "" };
  const [code, response] = Object.entries(route.operation.responses ?? {}).find(([status]) => status.startsWith("2")) ?? ["200", {}];
  const content = response.content ?? {};
  if (content["application/json"]?.schema) return { status: Number(code), json: sample(content["application/json"].schema, "value") };
  const textType = Object.keys(content)[0];
  if (textType) return { status: Number(code), contentType: textType, body: textType.includes("html") ? "<h1>Export</h1>" : "# Export\n" };
  return { status: Number(code) === 204 ? 204 : Number(code), body: "" };
}

export const operationCount = routes.length;
