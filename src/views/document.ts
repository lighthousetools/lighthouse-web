import type { Schemas } from "../api/client";

export type BriefingDocument = Schemas["BriefingDocument"];
export type DocItem = Schemas["DocumentItem"];
export type DocSection = Schemas["DocumentSection"];
type Num = Schemas["ItemNumber"];

/** The first sentence of a summary as the headline, the rest as the lead. */
export function thesis(summary: string | null | undefined) {
  const text = (summary ?? "").trim();
  if (!text) return { title: "", lead: "" };
  const match = /^(.+?[.!?])(\s+|$)([\s\S]*)$/.exec(text);
  if (!match) return { title: text, lead: "" };
  return { title: match[1]!.trim(), lead: (match[3] ?? "").trim() };
}

/** Puts sections into columns in reading order, balancing by item count. */
export function columns<T extends { items?: unknown[] }>(sections: T[], count = 3): T[][] {
  const out: T[][] = Array.from({ length: count }, () => []);
  const weight = Array.from({ length: count }, () => 0);
  for (const section of sections) {
    const index = weight.indexOf(Math.min(...weight));
    out[index]!.push(section);
    weight[index]! += 1 + (section.items?.length ?? 0);
  }
  return out;
}

/** Change against the period before, in percent, or null when there is nothing to compare. */
export function change(number: Num) {
  if (number.previous == null || number.previous === 0) return null;
  return Math.round(((number.value - number.previous) / Math.abs(number.previous)) * 100);
}

export function formatNumber(number: Pick<Num, "value" | "unit">, locale?: string) {
  const value = number.value.toLocaleString(locale, { maximumFractionDigits: Math.abs(number.value) < 10 ? 1 : 0 });
  return number.unit ? `${value} ${number.unit}` : value;
}

/** All items that carry numbers, each with its first number, for stat tiles and the film. */
export function figures(document: BriefingDocument | null | undefined) {
  return (document?.content.sections ?? []).flatMap((section) =>
    (section.items ?? []).flatMap((item) => (item.numbers?.[0] ? [{ item, number: item.numbers[0], section }] : [])),
  );
}

/** "2026-W45" as week 45 of 2026. */
export function weekOf(period: string) {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(period);
  return match ? { year: Number(match[1]), week: Number(match[2]) } : null;
}
