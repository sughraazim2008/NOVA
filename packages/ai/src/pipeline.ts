import { GoalDraftSchema, err, ok, type DecomposeRequest, type DraftTask, type GoalDraft, type IsoDate, type Result } from "@nova/types";
import { budgetNote, validateDraft } from "./draft";
import { decomposeGoal, type GoalToDecompose } from "./goal-decomposer";
import { parseGoal } from "./goal-parser";
import type { AIDeps, AIError } from "./structured";
import { generateTasks } from "./task-generator";
import { realityCheck } from "./task-reality-check";

export type DecomposeError =
  | AIError
  /** Neither the sentence nor the form gave a deadline; the user has to supply one. */
  | { kind: "NEEDS_DEADLINE"; parsedTitle: string };

export interface DecomposeContext {
  today: IsoDate;
  /** The user's usual minutes per day, used when the sentence does not say. */
  defaultDailyCapacityMin: number;
  hints?: string[];
}

/**
 * Sentence → reviewed-ready draft: parse → milestones → tasks per milestone → validation →
 * Task Reality Check. Returns a draft only; saving happens elsewhere, after a person confirms it.
 */
export async function decomposeGoalText(
  request: DecomposeRequest,
  context: DecomposeContext,
  deps: AIDeps,
): Promise<Result<GoalDraft, DecomposeError>> {
  const { today } = context;

  const parsed = await parseGoal({ text: request.text, today }, deps);
  if (!parsed.ok) return parsed;

  // What the user stated outright wins over what the model read into the sentence.
  const deadline = request.deadline ?? parsed.value.deadline;
  if (!deadline) return err({ kind: "NEEDS_DEADLINE", parsedTitle: parsed.value.title });
  if (deadline < today) return err({ kind: "INVALID_OUTPUT", issues: [`The deadline ${deadline} is in the past.`] });
  const dailyCapacityMin = Math.max(5, request.dailyCapacityMin ?? parsed.value.availableMinPerDay ?? context.defaultDailyCapacityMin);
  const goal: GoalToDecompose = { ...parsed.value, deadline, dailyCapacityMin };

  const milestones = await decomposeGoal({ goal, today }, deps);
  if (!milestones.ok) return milestones;

  // One milestone at a time, so each can depend on the tasks written before it.
  const tasks: DraftTask[] = [];
  for (const index of milestones.value.keys()) {
    const generated = await generateTasks(
      { goal, milestones: milestones.value, milestoneIndex: index, earlierTasks: [...tasks], hints: context.hints ?? [] },
      deps,
    );
    if (!generated.ok) return generated;
    tasks.push(...generated.value);
  }

  const draft: GoalDraft = {
    goal: {
      title: goal.title,
      description: null,
      desiredOutcome: goal.desiredOutcome,
      deadline,
      priority: goal.priority,
      dailyCapacityMin,
      constraints: goal.constraints,
      sourceText: request.text,
    },
    milestones: milestones.value,
    tasks,
    notes: [],
  };

  const checked = await realityCheck(draft, deps);
  draft.tasks = checked.tasks;
  if (checked.degraded) draft.notes.push("The AI review of the tasks could not run, so only the basic checks were applied. Read the tasks carefully.");
  if (!request.deadline && !parsed.value.deadline) draft.notes.push("No deadline was found in your sentence.");
  const budget = budgetNote(draft, today);
  if (budget) draft.notes.push(budget);

  const issues = validateDraft(draft, today);
  if (issues.length > 0) return err({ kind: "INVALID_OUTPUT", issues });
  return ok(GoalDraftSchema.parse(draft));
}
