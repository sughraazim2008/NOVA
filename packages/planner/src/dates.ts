import type { IsoDate } from "@nova/types";

// Calendar dates are "YYYY-MM-DD" strings: they compare correctly as text, and arithmetic on them
// goes through UTC so no timezone or clock is ever involved.

const DAY_MS = 86_400_000;
const toUtc = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`);

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: IsoDate, to: IsoDate): number => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

export const addDays = (date: IsoDate, days: number): IsoDate => new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
