import { z } from "zod";
import { IdSchema, IsoDateSchema, IsoDateTimeSchema } from "./common";
import {
  EnergyDemandSchema,
  PrioritySchema,
  TaskCategorySchema,
  TaskOriginSchema,
  TaskStatusSchema,
} from "./enums";

export const TaskTitleSchema = z.string().trim().min(1).max(200);

/** One task is at most a working day; anything longer must be split. */
export const EstimatedMinSchema = z.number().int().min(1).max(480);

export const TaskSchema = z.object({
  id: IdSchema,
  milestoneId: IdSchema,
  goalId: IdSchema,
  parentTaskId: IdSchema.nullable(),
  title: TaskTitleSchema,
  description: z.string().nullable(),
  estimatedMin: EstimatedMinSchema,
  actualMin: z.number().int().nonnegative().nullable(),
  priority: PrioritySchema,
  category: TaskCategorySchema,
  energyDemand: EnergyDemandSchema,
  deadline: IsoDateSchema.nullable(),
  status: TaskStatusSchema,
  deferredUntil: IsoDateSchema.nullable(),
  origin: TaskOriginSchema,
  startCount: z.number().int().nonnegative(),
  postponeCount: z.number().int().nonnegative(),
  completedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskInputSchema = z.object({
  title: TaskTitleSchema,
  description: z.string().trim().max(2000).optional(),
  estimatedMin: EstimatedMinSchema,
  priority: PrioritySchema.default("MEDIUM"),
  category: TaskCategorySchema.default("OTHER"),
  energyDemand: EnergyDemandSchema.default("MEDIUM"),
  deadline: IsoDateSchema.optional(),
  origin: TaskOriginSchema.default("USER"),
  parentTaskId: IdSchema.optional(),
});
export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z
  .object({
    title: TaskTitleSchema,
    description: z.string().trim().max(2000).nullable(),
    estimatedMin: EstimatedMinSchema,
    priority: PrioritySchema,
    category: TaskCategorySchema,
    energyDemand: EnergyDemandSchema,
    deadline: IsoDateSchema.nullable(),
    status: TaskStatusSchema,
    deferredUntil: IsoDateSchema.nullable(),
  })
  .partial()
  .refine((input) => input.status !== "DEFERRED" || typeof input.deferredUntil === "string", {
    message: "A deferred task needs a deferredUntil date",
    path: ["deferredUntil"],
  });
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const TaskDependencySchema = z
  .object({
    taskId: IdSchema,
    dependsOnTaskId: IdSchema,
  })
  .refine((dep) => dep.taskId !== dep.dependsOnTaskId, {
    message: "A task cannot depend on itself",
    path: ["dependsOnTaskId"],
  });
export type TaskDependency = z.infer<typeof TaskDependencySchema>;
