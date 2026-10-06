import * as database from "@nova/database";
import { getDb, type GoalProgress, type GoalTree } from "@nova/database";
import type {
  CreateGoalInput,
  CreateMilestoneInput,
  Goal,
  GoalStatus,
  Milestone,
  UpdateGoalInput,
  UpdateMilestoneInput,
  User,
} from "@nova/types";
import { found } from "../http";

export interface Progress {
  doneMin: number;
  totalMin: number;
  taskCount: number;
  doneCount: number;
  /** Whole percent of estimated minutes finished; 0 for a goal with no tasks. */
  percent: number;
}

export type GoalWithProgress = Goal & { progress: Progress };

function toProgress(entry: GoalProgress | undefined): Progress {
  const { doneMin = 0, totalMin = 0, taskCount = 0, doneCount = 0 } = entry ?? {};
  return { doneMin, totalMin, taskCount, doneCount, percent: totalMin === 0 ? 0 : Math.round((doneMin / totalMin) * 100) };
}

export async function listGoals(user: User, status?: GoalStatus): Promise<GoalWithProgress[]> {
  const db = getDb();
  const [goals, progress] = await Promise.all([
    database.listGoals(db, user.id, status ? { status } : {}),
    database.getGoalProgress(db, user.id),
  ]);
  return goals.map((goal) => ({ ...goal, progress: toProgress(progress.get(goal.id)) }));
}

export function createGoal(user: User, input: CreateGoalInput): Promise<Goal> {
  return database.createGoal(getDb(), user.id, input);
}

export async function getGoalTree(user: User, goalId: string): Promise<GoalTree & { progress: Progress }> {
  const db = getDb();
  const tree = found(await database.getGoalTree(db, user.id, goalId));
  const progress = await database.getGoalProgress(db, user.id);
  return { ...tree, progress: toProgress(progress.get(goalId)) };
}

export async function updateGoal(user: User, goalId: string, input: UpdateGoalInput): Promise<Goal> {
  return found(await database.updateGoal(getDb(), user.id, goalId, input));
}

export async function deleteGoal(user: User, goalId: string): Promise<void> {
  found(await database.deleteGoal(getDb(), user.id, goalId));
}

export async function createMilestone(user: User, goalId: string, input: CreateMilestoneInput): Promise<Milestone> {
  return found(await database.createMilestone(getDb(), user.id, goalId, input));
}

export async function updateMilestone(user: User, milestoneId: string, input: UpdateMilestoneInput): Promise<Milestone> {
  return found(await database.updateMilestone(getDb(), user.id, milestoneId, input));
}

export async function deleteMilestone(user: User, milestoneId: string): Promise<void> {
  found(await database.deleteMilestone(getDb(), user.id, milestoneId));
}
