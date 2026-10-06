import { HttpError } from "./http";

// A small in-memory limiter for the AI routes, which are slow and, on a free tier, scarce.
// It counts per server process: enough for one instance, and replaced by a shared store if
// NOVA is ever run on several.

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

/** Allows `limit` calls per user per minute for `bucket`; throws RATE_LIMITED beyond that. */
export function rateLimit(userId: string, bucket: string, limit: number, now: number = Date.now()): void {
  const key = `${bucket}:${userId}`;
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    throw new HttpError("RATE_LIMITED");
  }
  recent.push(now);
  hits.set(key, recent);
}

/** For tests. */
export function resetRateLimits(): void {
  hits.clear();
}
