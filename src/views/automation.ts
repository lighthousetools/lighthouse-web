import { parseDocument, stringify } from "yaml";

// The automation file format: Markdown with YAML frontmatter, as described in the server's docs/automations.md.

export type Trigger =
  | { kind: "cron"; cron: string }
  | { kind: "event"; event: string; match: Record<string, string> }
  | { kind: "webhook"; match: Record<string, string> }
  | { kind: "manual" };

export type Step =
  | { kind: "agent"; agent: string }
  | { kind: "tool"; name: string; input: Record<string, unknown> }
  | { kind: "notify"; to: string; subject: string; message: string }
  | { kind: "if"; test: "contains" | "not_contains" | "status"; value: string; then?: Step[]; else?: Step[] };

/** Where a step sits: indexes, with `then` or `else` to step into a branch, such as `[1, "then", 0]`. */
export type StepPath = (number | "then" | "else")[];

export type Automation = { name: string; id?: string; enabled?: boolean; trigger: Trigger; steps: Step[]; description: string };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function strings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry)]));
}

function readTrigger(value: unknown): Trigger {
  const trigger = (value ?? {}) as Record<string, unknown>;
  if (typeof trigger.cron === "string") return { kind: "cron", cron: trigger.cron };
  if (typeof trigger.event === "string") return { kind: "event", event: trigger.event, match: strings(trigger.match) };
  if (trigger.webhook) return { kind: "webhook", match: strings(trigger.match) };
  return { kind: "manual" };
}

function readStep(value: unknown): Step {
  const step = (value ?? {}) as Record<string, unknown>;
  if (typeof step.agent === "string") return { kind: "agent", agent: step.agent };
  if (step.tool && typeof step.tool === "object") {
    const tool = step.tool as Record<string, unknown>;
    return { kind: "tool", name: String(tool.name ?? ""), input: (tool.input as Record<string, unknown>) ?? {} };
  }
  if (step.notify && typeof step.notify === "object") {
    const notify = step.notify as Record<string, unknown>;
    return { kind: "notify", to: String(notify.to ?? "owner"), subject: String(notify.subject ?? ""), message: String(notify.message ?? "") };
  }
  const condition = (step.if ?? {}) as Record<string, unknown>;
  const branches = Array.isArray(condition.then) || Array.isArray(condition.else)
    ? { then: Array.isArray(condition.then) ? condition.then.map(readStep) : [], else: Array.isArray(condition.else) ? condition.else.map(readStep) : [] }
    : {};
  if ("not_contains" in condition) return { kind: "if", test: "not_contains", value: String(condition.not_contains), ...branches };
  if ("status" in condition) return { kind: "if", test: "status", value: String(condition.status), ...branches };
  return { kind: "if", test: "contains", value: String(condition.contains ?? ""), ...branches };
}

/** Reads an automation file. Throws when the frontmatter is missing or not YAML. */
export function parseAutomation(source: string): Automation {
  const match = FRONTMATTER.exec(source.replace(/^﻿/, ""));
  if (!match) throw new Error("missing frontmatter");
  const document = parseDocument(match[1]!);
  if (document.errors.length) throw new Error(document.errors[0]!.message);
  const data = (document.toJS() ?? {}) as Record<string, unknown>;
  return {
    name: String(data.name ?? ""),
    id: typeof data.id === "string" ? data.id : undefined,
    enabled: typeof data.enabled === "boolean" ? data.enabled : undefined,
    trigger: readTrigger(data.trigger),
    steps: Array.isArray(data.steps) ? data.steps.map(readStep) : [],
    description: (match[2] ?? "").trim(),
  };
}

function writeTrigger(trigger: Trigger) {
  switch (trigger.kind) {
    case "cron":
      return { cron: trigger.cron };
    case "event":
      return Object.keys(trigger.match).length ? { event: trigger.event, match: trigger.match } : { event: trigger.event };
    case "webhook":
      return Object.keys(trigger.match).length ? { webhook: true, match: trigger.match } : { webhook: true };
    default:
      return { manual: true };
  }
}

function writeStep(step: Step): Record<string, unknown> {
  switch (step.kind) {
    case "agent":
      return { agent: step.agent };
    case "tool":
      return Object.keys(step.input).length ? { tool: { name: step.name, input: step.input } } : { tool: { name: step.name } };
    case "notify":
      return { notify: { to: step.to, subject: step.subject, message: step.message } };
    default:
      return step.then !== undefined || step.else !== undefined
        ? { if: { [step.test]: step.value, then: (step.then ?? []).map(writeStep), else: (step.else ?? []).map(writeStep) } }
        : { if: { [step.test]: step.value } };
  }
}

/** An `if` with `then` or `else` takes one of two ways; without, it stops when the condition does not hold. */
export const isBranch = (step: Step): step is Extract<Step, { kind: "if" }> => step.kind === "if" && (step.then !== undefined || step.else !== undefined);

