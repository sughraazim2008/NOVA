import type { IsoDate } from "@nova/types";
import { clamp, daysBetween } from "./dates";
import type { PlannerGoal, PlannerTask, ScoreTerms } from "./types";
import { PRIORITY_VALUE, RISK_VALUE, SCORE_DECIMALS, UNBLOCKS_CAP, URGENCY_HORIZON_DAYS, WEIGHTS } from "./weights";

export interface ScoreContext {
  today: IsoDate;
  goal: PlannerGoal;
  /** Adjusted minutes of all the goal's unfinished tasks. */
  goalRemainingMin: number;
  /** Unfinished tasks that depend on this one, directly or through a chain. */
  downstream: number;
}

/** Days the goal still has, counting today and the deadline day; never less than 1. */
export const daysLeft = (today: IsoDate, deadline: IsoDate): number => Math.max(1, daysBetween(today, deadline) + 1);

/** Share of the goal's remaining time that its remaining work needs, from 0 to 1. */
export function goalPressure(today: IsoDate, goal: PlannerGoal, remainingMin: number): number {
  const availableMin = daysLeft(today, goal.deadline) * goal.dailyCapacityMin;
  if (remainingMin <= 0) return 0;
  if (availableMin <= 0) return 1;
  return clamp(remainingMin / availableMin, 0, 1);
}

/** 0 when the task's own deadline is two weeks away or more, rising to 1 on the day and after. */
export function taskUrgency(today: IsoDate, deadline: IsoDate | null | undefined): number {
  if (!deadline) return 0;
  return clamp(1 - daysBetween(today, deadline) / URGENCY_HORIZON_DAYS, 0, 1);
}

export const roundScore = (score: number): number => {
  const factor = 10 ** SCORE_DECIMALS;
  return Math.round(score * factor) / factor;
};

/** The six terms, each 0–1, and their weighted sum out of 100. */
export function scoreTask(task: PlannerTask, context: ScoreContext): { score: number; terms: ScoreTerms } {
  const { today, goal } = context;
  const terms: ScoreTerms = {
    pressure: Math.max(goalPressure(today, goal, context.goalRemainingMin), taskUrgency(today, task.deadline)),
    priority: (PRIORITY_VALUE[task.priority] + PRIORITY_VALUE[goal.priority]) / 2,
    overdue: task.deadline && task.deadline < today ? 1 : 0,
    unblocks: Math.min(context.downstream, UNBLOCKS_CAP) / UNBLOCKS_CAP,
    risk: goal.health ? RISK_VALUE[goal.health] : 0,
    continuity: task.status === "IN_PROGRESS" ? 1 : 0,
  };
  const score = (Object.keys(WEIGHTS) as (keyof ScoreTerms)[]).reduce((sum, term) => sum + WEIGHTS[term] * terms[term], 0);
  return { score: roundScore(score), terms };
}
