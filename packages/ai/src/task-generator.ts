import {
  EnergyDemandSchema,
  PrioritySchema,
  TaskCategorySchema,
  TaskTitleSchema,
  ok,
  type DraftMilestone,
  type DraftTask,
  type Result,
} from "@nova/types";
import { z } from "zod";
import { findCycle } from "./draft";
import type { GoalToDecompose } from "./goal-decomposer";
import { TASK_GENERATOR_SYSTEM, TASK_GENERATOR_VERSION, taskGeneratorUser } from "./prompts/task-generator";
import { generateValidated, type AIDeps, type AIError } from "./structured";

const OutputSchema = z.object({
  tasks: z
    .array(
      z.object({
        ref: z.string().regex(/^t[1-9][0-9]?$/, 'Use "t1", "t2", …'),
        title: TaskTitleSchema,
        description: z.string().trim().max(2000).nullable(),
        estimatedMin: z.number().int().min(5).max(480),
        priority: PrioritySchema,
        category: TaskCategorySchema,
        energyDemand: EnergyDemandSchema,
        dependsOn: z.array(z.string()).max(10),
      }),
    )
    .min(2)
    .max(8),
});

export interface GenerateTasksInput {
  goal: GoalToDecompose;
  milestones: DraftMilestone[];
  /** Position in `milestones` of the one to write tasks for. */
  milestoneIndex: number;
  /** Tasks already written for earlier milestones; the new ones may depend on them. */
  earlierTasks: DraftTask[];
  hints?: string[];
}

/** Proposes the tasks of one milestone. Task keys are "<milestone key>-<ref>", e.g. "m2-t3". */
export async function generateTasks(input: GenerateTasksInput, deps: AIDeps): Promise<Result<DraftTask[], AIError>> {
  const { goal, milestones, milestoneIndex, earlierTasks } = input;
  const milestone = milestones[milestoneIndex];
  if (!milestone) throw new Error(`generateTasks: no milestone at index ${milestoneIndex}`);
  const earlierKeys = new Set(earlierTasks.map((task) => task.key));
  const toKey = (ref: string) => (earlierKeys.has(ref) ? ref : `${milestone.key}-${ref}`);

  const result = await generateValidated(
    {
      task: "task-generator",
      promptVersion: TASK_GENERATOR_VERSION,
      system: TASK_GENERATOR_SYSTEM,
      user: taskGeneratorUser({
        goalTitle: goal.title,
        desiredOutcome: goal.desiredOutcome,
        constraints: goal.constraints,
        dailyCapacityMin: goal.dailyCapacityMin,
        milestones,
        milestoneIndex,
        earlierTasks,
        hints: input.hints ?? [],
      }),
      schema: OutputSchema,
      semantic: ({ tasks }) => {
        const issues: string[] = [];
        const refs = new Set<string>();
        for (const task of tasks) {
          if (refs.has(task.ref)) issues.push(`ref "${task.ref}" is used twice`);
          refs.add(task.ref);
        }
        for (const task of tasks) {
          for (const prerequisite of task.dependsOn) {
            if (prerequisite === task.ref) issues.push(`"${task.title}" depends on itself`);
            else if (!refs.has(prerequisite) && !earlierKeys.has(prerequisite)) {
              issues.push(`"${task.title}" depends on "${prerequisite}", which is neither a ref in this reply nor an earlier task key`);
            }
          }
        }
        const cycle = findCycle(tasks.map((task) => ({ key: task.ref, dependsOn: task.dependsOn })));
        if (cycle) issues.push(`these tasks wait on each other in a loop: ${cycle.join(" → ")}`);
        return issues;
      },
    },
    deps,
  );
  if (!result.ok) return result;

  return ok(
    result.value.tasks.map(({ ref, dependsOn, ...task }) => ({
      ...task,
      key: toKey(ref),
      milestoneKey: milestone.key,
      deadline: null,
      dependsOn: [...new Set(dependsOn.map(toKey))],
      source: "AI" as const,
      realityCheck: null,
    })),
  );
}
