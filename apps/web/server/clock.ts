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

/** The hour and weekday it is for someone in `timezone`, with the instant itself. Recorded with every behaviour event. */
export function localMoment(timezone: string, now: Date = new Date()): { now: string; localHour: number; dayOfWeek: number } {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const weekday = days.indexOf(parts.find((part) => part.type === "weekday")?.value ?? "");
    if (Number.isInteger(hour) && weekday >= 0) return { now: now.toISOString(), localHour: hour % 24, dayOfWeek: weekday };
  } catch {
    // unknown timezone: fall through to UTC
  }
  return { now: now.toISOString(), localHour: now.getUTCHours(), dayOfWeek: now.getUTCDay() };
}
