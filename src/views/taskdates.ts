// Dates for tasks, as plain local days. The server compares due dates in its own time zone.

const pad = (value: number) => String(value).padStart(2, "0");
export const dayIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export type DueGroup = "today" | "tomorrow" | "week" | "later";
export const GROUPS: DueGroup[] = ["today", "tomorrow", "week", "later"];

/** Which list a due date belongs to. Overdue counts as today, no date as later. */
export function groupOf(due: string | null | undefined, today = new Date()): DueGroup {
  if (!due) return "later";
  const now = dayIso(today);
  if (due <= now) return "today";
  if (due === dayIso(addDays(today, 1))) return "tomorrow";
  if (due <= dayIso(addDays(today, 7))) return "week";
  return "later";
}

/** A representative due date for a group, used when a task moves there. */
export function dueFor(group: DueGroup, today = new Date()): string | null {
  if (group === "today") return dayIso(today);
  if (group === "tomorrow") return dayIso(addDays(today, 1));
  if (group === "week") return dayIso(nextWeekday(today, 5, 2));
  return null;
}

/** The next given weekday (0 Sunday to 6 Saturday), at least `min` days ahead. */
export function nextWeekday(today: Date, weekday: number, min = 1) {
  for (let days = min; days < min + 7; days++) {
    const date = addDays(today, days);
    if (date.getDay() === weekday) return date;
  }
  return addDays(today, min);
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, so: 0, sonntag: 0,
  mon: 1, monday: 1, mo: 1, montag: 1,
  tue: 2, tuesday: 2, di: 2, dienstag: 2,
  wed: 3, wednesday: 3, mi: 3, mittwoch: 3,
  thu: 4, thursday: 4, do: 4, donnerstag: 4,
  fri: 5, friday: 5, fr: 5, freitag: 5,
  sat: 6, saturday: 6, sa: 6, samstag: 6,
};

export type Parsed = { title: string; due: string | null; priority: number; dueWord: boolean };

/**
 * Reads a quick entry such as "tomorrow call Jane !" or "bis Freitag Angebot schicken". Understands today, tomorrow,
 * weekdays, next week, dates like 12.11. and ! for important, in English and German.
 */
export function parseTask(text: string, today = new Date()): Parsed {
  let rest = ` ${text.trim()} `;
  let due: string | null = null;
  let priority = 0;
  const take = (pattern: RegExp, value: () => string | null) => {
    if (due !== null) return;
    const match = pattern.exec(rest);
    if (!match) return;
    due = value();
    rest = rest.replace(match[0], " ");
  };
  if (/(^|\s)!(\s|$)/.test(rest) || /!\s*$/.test(rest)) {
    priority = 3;
    rest = rest.replace(/(^|\s)!+(?=\s|$)/g, " ").replace(/!+\s*$/, " ");
  }
  take(/\s(today|heute)\s/i, () => dayIso(today));
  take(/\s(tomorrow|morgen)\s/i, () => dayIso(addDays(today, 1)));
  take(/\s(next week|nächste woche|naechste woche)\s/i, () => dayIso(nextWeekday(today, 1, 1)));
  take(/\s(?:(?:am|on|by|bis)\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})?\s/i, () => {
    const match = /\s(?:(?:am|on|by|bis)\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})?\s/i.exec(rest)!;
    let year = match[3] ? Number(match[3]) : today.getFullYear();
    const date = new Date(year, Number(match[2]) - 1, Number(match[1]));
    if (!match[3] && dayIso(date) < dayIso(today)) year += 1;
    return dayIso(new Date(year, Number(match[2]) - 1, Number(match[1])));
  });
  if (due === null) {
    // Full names stand alone; short forms such as "Fr" or "Fri" need "by", "on", "bis" or "am" before them.
    const long = Object.keys(WEEKDAYS).filter((name) => name.length > 3).join("|");
    const short = Object.keys(WEEKDAYS).filter((name) => name.length <= 3).join("|");
    const match =
      new RegExp(`\\s(?:(?:by|on|bis|am)\\s+)?(${long})(?=\\s)`, "i").exec(rest) ??
      new RegExp(`\\s(?:by|on|bis|am)\\s+(${short})\\.?(?=\\s)`, "i").exec(rest);
    const weekday = match ? WEEKDAYS[match[1]!.toLowerCase()] : undefined;
    if (match && weekday !== undefined) {
      due = dayIso(nextWeekday(today, weekday, 1));
      rest = rest.replace(match[0], " ");
    }
  }
  return { title: rest.replace(/\s+/g, " ").trim(), due, priority, dueWord: due !== null };
}
