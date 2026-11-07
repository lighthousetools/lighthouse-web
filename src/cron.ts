// Cron schedules as people read them: "Mo–Fr 07:00", "Fr 08:00", "täglich 06:30", "stündlich".
import { language } from "./i18n";

const NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function dayNumber(part: string): number | null {
  const upper = part.toUpperCase();
  const named = NAMES.indexOf(upper.slice(0, 3));
  if (named !== -1) return named;
  const value = Number(part);
  return Number.isInteger(value) && value >= 0 && value <= 7 ? value % 7 : null;
}

const weekday = (day: number) => new Date(2024, 0, 7 + day).toLocaleDateString(language() === "de" ? "de-DE" : "en-GB", { weekday: "short" }).replace(".", "");

/** The weekdays of a cron day field, as text; null for "every day". */
function days(field: string): string | null {
  if (field === "*" || field === "?") return null;
  return field
    .split(",")
    .map((part) => {
      const range = part.split("-");
      if (range.length === 2) {
        const from = dayNumber(range[0]!), to = dayNumber(range[1]!);
        if (from === 1 && to === 5) return language() === "de" ? "Mo–Fr" : "Mon–Fri";
        return from !== null && to !== null ? `${weekday(from)}–${weekday(to)}` : part;
      }
      const day = dayNumber(part);
      return day === null ? part : weekday(day);
    })
    .join(", ");
}

/** A cron expression in plain words; the expression itself when it is too unusual to describe. */
export function cronText(cron: string | null | undefined): string {
  if (!cron) return "";
  const fields = cron.trim().split(/\s+/);
  if (fields.length < 5) return cron;
  const [minute, hour, dom, month, dow] = fields as [string, string, string, string, string];
  const de = language() === "de";
  if (dom !== "*" || month !== "*") return cron;
  if (/^\d+$/.test(minute) && hour === "*") return de ? `stündlich zur Minute ${minute}` : `hourly at :${minute.padStart(2, "0")}`;
  const every = /^\*\/(\d+)$/.exec(hour);
  if (/^\d+$/.test(minute) && every) return de ? `alle ${every[1]} Stunden` : `every ${every[1]} hours`;
  if (!/^\d+$/.test(minute) || !/^\d+(,\d+)*$/.test(hour)) return cron;
  const times = hour.split(",").map((value) => `${value.padStart(2, "0")}:${minute.padStart(2, "0")}`).join(", ");
  const when = days(dow);
  return when ? `${when} ${times}` : de ? `täglich ${times}` : `daily ${times}`;
}
