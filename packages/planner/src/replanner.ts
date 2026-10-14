import type { EnergyDemand, FrictionReason, IsoDate } from "@nova/types";
import { addDays } from "./dates";

// What NOVA does when a task did not happen and the user said why. Pure and deterministic.
// The table this implements is in docs/architecture.md section 9; the escalation rules are below.

export type ReplanDecision =
  /** Make the task a small start; the rest becomes a follow-on task. */
  | { action: "SHRINK"; starterMin: number; remainderMin: number }
  /** Break the task into parts done on separate occasions. */
  | { action: "SPLIT"; partsMin: number[] }
  /** Move it to another day; lighter work goes first today. */
  | { action: "RETIME"; until: IsoDate }
  /** Have the wording made clearer (by the model; the change is still validated and shown). */
  | { action: "REWRITE" }
  /** Change nothing in the plan; the next NOVA START will open with smaller, more obvious steps. */
  | { action: "MICRO_ACTIONS" }
  /** Ask the user whether the task still matters. Never applied without their answer. */
  | { action: "DROP_SUGGESTED" };

export interface ReplanInput {
  task: { estimatedMin: number; energyDemand: EnergyDemand };
  reason: FrictionReason;
  /** How many times this same reason was given for this task before now. */
  previousSameReason: number;
  today: IsoDate;
}

/** Sizes a too-big task shrinks to, in order: 60 → 30 → 15 → 5. */
export const SHRINK_LADDER = [30, 15, 5] as const;
/** Parts of a split task are about this long. */
export const SPLIT_PART_MIN = 30;
const MAX_PARTS = 4;
/** Low energy this many times for the same task means the question is whether it matters, not when. */
const LOW_ENERGY_LIMIT = 3;

/** The next rung below the current size, or null when the task is already as small as it gets. */
export function nextShrink(estimatedMin: number): number | null {
  return SHRINK_LADDER.find((size) => size < estimatedMin) ?? null;
}

/** Near-equal parts of about 30 minutes each, at least two and at most four, summing to the original. */
export function splitSizes(estimatedMin: number): number[] {
  const count = Math.min(MAX_PARTS, Math.max(2, Math.ceil(estimatedMin / SPLIT_PART_MIN)));
  const base = Math.floor(estimatedMin / count);
  return Array.from({ length: count }, (_, index) => base + (index < estimatedMin % count ? 1 : 0));
}

function shrink(estimatedMin: number): ReplanDecision {
  const starterMin = nextShrink(estimatedMin);
  return starterMin === null ? { action: "DROP_SUGGESTED" } : { action: "SHRINK", starterMin, remainderMin: estimatedMin - starterMin };
}

/**
 * The response to one friction answer. A reason given again for the same task gets a stronger
 * response than the first time; nothing is ever dropped, only suggested for dropping.
 */
export function decideReplan(input: ReplanInput): ReplanDecision {
  const { task, reason, previousSameReason, today } = input;
  const minutes = task.estimatedMin;

  switch (reason) {
    case "TOO_OVERWHELMING":
      return shrink(minutes);
    case "DISTRACTED":
      // A shorter sitting is easier to protect; very short tasks just need an easier first step.
      return minutes > 15 ? shrink(minutes) : { action: "MICRO_ACTIONS" };
    case "DONT_KNOW_HOW_TO_START":
      return previousSameReason === 0 ? { action: "MICRO_ACTIONS" } : shrink(minutes);
    case "NOT_ENOUGH_TIME":
      return minutes >= 2 * 10 ? { action: "SPLIT", partsMin: splitSizes(minutes) } : { action: "MICRO_ACTIONS" };
    case "DONT_UNDERSTAND":
      return previousSameReason === 0 ? { action: "REWRITE" } : { action: "DROP_SUGGESTED" };
    case "LOW_ENERGY":
      if (previousSameReason + 1 >= LOW_ENERGY_LIMIT) return { action: "DROP_SUGGESTED" };
      return task.energyDemand === "LOW" ? shrink(minutes) : { action: "RETIME", until: addDays(today, 1) };
    case "DONT_WANT_TO":
      return { action: "DROP_SUGGESTED" };
  }
}
