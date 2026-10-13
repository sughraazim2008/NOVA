import { frictionReported, taskAbandoned, taskCompleted, taskCreated, taskPostponed, taskSkipped, taskStarted } from "@nova/behaviour";
import { countStartSessions, recordEvent, type Db } from "@nova/database";
import type { FrictionReason, IsoDate, NewBehaviourEvent, Task, User } from "@nova/types";
import { localMoment } from "../clock";

// Behaviour hooks. Each is called with the same transaction handle as the state change it reports,
// so a recorded event and the change it describes can never disagree. What an event contains is
// decided by pure functions in @nova/behaviour; these only supply the moment and write the result.

const write = async (db: Db, user: User, events: NewBehaviourEvent | NewBehaviourEvent[]) => {
  for (const event of [events].flat()) await recordEvent(db, user.id, event);
};

export async function onTaskCreated(db: Db, user: User, task: Task, now: Date = new Date()): Promise<void> {
  await write(db, user, taskCreated(task, localMoment(user.timezone, now)));
}

export async function onTaskStarted(db: Db, user: User, task: Task, details: { viaNovaStart: boolean }, now: Date = new Date()): Promise<void> {
  await write(db, user, taskStarted(task, localMoment(user.timezone, now), details.viaNovaStart));
}

/** Also records an overrun or underrun when the time taken was far from the estimate. */
export async function onTaskCompleted(db: Db, user: User, task: Task, now: Date = new Date()): Promise<void> {
  const sessions = await countStartSessions(db, user.id, task.id);
  await write(db, user, taskCompleted(task, localMoment(user.timezone, now), sessions));
}

export async function onTaskSkipped(db: Db, user: User, task: Task, details: { plannedMin: number }, now: Date = new Date()): Promise<void> {
  await write(db, user, taskSkipped(task, localMoment(user.timezone, now), details.plannedMin));
}

/** Also records an abandonment on the postponement that reaches the limit. */
export async function onTaskPostponed(db: Db, user: User, task: Task, details: { toDate: IsoDate }, now: Date = new Date()): Promise<void> {
  await write(db, user, taskPostponed(task, localMoment(user.timezone, now), details.toDate));
}

/** A task that was started and then left when its day ended. */
export async function onTaskLeftUnfinished(db: Db, user: User, task: Task, now: Date = new Date()): Promise<void> {
  await write(db, user, taskAbandoned(task, localMoment(user.timezone, now), "LEFT_UNFINISHED"));
}

export async function onFrictionReported(db: Db, user: User, task: Task, details: { reason: FrictionReason; hasNote: boolean }, now: Date = new Date()): Promise<void> {
  await write(db, user, frictionReported(task, localMoment(user.timezone, now), details.reason, details.hasNote));
}
