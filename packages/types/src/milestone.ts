import { z } from "zod";
import { IdSchema, IsoDateSchema, IsoDateTimeSchema } from "./common";
import { MilestoneStatusSchema } from "./enums";

export const MilestoneTitleSchema = z.string().trim().min(1).max(200);

export const MilestoneSchema = z.object({
  id: IdSchema,
  goalId: IdSchema,
  title: MilestoneTitleSchema,
  order: z.number().int().nonnegative(),
  targetDate: IsoDateSchema.nullable(),
  status: MilestoneStatusSchema,
  createdAt: IsoDateTimeSchema,
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const CreateMilestoneInputSchema = z.object({
  title: MilestoneTitleSchema,
  /** Appended after the last milestone when omitted. */
  order: z.number().int().nonnegative().optional(),
  targetDate: IsoDateSchema.optional(),
});
export type CreateMilestoneInput = z.infer<typeof CreateMilestoneInputSchema>;

export const UpdateMilestoneInputSchema = z
  .object({
    title: MilestoneTitleSchema,
    targetDate: IsoDateSchema.nullable(),
    status: MilestoneStatusSchema,
  })
  .partial();
export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneInputSchema>;
