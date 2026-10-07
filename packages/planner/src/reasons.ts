import type { IsoDate } from "@nova/types";
import { daysBetween } from "./dates";
import { daysLeft, goalPressure, taskUrgency } from "./prioritiser";
import type { PlannerGoal, PlannerTask, ScoreTerms } from "./types";
import { WEIGHTS } from "./weights";

interface ReasonContext {
  today: IsoDate;
  goal: PlannerGoal;
  goalRemainingMin: number;
  downstream: number;
  terms: ScoreTerms;
  adjustedMin: number;
  multiplier: number;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * One sentence saying why this task is in today's plan, built from the two terms that contributed
 * most to its score. Fixed phrases only: the explanation is as deterministic as the plan.
 */
export function buildReason(task: PlannerTask, context: ReasonContext): string {
  const { today, goal, terms } = context;

  const phrase: Record<keyof ScoreTerms, () => string | null> = {
    pressure: () => {
      // Say which of the two sources of pressure is the larger one.
      if (task.deadline && taskUrgency(today, task.deadline) >= goalPressure(today, goal, context.goalRemainingMin)) {
        const days = daysBetween(today, task.deadline);
        if (days < 0) return null; // "its deadline has passed" is the overdue phrase
        return days === 0 ? "it is due today" : days === 1 ? "it is due tomorrow" : `it is due in ${days} days`;
      }
      const perDay = Math.ceil(context.goalRemainingMin / daysLeft(today, goal.deadline));
      return `"${goal.title}" needs about ${perDay} min a day to stay on schedule`;
    },
    // Medium and low priority are the ordinary case and explain nothing.
    priority: () =>
      task.priority === "CRITICAL" ? "it is critical priority"
      : task.priority === "HIGH" ? "it is high priority"
      : goal.priority === "CRITICAL" || goal.priority === "HIGH" ? `"${goal.title}" is a ${goal.priority.toLowerCase()}-priority goal`
      : null,
    overdue: () => "its deadline has passed",
    unblocks: () => (context.downstream === 1 ? "it unblocks 1 other task" : `it unblocks ${context.downstream} other tasks`),
    risk: () => `"${goal.title}" is ${goal.health === "OFF_TRACK" ? "off track" : "at risk"}`,
    continuity: () => "you already started it",
  };

  const ranked = (Object.keys(WEIGHTS) as (keyof ScoreTerms)[])
    .map((term, index) => ({ term, index, weight: WEIGHTS[term] * terms[term] }))
    .filter((entry) => entry.weight > 0)
    // Largest contribution first; equal contributions keep the order the terms are declared in.
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  const parts: string[] = [];
  for (const { term } of ranked) {
    const text = phrase[term]();
    if (text) parts.push(text);
    if (parts.length === 2) break;
  }

  let reason = parts.length === 0 ? `Next in line for "${goal.title}".` : `${capitalise(parts.join(", and "))}.`;
  if (context.multiplier !== 1) {
    reason += ` Planned ${context.adjustedMin} min: your ${task.category.toLowerCase()} tasks usually take ${context.multiplier}× the estimate.`;
  }
  return reason;
}
