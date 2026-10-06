import {
  CreateGoalInputSchema,
  UpdateGoalInputSchema,
  type CreateGoalInput,
  type Goal,
  type GoalStatus,
  type Milestone,
  type Task,
  type TaskDependency,
  type UpdateGoalInput,
} from "@nova/types";
import type { Db } from "../client";
import { fromIsoDate, toGoal, toMilestone, toTask } from "../mappers";

export async function createGoal(db: Db, userId: string, input: CreateGoalInput): Promise<Goal> {
  const { deadline, ...rest } = CreateGoalInputSchema.parse(input);
  return toGoal(await db.goal.create({ data: { ...rest, deadline: fromIsoDate(deadline), userId } }));
}

export async function getGoal(db: Db, userId: string, goalId: string): Promise<Goal | null> {
  const row = await db.goal.findFirst({ where: { id: goalId, userId } });
  return row ? toGoal(row) : null;
}

export async function listGoals(db: Db, userId: string, filter: { status?: GoalStatus } = {}): Promise<Goal[]> {
  const rows = await db.goal.findMany({
    where: { userId, status: filter.status },
    orderBy: [{ deadline: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toGoal);
}

export async function updateGoal(
  db: Db,
  userId: string,
  goalId: string,
  input: UpdateGoalInput,
): Promise<Goal | null> {
  const { deadline, ...rest } = UpdateGoalInputSchema.parse(input);
  const { count } = await db.goal.updateMany({
    where: { id: goalId, userId },
    data: { ...rest, deadline: deadline ? fromIsoDate(deadline) : undefined },
  });
  return count === 0 ? null : getGoal(db, userId, goalId);
}

/** Deletes the goal with its milestones, tasks, dependencies and plan entries. */
export async function deleteGoal(db: Db, userId: string, goalId: string): Promise<boolean> {
  const { count } = await db.goal.deleteMany({ where: { id: goalId, userId } });
  return count > 0;
}

export interface GoalTree {
  goal: Goal;
  milestones: (Milestone & { tasks: Task[] })[];
  dependencies: TaskDependency[];
}

/** A goal with everything under it, in display order. */
export async function getGoalTree(db: Db, userId: string, goalId: string): Promise<GoalTree | null> {
  const row = await db.goal.findFirst({
    where: { id: goalId, userId },
    include: {
      milestones: {
        orderBy: { order: "asc" },
        include: { tasks: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      },
    },
  });
  if (!row) return null;
  const dependencies = await db.taskDependency.findMany({
    where: { task: { goalId } },
    select: { taskId: true, dependsOnTaskId: true },
    orderBy: [{ taskId: "asc" }, { dependsOnTaskId: "asc" }],
  });
  return {
    goal: toGoal(row),
    milestones: row.milestones.map((m) => ({ ...toMilestone(m), tasks: m.tasks.map(toTask) })),
    dependencies,
  };
}

export interface GoalProgress {
  goalId: string;
  /** Estimated minutes of finished tasks. */
  doneMin: number;
  /** Estimated minutes of all tasks still part of the goal (dropped tasks excluded). */
  totalMin: number;
  taskCount: number;
  doneCount: number;
}

/** Progress per goal, measured in estimated minutes so one long task outweighs several tiny ones. */
export async function getGoalProgress(db: Db, userId: string): Promise<Map<string, GoalProgress>> {
  const rows = await db.task.groupBy({
    by: ["goalId", "status"],
    where: { goal: { userId }, status: { not: "DROPPED" } },
    _sum: { estimatedMin: true },
    _count: { _all: true },
  });
  const progress = new Map<string, GoalProgress>();
  for (const row of rows) {
    const entry = progress.get(row.goalId) ?? { goalId: row.goalId, doneMin: 0, totalMin: 0, taskCount: 0, doneCount: 0 };
    const minutes = row._sum.estimatedMin ?? 0;
    entry.totalMin += minutes;
    entry.taskCount += row._count._all;
    if (row.status === "DONE") {
      entry.doneMin += minutes;
      entry.doneCount += row._count._all;
    }
    progress.set(row.goalId, entry);
  }
  return progress;
}
