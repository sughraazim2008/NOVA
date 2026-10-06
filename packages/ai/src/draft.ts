import type { GoalDraft, IsoDate } from "@nova/types";
import { daysBetween } from "./dates";

/**
 * Checks a draft for everything a schema cannot express. Returns the problems found; an empty
 * list means the draft is safe to save. Used on AI output and again on the reviewed draft a
 * client sends back, which is never trusted to be unmodified.
 */
export function validateDraft(draft: GoalDraft, today: IsoDate): string[] {
  const issues: string[] = [];
  const { goal, milestones, tasks } = draft;

  if (goal.deadline < today) issues.push(`The goal deadline ${goal.deadline} is in the past.`);

  const milestoneKeys = new Set<string>();
  for (const milestone of milestones) {
    if (milestoneKeys.has(milestone.key)) issues.push(`Milestone key "${milestone.key}" is used twice.`);
    milestoneKeys.add(milestone.key);
    if (milestone.targetDate && milestone.targetDate > goal.deadline) {
      issues.push(`Milestone "${milestone.title}" is dated after the goal deadline.`);
    }
  }

  const taskKeys = new Set<string>();
  for (const task of tasks) {
    if (taskKeys.has(task.key)) issues.push(`Task key "${task.key}" is used twice.`);
    taskKeys.add(task.key);
  }

  for (const task of tasks) {
    if (!milestoneKeys.has(task.milestoneKey)) {
      issues.push(`Task "${task.title}" belongs to a milestone that does not exist ("${task.milestoneKey}").`);
    }
    if (task.deadline && task.deadline > goal.deadline) issues.push(`Task "${task.title}" is due after the goal deadline.`);
    if (new Set(task.dependsOn).size !== task.dependsOn.length) issues.push(`Task "${task.title}" lists the same prerequisite twice.`);
    for (const prerequisite of task.dependsOn) {
      if (prerequisite === task.key) issues.push(`Task "${task.title}" depends on itself.`);
      else if (!taskKeys.has(prerequisite)) issues.push(`Task "${task.title}" depends on "${prerequisite}", which does not exist.`);
    }
  }

  const cycle = findCycle(tasks);
  if (cycle) issues.push(`These tasks wait on each other in a loop: ${cycle.join(" → ")}.`);

  return issues;
}

/** Returns the keys forming a dependency loop, or null. Unknown prerequisites are ignored here. */
export function findCycle(tasks: { key: string; dependsOn: string[] }[]): string[] | null {
  const dependsOn = new Map(tasks.map((task) => [task.key, task.dependsOn]));
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];

  const visit = (key: string): string[] | null => {
    if (state.get(key) === "done") return null;
    if (state.get(key) === "visiting") return [...path.slice(path.indexOf(key)), key];
    state.set(key, "visiting");
    path.push(key);
    for (const next of dependsOn.get(key) ?? []) {
      if (!dependsOn.has(next)) continue;
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(key, "done");
    return null;
  };

  for (const key of [...dependsOn.keys()].sort()) {
    const cycle = visit(key);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Compares the work in the draft with the time available. Returns a sentence for the reviewer
 * when the plan cannot fit, otherwise null. Arithmetic only; the planner does the real scheduling.
 */
export function budgetNote(draft: GoalDraft, today: IsoDate): string | null {
  const totalMin = draft.tasks.reduce((sum, task) => sum + task.estimatedMin, 0);
  const days = Math.max(1, daysBetween(today, draft.goal.deadline) + 1);
  const availableMin = days * draft.goal.dailyCapacityMin;
  if (totalMin <= availableMin) return null;
  const hours = (minutes: number) => Math.round(minutes / 6) / 10;
  return `This plan is about ${hours(totalMin)} hours of work, but ${draft.goal.dailyCapacityMin} minutes a day until the deadline gives about ${hours(availableMin)} hours. Remove tasks, add time or move the deadline.`;
}
