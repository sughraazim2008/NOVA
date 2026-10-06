import { z } from "zod";
import { IsoDateSchema } from "./common";
import { EnergyDemandSchema, PrioritySchema, TaskCategorySchema } from "./enums";
import { GoalDailyCapacitySchema, GoalTitleSchema } from "./goal";
import { MilestoneTitleSchema } from "./milestone";
import { EstimatedMinSchema, TaskTitleSchema } from "./task";

// A draft is what the AI proposes and the user reviews. Nothing in a draft is saved until it is confirmed.

/** Temporary identifier inside a draft; real ids are assigned on save. */
export const DraftKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Use lowercase letters, digits and hyphens");

/** What the goal parser extracts from a sentence. Null means the sentence did not say. */
export const ParsedGoalSchema = z.object({
  title: GoalTitleSchema,
  desiredOutcome: z.string().trim().max(500).nullable(),
  deadline: IsoDateSchema.nullable(),
  priority: PrioritySchema,
  constraints: z.string().trim().max(1000).nullable(),
  availableMinPerDay: z.number().int().min(5).max(960).nullable(),
});
export type ParsedGoal = z.infer<typeof ParsedGoalSchema>;

export const DraftMilestoneSchema = z.object({
  key: DraftKeySchema,
  title: MilestoneTitleSchema,
  targetDate: IsoDateSchema.nullable(),
});
export type DraftMilestone = z.infer<typeof DraftMilestoneSchema>;

export const RealityVerdictSchema = z.enum(["PASS", "REWRITTEN", "SPLIT", "FLAGGED"]);
export type RealityVerdict = z.infer<typeof RealityVerdictSchema>;

/** Outcome of the Task Reality Check for one task, kept so the review screen can show before and after. */
export const RealityCheckSchema = z.object({
  verdict: RealityVerdictSchema,
  /** Why the task was changed or flagged. Empty for PASS. */
  reason: z.string().max(300),
  /** The title before it was rewritten or split. */
  original: z.string().max(200).nullable(),
});
export type RealityCheck = z.infer<typeof RealityCheckSchema>;

export const DraftTaskSchema = z.object({
  key: DraftKeySchema,
  milestoneKey: DraftKeySchema,
  title: TaskTitleSchema,
  description: z.string().trim().max(2000).nullable(),
  estimatedMin: EstimatedMinSchema,
  priority: PrioritySchema,
  category: TaskCategorySchema,
  energyDemand: EnergyDemandSchema,
  deadline: IsoDateSchema.nullable(),
  /** Keys of draft tasks that must be finished first. */
  dependsOn: z.array(DraftKeySchema).max(10),
  source: z.enum(["AI", "USER"]).default("AI"),
  realityCheck: RealityCheckSchema.nullable().default(null),
});
export type DraftTask = z.infer<typeof DraftTaskSchema>;

export const GoalDraftSchema = z.object({
  goal: z.object({
    title: GoalTitleSchema,
    description: z.string().trim().max(2000).nullable(),
    desiredOutcome: z.string().trim().max(500).nullable(),
    deadline: IsoDateSchema,
    priority: PrioritySchema,
    dailyCapacityMin: GoalDailyCapacitySchema,
    constraints: z.string().trim().max(1000).nullable(),
    sourceText: z.string().trim().max(2000).nullable(),
  }),
  milestones: z.array(DraftMilestoneSchema).min(1).max(10),
  tasks: z.array(DraftTaskSchema).max(120),
  /** Things the reviewer should know: assumptions made, checks that could not run. */
  notes: z.array(z.string().max(300)).max(10).default([]),
});
export type GoalDraft = z.infer<typeof GoalDraftSchema>;

/** The sentence a user types, plus anything they chose to state outright. */
export const DecomposeRequestSchema = z.object({
  text: z.string().trim().min(8, "Describe the goal in a sentence").max(2000),
  deadline: IsoDateSchema.optional(),
  dailyCapacityMin: GoalDailyCapacitySchema.optional(),
});
export type DecomposeRequest = z.infer<typeof DecomposeRequestSchema>;

/** A reviewed draft coming back to be saved. `aiTitles` is what the AI originally proposed, for the record of edits. */
export const ConfirmDraftRequestSchema = z.object({
  draft: GoalDraftSchema,
  aiTitles: z.array(z.object({ key: DraftKeySchema, title: z.string().max(200) })).max(120).default([]),
});
export type ConfirmDraftRequest = z.infer<typeof ConfirmDraftRequestSchema>;
