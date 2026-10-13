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

/** A micro-action as the model proposes it, before it becomes a step in a session. */
export const MicroActionSchema = StartStepSchema.omit({ state: true });
export type MicroAction = z.infer<typeof MicroActionSchema>;

export const StepActionSchema = z.object({
  action: z.enum(["done", "stuck", "skip"]),
  /** What is in the way, in the user's words. Only used with "stuck". */
  note: z.string().trim().max(300).optional(),
});
export type StepAction = z.infer<typeof StepActionSchema>;

export const FinishSessionSchema = z.object({ outcome: StartSessionOutcomeSchema });
export type FinishSession = z.infer<typeof FinishSessionSchema>;
