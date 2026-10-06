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
