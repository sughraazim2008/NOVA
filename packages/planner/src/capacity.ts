import { PlannerInputError } from "./types";

export interface CapacityArgs {
  /** The user's total budget for a day. */
  userDailyCapacityMin: number;
  /** What the user allotted to each ACTIVE goal. */
  activeGoalCapacitiesMin: number[];
  /** Minutes of work already done today. */
  usedTodayMin?: number;
  /**
   * Minutes of the day taken by other commitments. Always 0 in v1; a calendar source (Phase 15)
   * supplies it without anything else in the planner changing.
   */
  busyMin?: number;
}

/**
 * Minutes NOVA may plan for a day.
 *
 * The user's figure is the day's budget; each goal's figure is what they intend for that goal.
 * NOVA never plans more than the budget, and never more than the goals were offered in total.
 */
export function capacityForDate(args: CapacityArgs): number {
  const { userDailyCapacityMin, activeGoalCapacitiesMin, usedTodayMin = 0, busyMin = 0 } = args;
  for (const value of [userDailyCapacityMin, usedTodayMin, busyMin, ...activeGoalCapacitiesMin]) {
    if (!Number.isFinite(value) || value < 0) throw new PlannerInputError("INVALID_NUMBER", `Capacity values must be zero or more; got ${value}.`);
  }
  const offered = activeGoalCapacitiesMin.reduce((sum, minutes) => sum + minutes, 0);
  return Math.max(0, Math.floor(Math.min(userDailyCapacityMin, offered) - busyMin - usedTodayMin));
}
