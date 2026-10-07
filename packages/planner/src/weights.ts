import type { HealthStatus, Priority } from "@nova/types";
import type { ScoreTerms } from "./types";

// Every tunable number in the planner lives in this file. docs/planning-engine.md explains each one,
// and the worked examples there pin the behaviour these values produce.

export const PLANNER_VERSION = "v1";

/** Sums to 100, so a score reads as "out of 100". */
export const WEIGHTS: Readonly<ScoreTerms> = {
  pressure: 35,
  priority: 25,
  overdue: 15,
  unblocks: 10,
  risk: 10,
  continuity: 5,
};

export const PRIORITY_VALUE: Readonly<Record<Priority, number>> = { LOW: 0.25, MEDIUM: 0.5, HIGH: 0.75, CRITICAL: 1 };

export const RISK_VALUE: Readonly<Record<HealthStatus, number>> = { ON_TRACK: 0, AT_RISK: 0.5, OFF_TRACK: 1 };

/** A task's own deadline starts to matter this many days out, and matters fully on the day. */
export const URGENCY_HORIZON_DAYS = 14;

/** Unblocking this many tasks or more earns the full "unblocks" term. */
export const UNBLOCKS_CAP = 5;

export const DEFAULT_MAX_TASKS = 5;

/** Scores are rounded to this many decimal places before comparison, so float noise can never change the order. */
export const SCORE_DECIMALS = 3;
