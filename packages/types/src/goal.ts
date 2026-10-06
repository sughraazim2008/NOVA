import { z } from "zod";
import { IdSchema, IsoDateSchema, IsoDateTimeSchema } from "./common";
import { GoalStatusSchema, PrioritySchema } from "./enums";

export const GoalTitleSchema = z.string().trim().min(1).max(200);
export const GoalDailyCapacitySchema = z.number().int().min(5).max(960);

export const GoalSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  title: GoalTitleSchema,
  description: z.string().nullable(),
  desiredOutcome: z.string().nullable(),
  deadline: IsoDateSchema,
  priority: PrioritySchema,
  dailyCapacityMin: GoalDailyCapacitySchema,
  constraints: z.string().nullable(),
  status: GoalStatusSchema,
  sourceText: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Goal = z.infer<typeof GoalSchema>;

export const CreateGoalInputSchema = z.object({
  title: GoalTitleSchema,
  description: z.string().trim().max(2000).optional(),
  desiredOutcome: z.string().trim().max(500).optional(),
  deadline: IsoDateSchema,
  priority: PrioritySchema.default("MEDIUM"),
  dailyCapacityMin: GoalDailyCapacitySchema,
  constraints: z.string().trim().max(1000).optional(),
  sourceText: z.string().trim().max(2000).optional(),
});
export type CreateGoalInput = z.input<typeof CreateGoalInputSchema>;

export const UpdateGoalInputSchema = z
  .object({
    title: GoalTitleSchema,
    description: z.string().trim().max(2000).nullable(),
    desiredOutcome: z.string().trim().max(500).nullable(),
    deadline: IsoDateSchema,
    priority: PrioritySchema,
    dailyCapacityMin: GoalDailyCapacitySchema,
    constraints: z.string().trim().max(1000).nullable(),
    status: GoalStatusSchema,
  })
  .partial();
export type UpdateGoalInput = z.infer<typeof UpdateGoalInputSchema>;
