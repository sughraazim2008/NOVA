import type {
  BehaviourEvent,
  DailyPlan,
  DailyTask,
  Goal,
  IsoDate,
  Milestone,
  Task,
  User,
} from "@nova/types";
import { BehaviourEventSchema } from "@nova/types";
import type * as Row from "./generated/client";

// Date-only columns come back as a Date at UTC midnight; the domain uses "YYYY-MM-DD".
export const toIsoDate = (date: Date): IsoDate => date.toISOString().slice(0, 10);
export const fromIsoDate = (date: IsoDate): Date => new Date(`${date}T00:00:00.000Z`);
const toIsoDateOrNull = (date: Date | null) => (date ? toIsoDate(date) : null);
const toIsoTimeOrNull = (date: Date | null) => (date ? date.toISOString() : null);

export const toUser = (row: Row.User): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  timezone: row.timezone,
  defaultDailyCapacityMin: row.defaultDailyCapacityMin,
  lastActiveAt: toIsoTimeOrNull(row.lastActiveAt),
  gameMode: row.gameMode,
  createdAt: row.createdAt.toISOString(),
});

export const toGoal = (row: Row.Goal): Goal => ({
  id: row.id,
  userId: row.userId,
  title: row.title,
  description: row.description,
  desiredOutcome: row.desiredOutcome,
  deadline: toIsoDate(row.deadline),
  priority: row.priority,
  dailyCapacityMin: row.dailyCapacityMin,
  constraints: row.constraints,
  status: row.status,
  sourceText: row.sourceText,
  createdAt: row.createdAt.toISOString(),
});

export const toMilestone = (row: Row.Milestone): Milestone => ({
  id: row.id,
  goalId: row.goalId,
  title: row.title,
  order: row.order,
  targetDate: toIsoDateOrNull(row.targetDate),
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

export const toTask = (row: Row.Task): Task => ({
  id: row.id,
  milestoneId: row.milestoneId,
  goalId: row.goalId,
  parentTaskId: row.parentTaskId,
  title: row.title,
  description: row.description,
  estimatedMin: row.estimatedMin,
  actualMin: row.actualMin,
  priority: row.priority,
  category: row.category,
  energyDemand: row.energyDemand,
  deadline: toIsoDateOrNull(row.deadline),
  status: row.status,
  deferredUntil: toIsoDateOrNull(row.deferredUntil),
  origin: row.origin,
  startCount: row.startCount,
  postponeCount: row.postponeCount,
  completedAt: toIsoTimeOrNull(row.completedAt),
  createdAt: row.createdAt.toISOString(),
});

export const toDailyTask = (row: Row.DailyTask): DailyTask => ({
  id: row.id,
  dailyPlanId: row.dailyPlanId,
  taskId: row.taskId,
  order: row.order,
  plannedMin: row.plannedMin,
  score: row.score,
  reason: row.reason,
  outcome: row.outcome,
});

export const toDailyPlan = (row: Row.DailyPlan & { tasks: Row.DailyTask[] }): DailyPlan => ({
  id: row.id,
  userId: row.userId,
  date: toIsoDate(row.date),
  capacityMin: row.capacityMin,
  usedMin: row.usedMin,
  plannerVersion: row.plannerVersion,
  generatedAt: row.generatedAt.toISOString(),
  tasks: [...row.tasks].sort((a, b) => a.order - b.order).map(toDailyTask),
});

/** The payload is a JSON column, so it is validated on the way out as well as on the way in. */
export const toBehaviourEvent = (row: Row.BehaviourEvent): BehaviourEvent =>
  BehaviourEventSchema.parse({
    id: row.id,
    userId: row.userId,
    taskId: row.taskId,
    goalId: row.goalId,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    payload: row.payload,
  });
