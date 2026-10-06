import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";
import { GameModeSchema } from "./enums";

export const DailyCapacitySchema = z.number().int().min(0).max(960);

export const UserSchema = z.object({
  id: IdSchema,
  email: z.email(),
  name: z.string().nullable(),
  timezone: z.string().min(1),
  defaultDailyCapacityMin: DailyCapacitySchema,
  lastActiveAt: IsoDateTimeSchema.nullable(),
  gameMode: GameModeSchema,
  createdAt: IsoDateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserInputSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().min(1).optional(),
  defaultDailyCapacityMin: DailyCapacitySchema.optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

export const UpdateUserInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).nullable(),
    timezone: z.string().min(1),
    defaultDailyCapacityMin: DailyCapacitySchema,
    gameMode: GameModeSchema,
  })
  .partial();
export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>;
