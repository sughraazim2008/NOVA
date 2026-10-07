import type { HealthStatus, IsoDate, IsoDateTime, Priority, TaskStatus } from "@nova/types";

// Plain data in, plain data out. Nothing here knows about the database, the web framework or the model.

export interface PlannerGoal {
  id: string;
  title: string;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  priority: Priority;
  deadline: IsoDate;
  /** Minutes per day the user intends to give this goal. Used for deadline pressure. */
  dailyCapacityMin: number;
  /** Absent until goal health exists (Phase 10). */
  health?: HealthStatus;
}

export interface PlannerTask {
  id: string;
  goalId: string;
  status: TaskStatus;
  priority: Priority;
  estimatedMin: number;
  category: string;
  /** The task's own deadline, if it has one. */
  deadline?: IsoDate | null;
  milestoneTargetDate?: IsoDate | null;
  /** Only meaningful when status is DEFERRED. */
  deferredUntil?: IsoDate | null;
  /** Used only to break ties. */
  createdAt: IsoDateTime;
}

export interface PlannerDependency {
  taskId: string;
  dependsOnTaskId: string;
}

export interface PlannerInput {
  /** The user's calendar date. Injected: the planner never reads the clock. */
  today: IsoDate;
  /** From capacityForDate, already net of time used today. */
  dayCapacityMin: number;
  goals: PlannerGoal[];
  /** Every task of the goals above, finished ones included, so that dependencies can be resolved. */
  tasks: PlannerTask[];
  dependencies: PlannerDependency[];
  /** Personal duration multipliers by category. Empty until the execution model exists (Phase 9). */
  multipliers?: { category: string; multiplier: number }[];
  /** Tasks the user already acted on today (completed in part, skipped, postponed). Never planned again today. */
  handledTodayTaskIds?: string[];
  /** Default 5. A short list is a product rule, not a capacity limit. */
  maxTasks?: number;
}

export type ExclusionReason =
  | "GOAL_INACTIVE"
  | "DEFERRED"
  | "BLOCKED"
  | "HANDLED_TODAY"
  | "MAX_TASKS"
  | "LONGER_THAN_CAPACITY"
  | "NO_CAPACITY";

/** Each term is between 0 and 1, before weighting. */
export interface ScoreTerms {
  pressure: number;
  priority: number;
  overdue: number;
  unblocks: number;
  risk: number;
  continuity: number;
}

export interface PlannedTask {
  taskId: string;
  order: number;
  plannedMin: number;
  score: number;
  terms: ScoreTerms;
  reason: string;
}

export interface ExcludedTask {
  taskId: string;
  why: ExclusionReason;
  /** True when the task can never fit in a day as it stands and must be broken up. */
  needsSplit: boolean;
}

export interface PlannerOutput {
  date: IsoDate;
  dayCapacityMin: number;
  usedMin: number;
  tasks: PlannedTask[];
  excluded: ExcludedTask[];
  plannerVersion: string;
}

/** The input itself is wrong (a cycle, an unknown id, a negative number). The planner never guesses past bad data. */
export class PlannerInputError extends Error {
  constructor(
    readonly code: "CYCLE" | "UNKNOWN_TASK" | "UNKNOWN_GOAL" | "SELF_DEPENDENCY" | "INVALID_NUMBER" | "DUPLICATE_ID",
    message: string,
  ) {
    super(message);
    this.name = "PlannerInputError";
  }
}
