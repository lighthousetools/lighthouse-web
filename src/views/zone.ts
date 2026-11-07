// Dates in the owner's time zone (`GET /me` → `timezone`, from `server.timezone`), which post slots and "today" follow.
// Without a zone, the browser's own is used.

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string | undefined) {
  const key = zone ?? "";
  let found = formatters.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(key, found);
  }
  return found;
}

/** The calendar day and time of day of an instant in a zone: `2026-11-10`, `08:00`. */
export function inZone(instant: string | Date, zone?: string): { day: string; time: string } {
  const parts = Object.fromEntries(formatter(zone).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** The instant of a day and time of day in a zone, as an ISO timestamp. */
export function fromZone(day: string, time: string, zone?: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const wanted = Date.UTC(year!, month! - 1, date!, hours ?? 0, minutes ?? 0);
  // Start from the wall time read as UTC and correct by the zone's offset, twice for days that change the offset.
  let guess = wanted;
  for (let pass = 0; pass < 2; pass++) {
    const seen = inZone(new Date(guess), zone);
    const [sy, sm, sd] = seen.day.split("-").map(Number);
    const [sh, smin] = seen.time.split(":").map(Number);
    guess += wanted - Date.UTC(sy!, sm! - 1, sd!, sh!, smin!);
  }
  return new Date(guess).toISOString();
}
