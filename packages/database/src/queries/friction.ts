import type { FrictionEvent, FrictionReason, IsoDateTime } from "@nova/types";
import type { Db } from "../client";
import type * as Row from "../generated/client";

const toFrictionEvent = (row: Row.FrictionEvent): FrictionEvent => ({
  id: row.id,
  userId: row.userId,
  taskId: row.taskId,
  reason: row.reason,
  note: row.note,
  occurredAt: row.occurredAt.toISOString(),
  appliedAction: row.appliedAction,
  startedAfter: row.startedAfter,
});

/** Returns null when the task does not exist or belongs to someone else. */
export async function recordFriction(
  db: Db,
  userId: string,
  input: { taskId: string; reason: FrictionReason; note?: string | null; occurredAt: IsoDateTime },
): Promise<FrictionEvent | null> {
  const owned = await db.task.count({ where: { id: input.taskId, goal: { userId } } });
  if (owned === 0) return null;
  const row = await db.frictionEvent.create({
    data: { userId, taskId: input.taskId, reason: input.reason, note: input.note?.trim() || null, occurredAt: new Date(input.occurredAt) },
  });
  return toFrictionEvent(row);
}

/** Most recent first. */
export async function listFriction(db: Db, userId: string, filter: { taskId?: string; limit?: number } = {}): Promise<FrictionEvent[]> {
  const rows = await db.frictionEvent.findMany({
    where: { userId, taskId: filter.taskId },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: filter.limit,
  });
  return rows.map(toFrictionEvent);
}

/** Records what NOVA did in response to a friction answer. */
export async function setFrictionAction(db: Db, userId: string, frictionId: string, action: FrictionEvent["appliedAction"]): Promise<void> {
  await db.frictionEvent.updateMany({ where: { id: frictionId, userId }, data: { appliedAction: action } });
}

/**
 * Marks recent friction on a task as followed by a start: the signal of whether NOVA's response
 * helped. Only friction NOVA acted on, and only once.
 */
export async function markStartedAfterFriction(db: Db, userId: string, taskId: string, since: IsoDateTime): Promise<number> {
  const { count } = await db.frictionEvent.updateMany({
    where: { userId, taskId, appliedAction: { not: null }, startedAfter: null, occurredAt: { gte: new Date(since) } },
    data: { startedAfter: true },
  });
  return count;
}
