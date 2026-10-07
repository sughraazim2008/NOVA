import { buildGraph, countDownstream, detectCycle, isFinished, isUnblocked } from "./dependency-resolver";
import { scoreTask } from "./prioritiser";
import { buildReason } from "./reasons";
import {
  PlannerInputError,
  type ExcludedTask,
  type PlannedTask,
  type PlannerGoal,
  type PlannerInput,
  type PlannerOutput,
  type PlannerTask,
  type ScoreTerms,
} from "./types";
import { DEFAULT_MAX_TASKS, PLANNER_VERSION } from "./weights";

interface Candidate {
  task: PlannerTask;
  goal: PlannerGoal;
  adjustedMin: number;
  multiplier: number;
  score: number;
  terms: ScoreTerms;
  downstream: number;
  effectiveDeadline: string;
}

function validate(input: PlannerInput): void {
  const bad = (what: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) throw new PlannerInputError("INVALID_NUMBER", `${what} must be zero or more; got ${value}.`);
  };
  bad("dayCapacityMin", input.dayCapacityMin);
  if (input.maxTasks !== undefined) bad("maxTasks", input.maxTasks);

  const goalIds = new Set<string>();
  for (const goal of input.goals) {
    if (goalIds.has(goal.id)) throw new PlannerInputError("DUPLICATE_ID", `Goal "${goal.id}" appears twice.`);
    goalIds.add(goal.id);
    bad(`dailyCapacityMin of goal "${goal.id}"`, goal.dailyCapacityMin);
  }
  for (const task of input.tasks) {
    if (!goalIds.has(task.goalId)) throw new PlannerInputError("UNKNOWN_GOAL", `Task "${task.id}" belongs to goal "${task.goalId}", which is not in the input.`);
    if (!Number.isFinite(task.estimatedMin) || task.estimatedMin <= 0) {
      throw new PlannerInputError("INVALID_NUMBER", `estimatedMin of task "${task.id}" must be more than zero; got ${task.estimatedMin}.`);
    }
  }
  for (const entry of input.multipliers ?? []) {
    if (!Number.isFinite(entry.multiplier) || entry.multiplier <= 0) {
      throw new PlannerInputError("INVALID_NUMBER", `The multiplier for "${entry.category}" must be more than zero; got ${entry.multiplier}.`);
    }
  }
}

/**
 * Decides what the user should do today.
 *
 * Pure and deterministic: the same input gives the same output, in whatever order the input
 * arrays arrive. No model, no database, no clock, no randomness. The steps below are specified,
 * with worked examples, in docs/planning-engine.md.
 */
export function generateDailyPlan(input: PlannerInput): PlannerOutput {
  validate(input);
  const { today, dayCapacityMin } = input;
  const maxTasks = input.maxTasks ?? DEFAULT_MAX_TASKS;

  const graph = buildGraph(input.tasks, input.dependencies);
  const cycle = detectCycle(graph);
  if (cycle) throw new PlannerInputError("CYCLE", `These tasks wait on each other in a loop: ${cycle.join(" → ")}.`);

  const goals = new Map(input.goals.map((goal) => [goal.id, goal]));
  const multipliers = new Map((input.multipliers ?? []).map((entry) => [entry.category, entry.multiplier]));
  const handledToday = new Set(input.handledTodayTaskIds ?? []);
  const multiplierOf = (task: PlannerTask) => multipliers.get(task.category) ?? 1;
  const adjustedMinOf = (task: PlannerTask) => Math.ceil(task.estimatedMin * multiplierOf(task));

  // Work in id order from here on, so nothing depends on the order of the input arrays.
  const unfinished = input.tasks.filter((task) => !isFinished(task.status)).sort((a, b) => a.id.localeCompare(b.id));

  // Remaining work per goal, used for deadline pressure.
  const remainingByGoal = new Map<string, number>();
  for (const task of unfinished) remainingByGoal.set(task.goalId, (remainingByGoal.get(task.goalId) ?? 0) + adjustedMinOf(task));

  // Step 1: classify every unfinished task.
  const excluded: ExcludedTask[] = [];
  const exclude = (task: PlannerTask, why: ExcludedTask["why"], needsSplit = false) => excluded.push({ taskId: task.id, why, needsSplit });
  const candidates: Candidate[] = [];

  for (const task of unfinished) {
    const goal = goals.get(task.goalId) as PlannerGoal;
    if (goal.status !== "ACTIVE") exclude(task, "GOAL_INACTIVE");
    else if (task.status === "DEFERRED" && task.deferredUntil && task.deferredUntil > today) exclude(task, "DEFERRED");
    else if (!isUnblocked(graph, task.id)) exclude(task, "BLOCKED");
    else if (handledToday.has(task.id)) exclude(task, "HANDLED_TODAY");
    else {
      // Steps 2 and 3: adjusted duration and score.
      const downstream = countDownstream(graph, task.id);
      const { score, terms } = scoreTask(task, { today, goal, goalRemainingMin: remainingByGoal.get(goal.id) ?? 0, downstream });
      candidates.push({
        task,
        goal,
        adjustedMin: adjustedMinOf(task),
        multiplier: multiplierOf(task),
        score,
        terms,
        downstream,
        effectiveDeadline: task.deadline ?? task.milestoneTargetDate ?? goal.deadline,
      });
    }
  }

  // Step 4: a total order. The last rule (id) guarantees no two tasks are ever equal.
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.effectiveDeadline.localeCompare(b.effectiveDeadline) ||
      a.task.createdAt.localeCompare(b.task.createdAt) ||
      a.task.id.localeCompare(b.task.id),
  );

  // Steps 5 and 6: fill the day and explain each choice.
  const tasks: PlannedTask[] = [];
  let remaining = dayCapacityMin;
  for (const candidate of candidates) {
    const { task, adjustedMin } = candidate;
    if (tasks.length >= maxTasks) exclude(task, "MAX_TASKS");
    else if (adjustedMin > dayCapacityMin) exclude(task, "LONGER_THAN_CAPACITY", dayCapacityMin > 0);
    else if (adjustedMin > remaining) exclude(task, "NO_CAPACITY");
    else {
      remaining -= adjustedMin;
      tasks.push({
        taskId: task.id,
        order: tasks.length,
        plannedMin: adjustedMin,
        score: candidate.score,
        terms: candidate.terms,
        reason: buildReason(task, {
          today,
          goal: candidate.goal,
          goalRemainingMin: remainingByGoal.get(candidate.goal.id) ?? 0,
          downstream: candidate.downstream,
          terms: candidate.terms,
          adjustedMin,
          multiplier: candidate.multiplier,
        }),
      });
    }
  }

  excluded.sort((a, b) => a.taskId.localeCompare(b.taskId));
  return { date: today, dayCapacityMin, usedMin: dayCapacityMin - remaining, tasks, excluded, plannerVersion: PLANNER_VERSION };
}
