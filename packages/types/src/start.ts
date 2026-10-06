import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";
import { StartSessionOutcomeSchema } from "./enums";

export const StartStepStateSchema = z.enum(["PENDING", "DONE", "SKIPPED", "REPLACED"]);
export type StartStepState = z.infer<typeof StartStepStateSchema>;

/** One micro-action in a NOVA START session. */
export const StartStepSchema = z.object({
  instruction: z.string().trim().min(1).max(300),
  estimatedMin: z.number().int().min(1).max(5),
  doneLabel: z.string().trim().min(1).max(30),
  state: StartStepStateSchema.default("PENDING"),
});
export type StartStep = z.infer<typeof StartStepSchema>;

export const StartStepsSchema = z.array(StartStepSchema).min(1).max(30);

export const StartSessionSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  taskId: IdSchema,
  steps: StartStepsSchema,
  currentStep: z.number().int().nonnegative(),
  stuckCount: z.number().int().nonnegative(),
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable(),
  outcome: StartSessionOutcomeSchema.nullable(),
});
export type StartSession = z.infer<typeof StartSessionSchema>;
