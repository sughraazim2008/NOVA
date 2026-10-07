import type { PlannerGoal, PlannerInput, PlannerTask } from "@nova/planner";

export const TODAY = "2026-10-06";

/** Deadline 15 Oct is 10 days away counting both ends; at 60 min a day that is 600 minutes of room. */
export const goal = (overrides: Partial<PlannerGoal> = {}): PlannerGoal => ({
  id: "g1",
  title: "Portfolio",
  status: "ACTIVE",
  priority: "MEDIUM",
  deadline: "2026-10-15",
  dailyCapacityMin: 60,
  ...overrides,
});

export const task = (id: string, estimatedMin: number, overrides: Partial<PlannerTask> = {}): PlannerTask => ({
  id,
  goalId: "g1",
  status: "TODO",
  priority: "MEDIUM",
  estimatedMin,
  category: "CODING",
  createdAt: "2026-10-01T09:00:00.000Z",
  ...overrides,
});

/**
 * Adds one far-deferred task so the goal's remaining work is exactly `remainingMin`.
 * It counts towards deadline pressure and is never eligible, which lets a test fix the
 * pressure term without changing which tasks compete for the day.
 */
export function padTo(remainingMin: number, tasks: PlannerTask[], goalId = "g1"): PlannerTask[] {
  const current = tasks.filter((t) => t.goalId === goalId && t.status !== "DONE" && t.status !== "DROPPED").reduce((sum, t) => sum + t.estimatedMin, 0);
  const pad = remainingMin - current;
  if (pad <= 0) throw new Error(`padTo: tasks already total ${current} min, cannot pad to ${remainingMin}`);
  return [...tasks, task(`zz-pad-${goalId}`, pad, { goalId, status: "DEFERRED", deferredUntil: "2099-01-01" })];
}

/** One goal at pressure 0.5 (300 of 600 minutes), the default for the worked examples. */
export const input = (dayCapacityMin: number, tasks: PlannerTask[], overrides: Partial<PlannerInput> = {}): PlannerInput => ({
  today: TODAY,
  dayCapacityMin,
  goals: [goal()],
  tasks: padTo(300, tasks),
  dependencies: [],
  ...overrides,
});

/** Small seeded random source, so generated cases are the same on every run. */
export function seeded(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    shuffle: <T,>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
      }
      return copy;
    },
  };
}
