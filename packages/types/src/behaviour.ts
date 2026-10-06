import { z } from "zod";
import { IdSchema, IsoDateSchema, IsoDateTimeSchema } from "./common";
import {
  EnergyDemandSchema,
  EstimateDimensionSchema,
  FrictionReasonSchema,
  HealthStatusSchema,
  ReplanActionTypeSchema,
  SizeBucketSchema,
  TaskCategorySchema,
  TaskOriginSchema,
} from "./enums";

/**
 * State of the task at the moment of the event. Stored with every task event so later
 * analysis does not depend on the task still existing or being unchanged.
 */
export const TaskSnapshotSchema = z.object({
  estimatedMin: z.number().int().positive(),
  category: TaskCategorySchema,
  energyDemand: EnergyDemandSchema,
  sizeBucket: SizeBucketSchema,
  localHour: z.number().int().min(0).max(23),
  /** 0 = Sunday … 6 = Saturday, in the user's timezone. */
  dayOfWeek: z.number().int().min(0).max(6),
  postponeCount: z.number().int().nonnegative(),
  startCount: z.number().int().nonnegative(),
});
export type TaskSnapshot = z.infer<typeof TaskSnapshotSchema>;

const ratio = z.number().positive();

export const EventPayloadSchemas = {
  TASK_CREATED: TaskSnapshotSchema.extend({ origin: TaskOriginSchema }),
  TASK_STARTED: TaskSnapshotSchema.extend({ viaNovaStart: z.boolean() }),
  TASK_COMPLETED: TaskSnapshotSchema.extend({
    actualMin: z.number().int().nonnegative(),
    ratio,
    sessions: z.number().int().nonnegative(),
  }),
  TASK_SKIPPED: TaskSnapshotSchema.extend({ plannedMin: z.number().int().positive() }),
  TASK_POSTPONED: TaskSnapshotSchema.extend({ toDate: IsoDateSchema }),
  TASK_ABANDONED: TaskSnapshotSchema.extend({ cause: z.enum(["LEFT_UNFINISHED", "REPEATED_POSTPONE"]) }),
  FRICTION_REPORTED: TaskSnapshotSchema.extend({ reason: FrictionReasonSchema, hasNote: z.boolean() }),
  ESTIMATE_OVERRUN: TaskSnapshotSchema.extend({ actualMin: z.number().int().nonnegative(), ratio }),
  ESTIMATE_UNDERRUN: TaskSnapshotSchema.extend({ actualMin: z.number().int().nonnegative(), ratio }),
  DECOMPOSITION_CONFIRMED: z.object({
    accepted: z.number().int().nonnegative(),
    edited: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    added: z.number().int().nonnegative(),
    edits: z.array(z.object({ before: z.string(), after: z.string() })),
  }),
  REPLAN_APPLIED: z.object({
    actions: z.array(
      z.object({
        taskId: IdSchema,
        action: ReplanActionTypeSchema,
        frictionReason: FrictionReasonSchema.nullable(),
      }),
    ),
  }),
} as const;

const eventBase = {
  id: IdSchema,
  userId: IdSchema,
  taskId: IdSchema.nullable(),
  goalId: IdSchema.nullable(),
  occurredAt: IsoDateTimeSchema,
};

const eventOf = <T extends keyof typeof EventPayloadSchemas>(type: T) =>
  z.object({ ...eventBase, type: z.literal(type), payload: EventPayloadSchemas[type] });

/** A recorded fact. Events are appended and never changed. */
export const BehaviourEventSchema = z.discriminatedUnion("type", [
  eventOf("TASK_CREATED"),
  eventOf("TASK_STARTED"),
  eventOf("TASK_COMPLETED"),
  eventOf("TASK_SKIPPED"),
  eventOf("TASK_POSTPONED"),
  eventOf("TASK_ABANDONED"),
  eventOf("FRICTION_REPORTED"),
  eventOf("ESTIMATE_OVERRUN"),
  eventOf("ESTIMATE_UNDERRUN"),
  eventOf("DECOMPOSITION_CONFIRMED"),
  eventOf("REPLAN_APPLIED"),
]);
export type BehaviourEvent = z.infer<typeof BehaviourEventSchema>;

const newEventOf = <T extends keyof typeof EventPayloadSchemas>(type: T) =>
  z.object({
    type: z.literal(type),
    taskId: IdSchema.optional(),
    goalId: IdSchema.optional(),
    occurredAt: IsoDateTimeSchema,
    payload: EventPayloadSchemas[type],
  });

/** An event about to be recorded. The timestamp is supplied by the caller, never read from the clock here. */
export const NewBehaviourEventSchema = z.discriminatedUnion("type", [
  newEventOf("TASK_CREATED"),
  newEventOf("TASK_STARTED"),
  newEventOf("TASK_COMPLETED"),
  newEventOf("TASK_SKIPPED"),
  newEventOf("TASK_POSTPONED"),
  newEventOf("TASK_ABANDONED"),
  newEventOf("FRICTION_REPORTED"),
  newEventOf("ESTIMATE_OVERRUN"),
  newEventOf("ESTIMATE_UNDERRUN"),
  newEventOf("DECOMPOSITION_CONFIRMED"),
  newEventOf("REPLAN_APPLIED"),
]);
export type NewBehaviourEvent = z.infer<typeof NewBehaviourEventSchema>;

export const FrictionEventSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  taskId: IdSchema,
  reason: FrictionReasonSchema,
  note: z.string().nullable(),
  occurredAt: IsoDateTimeSchema,
  appliedAction: ReplanActionTypeSchema.nullable(),
  startedAfter: z.boolean().nullable(),
});
export type FrictionEvent = z.infer<typeof FrictionEventSchema>;

export const ExecutionEstimateSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  dimension: EstimateDimensionSchema,
  key: z.string().min(1),
  multiplier: z.number().positive(),
  completionRate: z.number().min(0).max(1),
  sampleSize: z.number().int().nonnegative(),
});
export type ExecutionEstimate = z.infer<typeof ExecutionEstimateSchema>;

export const GoalProjectionSchema = z.object({
  id: IdSchema,
  goalId: IdSchema,
  computedAt: IsoDateTimeSchema,
  projectedDate: IsoDateSchema,
  status: HealthStatusSchema,
  requiredMinPerDay: z.number().int().nonnegative(),
  remainingMin: z.number().int().nonnegative(),
  explanation: z.string().min(1),
});
export type GoalProjection = z.infer<typeof GoalProjectionSchema>;
