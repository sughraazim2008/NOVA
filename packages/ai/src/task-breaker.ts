import { MicroActionSchema, ok, type MicroAction, type Result } from "@nova/types";
import { z } from "zod";
import {
  STEP_REPLACER_SYSTEM,
  STEP_REPLACER_VERSION,
  TASK_BREAKER_SYSTEM,
  TASK_BREAKER_VERSION,
  stepReplacerUser,
  taskBreakerUser,
} from "./prompts/task-breaker";
import { generateValidated, type AIDeps, type AIError } from "./structured";

export interface BreakIntoStepsInput {
  goalTitle: string;
  milestoneTitle?: string | null;
  task: { title: string; description: string | null; estimatedMin: number };
  earlierFriction?: string[];
}

const StepsSchema = z.object({ steps: z.array(MicroActionSchema).min(3).max(7) });

/** The opening micro-actions for a task, written at the moment the user presses Start. */
export async function breakIntoSteps(input: BreakIntoStepsInput, deps: AIDeps): Promise<Result<MicroAction[], AIError>> {
  const result = await generateValidated(
    {
      task: "task-breaker",
      promptVersion: TASK_BREAKER_VERSION,
      system: TASK_BREAKER_SYSTEM,
      user: taskBreakerUser({
        goalTitle: input.goalTitle,
        milestoneTitle: input.milestoneTitle ?? null,
        taskTitle: input.task.title,
        taskDescription: input.task.description,
        estimatedMin: input.task.estimatedMin,
        earlierFriction: input.earlierFriction ?? [],
      }),
      schema: StepsSchema,
      semantic: ({ steps }) => ((steps[0]?.estimatedMin ?? 0) > 2 ? ["the first action must take 1 or 2 minutes"] : []),
    },
    deps,
  );
  return result.ok ? ok(result.value.steps) : result;
}

/**
 * The opener used when no model is available or its answer could not be used: get in place,
 * find the spot, make one rough mark. Generic, but it always exists, so Start never fails.
 */
export function fallbackSteps(task: { title: string }): MicroAction[] {
  return [
    { instruction: `Open or get out whatever you need for: ${task.title}`, estimatedMin: 1, doneLabel: "It's open" },
    { instruction: "Find the exact place where this task begins.", estimatedMin: 2, doneLabel: "Found it" },
    { instruction: "Do the smallest first piece you can see. Rough is fine; it only has to exist.", estimatedMin: 5, doneLabel: "Done" },
    { instruction: "Carry on from there for five more minutes.", estimatedMin: 5, doneLabel: "Done" },
  ];
}

export interface ReplaceStepInput {
  taskTitle: string;
  step: Pick<MicroAction, "instruction" | "estimatedMin">;
  note?: string | null;
}

/** A smaller or clearer action to stand in for one the user is stuck on. */
export function replaceStep(input: ReplaceStepInput, deps: AIDeps): Promise<Result<MicroAction, AIError>> {
  return generateValidated(
    {
      task: "step-replacer",
      promptVersion: STEP_REPLACER_VERSION,
      system: STEP_REPLACER_SYSTEM,
      user: stepReplacerUser({
        taskTitle: input.taskTitle,
        instruction: input.step.instruction,
        estimatedMin: input.step.estimatedMin,
        note: input.note?.trim() || null,
      }),
      schema: MicroActionSchema,
      semantic: (step) =>
        input.step.estimatedMin > 1 && step.estimatedMin >= input.step.estimatedMin
          ? [`estimatedMin must be less than ${input.step.estimatedMin}, the action it replaces`]
          : [],
    },
    deps,
  );
}

/** The replacement used when the model cannot help: the same action, cut down to two minutes. */
export function fallbackReplacement(step: Pick<MicroAction, "instruction" | "estimatedMin">): MicroAction {
  return {
    instruction: `Set a timer for 2 minutes and do only the very first part of this, then stop: ${step.instruction}`.slice(0, 300),
    estimatedMin: Math.max(1, Math.min(2, step.estimatedMin - 1)),
    doneLabel: "Timer's done",
  };
}
