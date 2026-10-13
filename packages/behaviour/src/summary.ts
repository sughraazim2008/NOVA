import type { BehaviourEvent, EventType, FrictionReason, TaskCategory } from "@nova/types";

export interface CategorySummary {
  category: TaskCategory;
  completed: number;
  /** Completions with a recorded time. */
  timed: number;
  /** Mean of actual ÷ estimated over timed completions; null when there are none. */
  meanRatio: number | null;
  estimatedMin: number;
  actualMin: number;
}

export interface BehaviourSummary {
  byType: Partial<Record<EventType, number>>;
  started: number;
  completed: number;
  /** Starts that went through NOVA START. */
  startedViaNovaStart: number;
  byCategory: CategorySummary[];
  friction: { reason: FrictionReason; count: number }[];
  /** Mean of actual ÷ estimated across every timed completion; null when there are none. */
  overallRatio: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Counts and estimate-versus-actual figures from a list of events. Pure, and the same whatever
 * order the events arrive in. These are descriptions of what happened, not yet patterns to act on;
 * minimum sample sizes and smoothing belong to the execution model (Phase 9).
 */
export function summariseEvents(events: BehaviourEvent[]): BehaviourSummary {
  const byType: Partial<Record<EventType, number>> = {};
  const categories = new Map<TaskCategory, { completed: number; timed: number; ratioSum: number; estimatedMin: number; actualMin: number }>();
  const friction = new Map<FrictionReason, number>();
  let startedViaNovaStart = 0;

  for (const event of events) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
    if (event.type === "TASK_STARTED" && event.payload.viaNovaStart) startedViaNovaStart += 1;
    if (event.type === "FRICTION_REPORTED") friction.set(event.payload.reason, (friction.get(event.payload.reason) ?? 0) + 1);
    if (event.type === "TASK_COMPLETED") {
      const { category, estimatedMin, actualMin, ratio } = event.payload;
      const entry = categories.get(category) ?? { completed: 0, timed: 0, ratioSum: 0, estimatedMin: 0, actualMin: 0 };
      entry.completed += 1;
      if (actualMin !== null && ratio !== null) {
        entry.timed += 1;
        entry.ratioSum += ratio;
        entry.estimatedMin += estimatedMin;
        entry.actualMin += actualMin;
      }
      categories.set(category, entry);
    }
  }

  const byCategory = [...categories.entries()]
    .map(([category, entry]) => ({
      category,
      completed: entry.completed,
      timed: entry.timed,
      meanRatio: entry.timed === 0 ? null : round2(entry.ratioSum / entry.timed),
      estimatedMin: entry.estimatedMin,
      actualMin: entry.actualMin,
    }))
    .sort((a, b) => b.completed - a.completed || a.category.localeCompare(b.category));

  const timed = [...categories.values()].reduce((sum, entry) => sum + entry.timed, 0);
  const ratioSum = [...categories.values()].reduce((sum, entry) => sum + entry.ratioSum, 0);

  return {
    byType,
    started: byType.TASK_STARTED ?? 0,
    completed: byType.TASK_COMPLETED ?? 0,
    startedViaNovaStart,
    byCategory,
    friction: [...friction.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    overallRatio: timed === 0 ? null : round2(ratioSum / timed),
  };
}
