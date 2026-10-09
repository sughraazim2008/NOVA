import * as database from "@nova/database";
import { getDb, inTransaction } from "@nova/database";
import { addDays } from "@nova/planner";
import type { IsoDate, Task, User } from "@nova/types";
import { todayIn } from "../clock";
import { onTaskCompleted, onTaskPostponed, onTaskSkipped, onTaskStarted } from "../hooks/behaviour";
import { found, HttpError } from "../http";

// What the user does with a task during the day. Each action changes the task and today's plan
// entry together, in one transaction, and calls the behaviour hook for that action.

export async function startTask(user: User, taskId: string): Promise<Task> {
  return inTransaction(getDb(), async (tx) => {
    const task = found(await database.startTask(tx, user.id, taskId));
    await onTaskStarted(tx, user, task);
    return task;
  });
}

export async function completeTask(user: User, taskId: string, actualMin?: number): Promise<Task> {
  const today = todayIn(user.timezone);
  return inTransaction(getDb(), async (tx) => {
    const task = found(await database.completeTask(tx, user.id, taskId, { now: new Date().toISOString(), ...(actualMin === undefined ? {} : { actualMin }) }));
    await database.setDailyOutcome(tx, user.id, today, taskId, "COMPLETED");
    await onTaskCompleted(tx, user, task);
    return task;
  });
}

/** Undo for a mistaken "done": the task is open again and back in today's plan. */
export async function reopenTask(user: User, taskId: string): Promise<Task> {
  const today = todayIn(user.timezone);
  return inTransaction(getDb(), async (tx) => {
    const task = found(await database.updateTask(tx, user.id, taskId, { status: "TODO" }));
    await database.setDailyOutcome(tx, user.id, today, taskId, "PENDING");
    return task;
  });
}

/** Not today. The task itself is unchanged and is considered again tomorrow. */
export async function skipTask(user: User, taskId: string): Promise<Task> {
  const today = todayIn(user.timezone);
  return inTransaction(getDb(), async (tx) => {
    const task = found(await database.getTask(tx, user.id, taskId));
    const inPlan = await database.setDailyOutcome(tx, user.id, today, taskId, "SKIPPED");
    if (!inPlan) throw new HttpError("CONFLICT", "That task is not in today's plan.");
    await onTaskSkipped(tx, user, task);
    return task;
  });
}

/** Move the task to a later date; tomorrow when none is given. */
export async function postponeTask(user: User, taskId: string, toDate?: IsoDate): Promise<Task> {
  const today = todayIn(user.timezone);
  const until = toDate ?? addDays(today, 1);
  if (until <= today) throw new HttpError("VALIDATION_FAILED", "Choose a date after today.", [{ path: "toDate", message: "Must be after today." }]);
  return inTransaction(getDb(), async (tx) => {
    const task = found(await database.postponeTask(tx, user.id, taskId, until));
    await database.setDailyOutcome(tx, user.id, today, taskId, "POSTPONED");
    await onTaskPostponed(tx, user, task);
    return task;
  });
}
