import { IsoDateSchema, MilestoneTitleSchema, ok, type DraftMilestone, type IsoDate, type ParsedGoal, type Result } from "@nova/types";
import { z } from "zod";
import { GOAL_DECOMPOSER_SYSTEM, GOAL_DECOMPOSER_VERSION, goalDecomposerUser } from "./prompts/goal-decomposer";
import { generateValidated, type AIDeps, type AIError } from "./structured";

const OutputSchema = z.object({
  milestones: z.array(z.object({ title: MilestoneTitleSchema, targetDate: IsoDateSchema.nullable() })).min(3).max(7),
});

export type GoalToDecompose = ParsedGoal & { deadline: IsoDate; dailyCapacityMin: number };

/** Proposes the ordered stages of a goal. Keys (m1, m2, …) are assigned here, not by the model. */
export async function decomposeGoal(
  input: { goal: GoalToDecompose; today: IsoDate },
  deps: AIDeps,
): Promise<Result<DraftMilestone[], AIError>> {
  const { goal, today } = input;
  const result = await generateValidated(
    {
      task: "goal-decomposer",
      promptVersion: GOAL_DECOMPOSER_VERSION,
      system: GOAL_DECOMPOSER_SYSTEM,
      user: goalDecomposerUser(goal, today),
      schema: OutputSchema,
      semantic: ({ milestones }) => {
        const issues: string[] = [];
        const titles = new Set<string>();
        let previous = today;
        for (const milestone of milestones) {
          const title = milestone.title.toLowerCase();
          if (titles.has(title)) issues.push(`milestone "${milestone.title}" appears twice`);
          titles.add(title);
          if (!milestone.targetDate) continue;
          if (milestone.targetDate < today) issues.push(`"${milestone.title}" is dated before today (${today})`);
          if (milestone.targetDate > goal.deadline) issues.push(`"${milestone.title}" is dated after the goal deadline (${goal.deadline})`);
          if (milestone.targetDate < previous) issues.push(`"${milestone.title}" is dated earlier than the milestone before it`);
          previous = milestone.targetDate;
        }
        return issues;
      },
    },
    deps,
  );
  if (!result.ok) return result;
  return ok(result.value.milestones.map((milestone, index) => ({ key: `m${index + 1}`, ...milestone })));
}
