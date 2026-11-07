// Date helpers for the posting calendar. Weeks start on Monday, weekdays count 1 (Monday) to 7 (Sunday) like the server.

export const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const weekdayOf = (date: Date) => ((date.getDay() + 6) % 7) + 1;
export const weekStart = (date: Date) => addDays(startOfDay(date), 1 - weekdayOf(date));
export const dayIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const sameDay = (a: Date, b: Date) => dayIso(a) === dayIso(b);
export const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

/** The day at a local time of day, as an ISO timestamp for the server. */
export function atTime(day: Date, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours ?? 9, minutes ?? 0).toISOString();
}

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

/** The row a post falls into: the closest of the times. */
export function nearestTime(times: string[], time: string): string | undefined {
  let best: string | undefined;
  for (const candidate of times) {
    if (best === undefined || Math.abs(minutesOf(candidate) - minutesOf(time)) < Math.abs(minutesOf(best) - minutesOf(time))) best = candidate;
  }
  return best;
}

/** ISO week number, for the header. */
export function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** The 42 days a month view shows, from the Monday before the first. */
export function monthDays(month: Date): Date[] {
  const start = weekStart(new Date(month.getFullYear(), month.getMonth(), 1));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

type Gap = { at: string; posts: string[] };
/** Calendar slots still to come that nobody fills yet. */
export const openGaps = <T extends Gap>(calendar: T[], now: Date) => calendar.filter((slot) => !slot.posts.length && new Date(slot.at) > now);

/** The best post for a gap: same pillar first, then the oldest in the pool. */
export function suggestFor<P extends { id: string; pillar?: string | null; created_at: string }>(pool: P[], pillar: string | null | undefined, skip = 0): P | undefined {
  const sorted = [...pool].sort((a, b) => {
    const match = Number(b.pillar === pillar && !!pillar) - Number(a.pillar === pillar && !!pillar);
    return match || a.created_at.localeCompare(b.created_at);
  });
  return sorted.length ? sorted[skip % sorted.length] : undefined;
}
