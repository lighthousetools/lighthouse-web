// Dates in the owner's time zone (`GET /me` → `timezone`, from `server.timezone`), which post slots and "today" follow.
// Without a zone, the browser's own is used.

/** The zone if this browser knows it, so it can go into any date formatting option safely. */
export function validZone(zone: string | null | undefined): string | undefined {
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string | undefined) {
  const key = zone ?? "";
  let found = formatters.get(key);
  if (!found) {
    const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    try {
      found = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: zone });
    } catch {
      // A zone this browser does not know falls back to the browser's own, instead of breaking the page.
      found = new Intl.DateTimeFormat("en-CA", options);
    }
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
