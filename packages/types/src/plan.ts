import { z } from "zod";
import { IdSchema, IsoDateSchema, IsoDateTimeSchema, MinutesSchema } from "./common";
import { DailyOutcomeSchema } from "./enums";

export const DailyTaskSchema = z.object({
  id: IdSchema,
  dailyPlanId: IdSchema,
  taskId: IdSchema,
  order: z.number().int().nonnegative(),
  plannedMin: z.number().int().positive(),
  score: z.number(),
  reason: z.string().min(1),
  outcome: DailyOutcomeSchema,
});
export type DailyTask = z.infer<typeof DailyTaskSchema>;

export const DailyPlanSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  date: IsoDateSchema,
  capacityMin: MinutesSchema,
  usedMin: MinutesSchema,
  plannerVersion: z.string().min(1),
  generatedAt: IsoDateTimeSchema,
  tasks: z.array(DailyTaskSchema),
});
export type DailyPlan = z.infer<typeof DailyPlanSchema>;

/** What the planning service hands to the database after the planner has run. */
export const SaveDailyPlanInputSchema = z
  .object({
    date: IsoDateSchema,
    capacityMin: MinutesSchema,
    usedMin: MinutesSchema,
    plannerVersion: z.string().min(1),
    tasks: z.array(
      z.object({
        taskId: IdSchema,
        order: z.number().int().nonnegative(),
        plannedMin: z.number().int().positive(),
        score: z.number(),
        reason: z.string().min(1),
      }),
    ),
  })
  .refine((plan) => plan.usedMin <= plan.capacityMin, {
    message: "A plan cannot use more minutes than the day has",
    path: ["usedMin"],
  })
  .refine((plan) => new Set(plan.tasks.map((t) => t.taskId)).size === plan.tasks.length, {
    message: "A task can appear in a plan only once",
    path: ["tasks"],
  });
export type SaveDailyPlanInput = z.infer<typeof SaveDailyPlanInputSchema>;
