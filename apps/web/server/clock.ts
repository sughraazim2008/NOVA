import type { IsoDate } from "@nova/types";

/** The calendar date it currently is for someone in `timezone`. The one place "today" is decided. */
export function todayIn(timezone: string, now: Date = new Date()): IsoDate {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
