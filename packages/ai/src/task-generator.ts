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

const KEY = /^m([1-9][0-9]?)-t([1-9][0-9]?)$/;

const OutputSchema = z.object({
  tasks: z
    .array(
      z.object({
        key: z.string().regex(KEY, 'Use "m<milestone number>-t<task number>", e.g. "m2-t1"'),
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
    .max(80),
});

export interface GenerateTasksInput {
  goal: GoalToDecompose;
  milestones: DraftMilestone[];
  hints?: string[];
}

const milestoneNumber = (key: string) => Number(KEY.exec(key)?.[1] ?? 0);

/**
 * Proposes the tasks of every milestone in one model call. One call instead of one per milestone
 * keeps a decomposition inside a free tier's per-minute limit and cuts the wait from minutes to seconds.
 */
export async function generateTasks(input: GenerateTasksInput, deps: AIDeps): Promise<Result<DraftTask[], AIError>> {
  const { goal, milestones } = input;

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
        hints: input.hints ?? [],
      }),
      schema: OutputSchema,
      semantic: ({ tasks }) => {
        const issues: string[] = [];
        const keys = new Set<string>();
        for (const task of tasks) {
          if (keys.has(task.key)) issues.push(`key "${task.key}" is used twice`);
          keys.add(task.key);
          if (milestoneNumber(task.key) > milestones.length) issues.push(`"${task.key}" names milestone ${milestoneNumber(task.key)}, but there are only ${milestones.length}`);
        }
        for (const [index, milestone] of milestones.entries()) {
          const count = tasks.filter((task) => milestoneNumber(task.key) === index + 1).length;
          if (count === 0) issues.push(`milestone m${index + 1} ("${milestone.title}") has no tasks`);
          if (count > 8) issues.push(`milestone m${index + 1} has ${count} tasks; write at most 6`);
        }
        for (const task of tasks) {
          for (const prerequisite of task.dependsOn) {
            if (prerequisite === task.key) issues.push(`"${task.key}" depends on itself`);
            else if (!keys.has(prerequisite)) issues.push(`"${task.key}" depends on "${prerequisite}", which is not a task key in this reply`);
            else if (milestoneNumber(prerequisite) > milestoneNumber(task.key)) issues.push(`"${task.key}" depends on "${prerequisite}", which belongs to a later milestone`);
          }
        }
        const cycle = findCycle(tasks);
        if (cycle) issues.push(`these tasks wait on each other in a loop: ${cycle.join(" → ")}`);
        return issues;
      },
    },
    deps,
  );
  if (!result.ok) return result;

  // Milestone order first, then the order the model wrote them in.
  const ordered = result.value.tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => milestoneNumber(a.task.key) - milestoneNumber(b.task.key) || a.index - b.index);

  return ok(
    ordered.map(({ task }) => ({
      ...task,
      milestoneKey: (milestones[milestoneNumber(task.key) - 1] as DraftMilestone).key,
      deadline: null,
      dependsOn: [...new Set(task.dependsOn)],
      source: "AI" as const,
      realityCheck: null,
    })),
  );
}
