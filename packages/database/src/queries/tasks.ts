import {
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  type CreateTaskInput,
  type IsoDateTime,
  type Task,
  type TaskStatus,
  type UpdateTaskInput,
} from "@nova/types";
import { inTransaction, type Db } from "../client";
import { fromIsoDate, toTask } from "../mappers";

/** Returns null when the milestone does not exist or belongs to someone else. */
export async function createTask(
  db: Db,
  userId: string,
  milestoneId: string,
  input: CreateTaskInput,
): Promise<Task | null> {
  const { deadline, ...rest } = CreateTaskInputSchema.parse(input);
  return inTransaction(db, async (tx) => {
    const milestone = await tx.milestone.findFirst({
      where: { id: milestoneId, goal: { userId } },
      select: { goalId: true },
    });
    if (!milestone) return null;
    if (rest.parentTaskId) {
      const parent = await tx.task.findFirst({
        where: { id: rest.parentTaskId, goalId: milestone.goalId },
        select: { id: true },
      });
      if (!parent) return null;
    }
    const row = await tx.task.create({
      data: {
        ...rest,
        milestoneId,
        goalId: milestone.goalId,
        deadline: deadline ? fromIsoDate(deadline) : undefined,
      },
    });
    return toTask(row);
  });
}

export async function getTask(db: Db, userId: string, taskId: string): Promise<Task | null> {
  const row = await db.task.findFirst({ where: { id: taskId, goal: { userId } } });
  return row ? toTask(row) : null;
}

/** Every task the user owns, optionally limited by status or goal. Stable order. */
export async function listTasks(
  db: Db,
  userId: string,
  filter: { statuses?: TaskStatus[]; goalId?: string } = {},
): Promise<Task[]> {
  const rows = await db.task.findMany({
    where: {
      goal: { userId },
      goalId: filter.goalId,
      status: filter.statuses ? { in: filter.statuses } : undefined,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toTask);
}

/**
 * `now` stamps the completion time when the status becomes DONE; moving a task out of DONE clears it.
 */
export async function updateTask(
  db: Db,
  userId: string,
  taskId: string,
  input: UpdateTaskInput,
  now?: IsoDateTime,
): Promise<Task | null> {
  const { deadline, deferredUntil, ...rest } = UpdateTaskInputSchema.parse(input);
  const toDate = (value: string | null | undefined) => (value == null ? value : fromIsoDate(value));
  const completedAt =
    rest.status === undefined ? undefined : rest.status === "DONE" ? (now ? new Date(now) : undefined) : null;
  const { count } = await db.task.updateMany({
    where: { id: taskId, goal: { userId } },
    data: {
      ...rest,
      deadline: toDate(deadline),
      // A task that is no longer deferred has no deferral date.
      deferredUntil: rest.status !== undefined && rest.status !== "DEFERRED" ? null : toDate(deferredUntil),
      completedAt,
    },
  });
  return count === 0 ? null : getTask(db, userId, taskId);
}

export async function deleteTask(db: Db, userId: string, taskId: string): Promise<boolean> {
  const { count } = await db.task.deleteMany({ where: { id: taskId, goal: { userId } } });
  return count > 0;
}
