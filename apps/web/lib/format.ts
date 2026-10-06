const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "2026-10-31" → "31 Oct 2026". */
export const formatDate = (isoDate: string) => dateFormat.format(new Date(`${isoDate}T00:00:00.000Z`));

/** 95 → "1 h 35 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "DONT_KNOW_HOW_TO_START" → "Dont know how to start"; used for enum labels. */
export const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
