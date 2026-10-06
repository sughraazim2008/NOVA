import {
  NewBehaviourEventSchema,
  type BehaviourEvent,
  type EventType,
  type IsoDateTime,
  type NewBehaviourEvent,
} from "@nova/types";
import type { Db } from "../client";
import { toBehaviourEvent } from "../mappers";

/**
 * Appends one event. Call it with the same transaction handle as the state change it
 * describes, so the two can never disagree.
 */
export async function recordEvent(db: Db, userId: string, input: NewBehaviourEvent): Promise<BehaviourEvent> {
  const event = NewBehaviourEventSchema.parse(input);
  const row = await db.behaviourEvent.create({
    data: {
      userId,
      taskId: event.taskId,
      goalId: event.goalId,
      type: event.type,
      occurredAt: new Date(event.occurredAt),
      payload: event.payload,
    },
  });
  return toBehaviourEvent(row);
}

/** Events in the order they happened. `from` is inclusive, `to` exclusive. */
export async function listEvents(
  db: Db,
  userId: string,
  filter: { from?: IsoDateTime; to?: IsoDateTime; types?: EventType[]; taskId?: string } = {},
): Promise<BehaviourEvent[]> {
  const rows = await db.behaviourEvent.findMany({
    where: {
      userId,
      taskId: filter.taskId,
      type: filter.types ? { in: filter.types } : undefined,
      occurredAt: {
        gte: filter.from ? new Date(filter.from) : undefined,
        lt: filter.to ? new Date(filter.to) : undefined,
      },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toBehaviourEvent);
}
