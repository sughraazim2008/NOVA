import { z } from "zod";

export const PrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const GoalStatusSchema = z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const MilestoneStatusSchema = z.enum(["PENDING", "ACTIVE", "DONE"]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

/** Long-lived state of a task. What happened on one day is a DailyOutcome. */
export const TaskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE", "DEFERRED", "DROPPED"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskCategorySchema = z.enum([
  "WRITING",
  "READING",
  "STUDY",
  "PRACTICE",
  "CODING",
  "RESEARCH",
  "ADMIN",
  "COMMUNICATION",
  "PLANNING",
  "OTHER",
]);
export type TaskCategory = z.infer<typeof TaskCategorySchema>;

export const EnergyDemandSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type EnergyDemand = z.infer<typeof EnergyDemandSchema>;

export const TaskOriginSchema = z.enum(["USER", "AI", "SPLIT", "BLOCKER"]);
export type TaskOrigin = z.infer<typeof TaskOriginSchema>;

export const DailyOutcomeSchema = z.enum(["PENDING", "COMPLETED", "PARTIAL", "SKIPPED", "POSTPONED", "MISSED"]);
export type DailyOutcome = z.infer<typeof DailyOutcomeSchema>;

export const StartSessionOutcomeSchema = z.enum(["COMPLETED", "PARTIAL", "ABANDONED"]);
export type StartSessionOutcome = z.infer<typeof StartSessionOutcomeSchema>;

export const EventTypeSchema = z.enum([
  "TASK_CREATED",
  "TASK_STARTED",
  "TASK_COMPLETED",
  "TASK_SKIPPED",
  "TASK_POSTPONED",
  "TASK_ABANDONED",
  "FRICTION_REPORTED",
  "ESTIMATE_OVERRUN",
  "ESTIMATE_UNDERRUN",
  "DECOMPOSITION_CONFIRMED",
  "REPLAN_APPLIED",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const FrictionReasonSchema = z.enum([
  "TOO_OVERWHELMING",
  "DONT_KNOW_HOW_TO_START",
  "LOW_ENERGY",
  "DISTRACTED",
  "DONT_UNDERSTAND",
  "DONT_WANT_TO",
  "NOT_ENOUGH_TIME",
]);
export type FrictionReason = z.infer<typeof FrictionReasonSchema>;

export const ReplanActionTypeSchema = z.enum([
  "SHRINK",
  "SPLIT",
  "REWRITE",
  "MICRO_ACTIONS",
  "RETIME",
  "REPRIORITISE",
  "DEFER",
  "DROP_SUGGESTED",
]);
export type ReplanActionType = z.infer<typeof ReplanActionTypeSchema>;

export const HealthStatusSchema = z.enum(["ON_TRACK", "AT_RISK", "OFF_TRACK"]);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const EstimateDimensionSchema = z.enum(["CATEGORY", "SIZE_BUCKET", "HOUR_BAND"]);
export type EstimateDimension = z.infer<typeof EstimateDimensionSchema>;

export const SizeBucketSchema = z.enum(["UNDER_20", "20_TO_60", "OVER_60"]);
export type SizeBucket = z.infer<typeof SizeBucketSchema>;

export const GameModeSchema = z.enum(["FULL", "QUIET", "OFF"]);
export type GameMode = z.infer<typeof GameModeSchema>;

export const RescueClassSchema = z.enum(["KEEP", "DELETE", "DEFER", "TODAY"]);
export type RescueClass = z.infer<typeof RescueClassSchema>;
