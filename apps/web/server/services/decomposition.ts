import { SAMPLE_SENTENCES, decomposeGoalText, sampleDraft, validateDraft } from "@nova/ai";
import * as database from "@nova/database";
import { getDb, inTransaction } from "@nova/database";
import type { ConfirmDraftRequest, DecomposeRequest, Goal, GoalDraft, User } from "@nova/types";
import { aiDeps, getLLM } from "../ai";
import { todayIn } from "../clock";
import { onTaskCreated } from "../hooks/behaviour";
import { HttpError } from "../http";

export interface AIStatus {
  /** "live" when a model is configured; "sample" when only the pre-written examples are available. */
  mode: "live" | "sample";
  model: string | null;
  examples: string[];
}

export function aiStatus(): AIStatus {
  const llm = getLLM();
  return { mode: llm ? "live" : "sample", model: llm ? llm.model : null, examples: SAMPLE_SENTENCES };
}

/** Sentence → draft. Saves nothing. */
export async function decompose(user: User, request: DecomposeRequest): Promise<GoalDraft> {
  const context = { today: todayIn(user.timezone), defaultDailyCapacityMin: user.defaultDailyCapacityMin };
  const llm = getLLM();

  if (!llm) {
    const sample = sampleDraft(request, context);
    if (sample) return sample;
    throw new HttpError(
      "AI_UNAVAILABLE",
      "No AI model is connected yet, so only the example sentences work. Pick an example, or build the goal by hand.",
    );
  }

  const result = await decomposeGoalText(request, context, aiDeps(llm));
  if (result.ok) return result.value;

  switch (result.error.kind) {
    case "NEEDS_DEADLINE":
      throw new HttpError("VALIDATION_FAILED", "When do you want this done by? Add a deadline and try again.", [
        { path: "deadline", message: "No deadline was found in your sentence." },
      ]);
    case "INVALID_OUTPUT":
      console.error(JSON.stringify({ level: "warn", event: "decomposition_invalid", issues: result.error.issues }));
      throw new HttpError("AI_UNAVAILABLE", "The AI could not produce a usable plan this time. Try again, or build the goal by hand.");
    case "REFUSED":
      throw new HttpError("VALIDATION_FAILED", "The AI declined to plan this goal. Try describing it differently.");
    default:
      throw new HttpError("AI_UNAVAILABLE", "The AI service is not responding right now. Try again in a moment, or build the goal by hand.");
  }
}

/**
 * Saves a reviewed draft: goal, milestones, tasks and dependencies in one transaction.
 * The draft arrives from the browser, so it is validated again here exactly as AI output is.
 */
export async function confirm(user: User, request: ConfirmDraftRequest): Promise<Goal> {
  const { draft, aiTitles } = request;
  const issues = validateDraft(draft, todayIn(user.timezone));
  if (issues.length > 0) {
    throw new HttpError("VALIDATION_FAILED", "This plan has problems that must be fixed before saving.", issues.map((message) => ({ path: "draft", message })));
  }

  return inTransaction(getDb(), async (tx) => {
    const { sourceText, description, desiredOutcome, constraints, ...goalInput } = draft.goal;
    const goal = await database.createGoal(tx, user.id, {
      ...goalInput,
      ...(description ? { description } : {}),
      ...(desiredOutcome ? { desiredOutcome } : {}),
      ...(constraints ? { constraints } : {}),
      ...(sourceText ? { sourceText } : {}),
    });

    const milestoneIds = new Map<string, string>();
    for (const milestone of draft.milestones) {
      const created = await database.createMilestone(tx, user.id, goal.id, {
        title: milestone.title,
        ...(milestone.targetDate ? { targetDate: milestone.targetDate } : {}),
      });
      if (!created) throw new Error("confirm: milestone could not be created");
      milestoneIds.set(milestone.key, created.id);
    }

    const taskIds = new Map<string, string>();
    for (const task of draft.tasks) {
      const created = await database.createTask(tx, user.id, milestoneIds.get(task.milestoneKey) as string, {
        title: task.title,
        estimatedMin: task.estimatedMin,
        priority: task.priority,
        category: task.category,
        energyDemand: task.energyDemand,
        origin: task.source,
        ...(task.description ? { description: task.description } : {}),
        ...(task.deadline ? { deadline: task.deadline } : {}),
      });
      if (!created) throw new Error("confirm: task could not be created");
      taskIds.set(task.key, created.id);
      await onTaskCreated(tx, user, created);
    }

    for (const task of draft.tasks) {
      for (const prerequisite of task.dependsOn) {
        const result = await database.addDependency(tx, user.id, {
          taskId: taskIds.get(task.key) as string,
          dependsOnTaskId: taskIds.get(prerequisite) as string,
        });
        // validateDraft has already ruled these out; reaching here means a bug, so abort the save.
        if (!result.ok) throw new Error(`confirm: dependency rejected (${result.error})`);
      }
    }

    await database.recordEvent(tx, user.id, {
      type: "DECOMPOSITION_CONFIRMED",
      goalId: goal.id,
      occurredAt: new Date().toISOString(),
      payload: summariseEdits(draft, aiTitles),
    });

    return goal;
  });
}

/** What the reviewer did to the AI's proposal: the raw material for improving the prompts later. */
function summariseEdits(draft: GoalDraft, aiTitles: ConfirmDraftRequest["aiTitles"]) {
  const proposed = new Map(aiTitles.map((entry) => [entry.key, entry.title]));
  const kept = new Map(draft.tasks.map((task) => [task.key, task.title]));
  const edits: { before: string; after: string }[] = [];
  let accepted = 0;
  for (const [key, before] of proposed) {
    const after = kept.get(key);
    if (after === undefined) continue;
    if (after === before) accepted += 1;
    else edits.push({ before, after });
  }
  return {
    accepted,
    edited: edits.length,
    deleted: [...proposed.keys()].filter((key) => !kept.has(key)).length,
    added: draft.tasks.filter((task) => !proposed.has(task.key)).length,
    edits,
  };
}
