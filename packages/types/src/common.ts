import { z } from "zod";

export const IdSchema = z.string().min(1);

/** Calendar date in the user's timezone, e.g. "2026-10-06". */
export const IsoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** UTC timestamp, e.g. "2026-10-06T18:00:00.000Z". */
export const IsoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const MinutesSchema = z.number().int().nonnegative();

/** Outcome of an operation that can fail for expected reasons. Thrown errors are reserved for bugs. */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
