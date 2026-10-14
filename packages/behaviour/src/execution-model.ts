import type { BehaviourEvent, FrictionReason, SizeBucket, TaskCategory } from "@nova/types";

// The personal execution model: what NOVA has learned about how this person actually works.
// Pure, derived from the event history, and cautious: nothing counts until there is enough of it.

export const MODEL = {
  /** Timed completions in a category before its multiplier is used. */
  MIN_SAMPLES: 3,
  /** Imaginary completions at exactly the estimate, mixed in so a few odd results cannot swing the multiplier far. */
  PRIOR_WEIGHT: 3,
  MULTIPLIER_MIN: 0.7,
  MULTIPLIER_MAX: 2,
  /** Below this share of started tasks finished, a size is called "rarely finished". */
  LOW_COMPLETION: 0.5,
  /** A multiplier at least this far from 1 is worth mentioning to the task writer. */
  NOTABLE_MULTIPLIER: 1.25,
  /** Friction given this many times becomes a hint. */
  FRICTION_HINT_AFTER: 2,
} as const;

export interface CategoryEstimate {
  category: TaskCategory;
  multiplier: number;
  sampleSize: number;
}

export interface ExecutionModel {
  /** Duration multipliers for categories with enough timed completions. */
  multipliers: CategoryEstimate[];
  /** Completion rate of started tasks by size, where there are enough starts to judge. */
  sizes: { bucket: SizeBucket; started: number; completed: number; rate: number }[];
  /** Tasks longer than this are rarely finished by this person; null when there is no such evidence. */
  preferredMaxMin: number | null;
  /** Short plain sentences for the task writer. Never contains anything the user typed. */
  hints: string[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function buildExecutionModel(events: BehaviourEvent[]): ExecutionModel {
  const ratios = new Map<TaskCategory, number[]>();
  const started = new Map<SizeBucket, Set<string>>();
  const completed = new Map<SizeBucket, Set<string>>();
  const friction = new Map<FrictionReason, number>();

  for (const event of events) {
    if (event.type === "TASK_COMPLETED" && event.payload.ratio !== null) {
      ratios.set(event.payload.category, [...(ratios.get(event.payload.category) ?? []), event.payload.ratio]);
    }
    // Counted per task, so a task started three times is one start, not three.
    if (event.taskId && (event.type === "TASK_STARTED" || event.type === "TASK_COMPLETED")) {
      const map = event.type === "TASK_STARTED" ? started : completed;
      const set = map.get(event.payload.sizeBucket) ?? new Set<string>();
      set.add(event.taskId);
      map.set(event.payload.sizeBucket, set);
    }
    if (event.type === "FRICTION_REPORTED") friction.set(event.payload.reason, (friction.get(event.payload.reason) ?? 0) + 1);
  }

  const multipliers = [...ratios.entries()]
    .filter(([, values]) => values.length >= MODEL.MIN_SAMPLES)
    .map(([category, values]) => ({
      category,
      multiplier: round2(clamp((values.reduce((sum, value) => sum + value, 0) + MODEL.PRIOR_WEIGHT) / (values.length + MODEL.PRIOR_WEIGHT), MODEL.MULTIPLIER_MIN, MODEL.MULTIPLIER_MAX)),
      sampleSize: values.length,
    }))
    .filter((entry) => entry.multiplier !== 1)
    .sort((a, b) => a.category.localeCompare(b.category));

  const buckets: SizeBucket[] = ["UNDER_20", "20_TO_60", "OVER_60"];
  const sizes = buckets
    .map((bucket) => {
      const starts = started.get(bucket) ?? new Set<string>();
      const finished = [...(completed.get(bucket) ?? [])].filter((id) => starts.has(id)).length;
      return { bucket, started: starts.size, completed: finished, rate: starts.size === 0 ? 0 : round2(finished / starts.size) };
    })
    .filter((entry) => entry.started >= MODEL.MIN_SAMPLES);

  // The smallest size that is rarely finished sets the ceiling: anything that size or bigger is too big.
  const rarelyFinished = (bucket: SizeBucket) => sizes.some((entry) => entry.bucket === bucket && entry.rate < MODEL.LOW_COMPLETION);
  const preferredMaxMin = rarelyFinished("20_TO_60") ? 20 : rarelyFinished("OVER_60") ? 60 : null;

  const hints: string[] = [];
  for (const entry of multipliers) {
    if (entry.multiplier >= MODEL.NOTABLE_MULTIPLIER) {
      hints.push(`${entry.category.toLowerCase()} tasks take this person about ${entry.multiplier}× as long as estimated, so estimate them generously`);
    }
  }
  if (preferredMaxMin !== null) hints.push(`keep every task under ${preferredMaxMin} minutes; longer tasks rarely get finished`);
  if ((friction.get("TOO_OVERWHELMING") ?? 0) >= MODEL.FRICTION_HINT_AFTER) hints.push("make tasks small and concrete; large tasks feel overwhelming to this person");
  if ((friction.get("DONT_KNOW_HOW_TO_START") ?? 0) >= MODEL.FRICTION_HINT_AFTER) hints.push("make it obvious from each title what the very first action is");
  if ((friction.get("DONT_UNDERSTAND") ?? 0) >= MODEL.FRICTION_HINT_AFTER) hints.push("use plain, specific wording; say exactly what is produced");

  return { multipliers, sizes, preferredMaxMin, hints };
}
