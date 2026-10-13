import { closeEntry, shouldAskFriction, summariseEvents, type BehaviourSummary } from "@nova/behaviour";
import * as database from "@nova/database";
import { getDb, inTransaction, lockUser } from "@nova/database";
import { addDays } from "@nova/planner";
import type { FrictionEvent, FrictionReason, Goal, IsoDate, Task, User } from "@nova/types";
import { todayIn } from "../clock";
import { onFrictionReported, onTaskLeftUnfinished } from "../hooks/behaviour";
import { found } from "../http";

/**
 * Closes every earlier day that still has untouched entries: finished-elsewhere becomes completed,
 * the rest become missed, and a task that was started and left is recorded as abandoned.
 *
 * There is no nightly job. This runs when the user next asks for a plan, which gives the same
 * result, and it only ever acts on entries still pending, so running it twice changes nothing.
 */
export async function closePastDays(user: User, today: IsoDate, now: Date = new Date()): Promise<number> {
  const pending = await database.listPendingEntriesBefore(getDb(), user.id, today);
  if (pending.length === 0) return 0;

  return inTransaction(getDb(), async (tx) => {
    await lockUser(tx, user.id);
    let closed = 0;
    for (const entry of await database.listPendingEntriesBefore(tx, user.id, today)) {
      const decision = closeEntry(entry);
      if (!(await database.closeDailyEntry(tx, user.id, entry.id, decision.outcome))) continue;
      closed += 1;
      if (decision.abandoned) {
        const task = await database.getTask(tx, user.id, entry.taskId);
        if (task) await onTaskLeftUnfinished(tx, user, task, now);
      }
    }
    return closed;
  });
}

/** The user's answer to "what got in the way?", stored with the event that marks it. */
export async function reportFriction(user: User, taskId: string, input: { reason: FrictionReason; note?: string | undefined }, now: Date = new Date()): Promise<FrictionEvent> {
  return inTransaction(getDb(), async (tx) => {
    const task = found(await database.getTask(tx, user.id, taskId));
    const friction = found(await database.recordFriction(tx, user.id, { taskId, reason: input.reason, note: input.note ?? null, occurredAt: now.toISOString() }));
    await onFrictionReported(tx, user, task, { reason: input.reason, hasNote: Boolean(input.note?.trim()) }, now);
    return friction;
  });
}

export interface FrictionQuestion {
  task: Task;
  goal: Pick<Goal, "id" | "title">;
  /** The day it was planned and not reached. */
  date: IsoDate;
}

/**
 * Tasks from the last week that were planned, never touched, and not yet explained.
 * At most two are returned: this is a gentle question, not a list of failures.
 */
export async function frictionQuestions(user: User, today: IsoDate, tasks: Task[], goals: Goal[]): Promise<FrictionQuestion[]> {
  const db = getDb();
  const [outcomes, friction] = await Promise.all([
    // Earlier days only: a task missed yesterday is usually in today's plan again, and that entry says nothing yet.
    database.listRecentOutcomes(db, user.id, addDays(today, -7), today),
    database.listFriction(db, user.id, { limit: 100 }),
  ]);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));

  const questions: FrictionQuestion[] = [];
  for (const outcome of outcomes) {
    if (outcome.outcome !== "MISSED") continue;
    const task = taskById.get(outcome.taskId);
    const goal = task && goalById.get(task.goalId);
    if (!task || !goal || goal.status !== "ACTIVE" || task.status === "DONE" || task.status === "DROPPED") continue;
    const answeredSince = friction.some((event) => event.taskId === task.id && event.occurredAt.slice(0, 10) >= outcome.date);
    if (!shouldAskFriction({ lastOutcome: outcome.outcome, postponeCount: task.postponeCount, answeredSince })) continue;
    questions.push({ task, goal: { id: goal.id, title: goal.title }, date: outcome.date });
    if (questions.length === 2) break;
  }
  return questions;
}

/** What has happened over the last `days` days, counted. */
export async function behaviourSummary(user: User, days = 30, now: Date = new Date()): Promise<BehaviourSummary & { days: number }> {
  const from = `${addDays(todayIn(user.timezone, now), -days)}T00:00:00.000Z`;
  const events = await database.listEvents(getDb(), user.id, { from });
  return { ...summariseEvents(events), days };
}