/** All steps, branches included, as the server counts them against its limit of 20. */
export const countSteps = (steps: Step[]): number =>
  steps.reduce((sum, step) => sum + 1 + (isBranch(step) ? countSteps(step.then ?? []) + countSteps(step.else ?? []) : 0), 0);

/** The list a path points into and the index in it. */
function locate(steps: Step[], path: StepPath): [Step[], number] | null {
  let list = steps;
  for (let at = 0; at < path.length - 1; at += 2) {
    const step = list[path[at] as number];
    const side = path[at + 1] as "then" | "else";
    if (!step || step.kind !== "if") return null;
    list = step[side] ?? [];
  }
  return [list, path[path.length - 1] as number];
}

export function stepAt(steps: Step[], path: StepPath): Step | undefined {
  const found = locate(steps, path);
  return found ? found[0][found[1]] : undefined;
}

/** A copy of the steps with the list at `path` changed by `change`. */
function editList(steps: Step[], path: StepPath, change: (list: Step[], index: number) => Step[]): Step[] {
  if (path.length === 1) return change(steps, path[0] as number);
  const [head, side, ...rest] = path as [number, "then" | "else", ...StepPath];
  return steps.map((step, index) => (index === head && step.kind === "if" ? { ...step, [side]: editList(step[side] ?? [], rest, change) } : step));
}

export const replaceStep = (steps: Step[], path: StepPath, next: Step) => editList(steps, path, (list, index) => list.map((step, at) => (at === index ? next : step)));
export const removeStep = (steps: Step[], path: StepPath) => editList(steps, path, (list, index) => list.filter((_, at) => at !== index));
/** Puts a step at `path`, moving what was there one down. */
export const insertStep = (steps: Step[], path: StepPath, step: Step) => editList(steps, path, (list, index) => [...list.slice(0, index), step, ...list.slice(index)]);
export function moveStepBy(steps: Step[], path: StepPath, by: number): [Step[], StepPath] {
  const found = locate(steps, path);
  if (!found) return [steps, path];
  const [list, index] = found;
  const to = index + by;
  if (to < 0 || to >= list.length) return [steps, path];
  const next = editList(steps, path, (items) => {
    const copy = [...items];
    [copy[index], copy[to]] = [copy[to]!, copy[index]!];
    return copy;
  });
  return [next, [...path.slice(0, -1), to]];
}

/** Writes an automation file with only the fields the server knows. */
export function serializeAutomation(automation: Automation): string {
  const data: Record<string, unknown> = { name: automation.name };
  if (automation.id) data.id = automation.id;
  if (automation.enabled !== undefined) data.enabled = automation.enabled;
  data.trigger = writeTrigger(automation.trigger);
  data.steps = automation.steps.map(writeStep);
  const front = stringify(data, { lineWidth: 0 }).trimEnd();
  return `---\n${front}\n---\n${automation.description ? `${automation.description.trim()}\n` : ""}`;
}

/** A new automation from a sentence: started by hand, with one agent step to fill in. */
export function draftAutomation(sentence: string, agent = ""): Automation {
  const name = sentence.trim().replace(/\s+/g, " ").slice(0, 80) || "New automation";
  return { name, trigger: { kind: "manual" }, steps: [{ kind: "agent", agent }], description: sentence.trim() };
}

export function emptyStep(kind: Step["kind"]): Step {
  switch (kind) {
    case "agent":
      return { kind: "agent", agent: "" };
    case "tool":
      return { kind: "tool", name: "", input: {} };
    case "notify":
      return { kind: "notify", to: "owner", subject: "", message: "{{output}}" };
    default:
      return { kind: "if", test: "contains", value: "" };
  }
}

export function emptyTrigger(kind: Trigger["kind"]): Trigger {
  switch (kind) {
    case "cron":
      return { kind: "cron", cron: "0 7 * * MON-FRI" };
    case "event":
      return { kind: "event", event: "run.failed", match: {} };
    case "webhook":
      return { kind: "webhook", match: {} };
    default:
      return { kind: "manual" };
  }
}

/** Hours of the day at which a simple cron expression fires, for the day line. */
export function cronHours(cron: string): number[] {
  const [minute = "", hour = ""] = cron.trim().split(/\s+/);
  const m = /^\d+$/.test(minute) ? Number(minute) / 60 : 0;
  if (hour === "*") return Array.from({ length: 24 }, (_, index) => index + m);
  const step = /^\*\/(\d+)$/.exec(hour);
  if (step) return Array.from({ length: 24 }, (_, index) => index).filter((index) => index % Number(step[1]) === 0).map((index) => index + m);
  return hour.split(",").flatMap((part) => {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) return Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, index) => Number(range[1]) + index + m);
    return /^\d+$/.test(part) ? [Number(part) + m] : [];
  });
}
