import type { DailyOutcome, FrictionReason } from "@nova/types";

/** The seven answers to "What's stopping you?", in the order they are offered, in the user's voice. */
export const FRICTION_OPTIONS: readonly { reason: FrictionReason; label: string }[] = [
  { reason: "TOO_OVERWHELMING", label: "It feels too big" },
  { reason: "DONT_KNOW_HOW_TO_START", label: "I don't know how to start" },
  { reason: "LOW_ENERGY", label: "Low energy" },
  { reason: "DISTRACTED", label: "I'm distracted" },
  { reason: "DONT_UNDERSTAND", label: "I don't understand it" },
  { reason: "DONT_WANT_TO", label: "I don't want to do it" },
  { reason: "NOT_ENOUGH_TIME", label: "Not enough time" },
];

const LABELS = new Map(FRICTION_OPTIONS.map((option) => [option.reason, option.label]));

export const frictionLabel = (reason: FrictionReason): string => LABELS.get(reason) ?? reason;

export interface FrictionSignals {
  /** What happened to the task's entry in the most recent plan it was in. */
  lastOutcome: DailyOutcome | null;
  postponeCount: number;
  /** Whether the user has already said what got in the way since that outcome. */
  answeredSince: boolean;
}

/**
 * Whether to ask "what got in the way?" about a task.
 * Asked when it was planned and never touched, when the user chose not to do it, or once it has
 * been postponed twice. Asked at most once per occasion.
 */
export function shouldAskFriction(signals: FrictionSignals): boolean {
  if (signals.answeredSince) return false;
  if (signals.lastOutcome === "MISSED" || signals.lastOutcome === "SKIPPED") return true;
  return signals.lastOutcome === "POSTPONED" && signals.postponeCount >= 2;
}

export interface DayEndEntry {
  outcome: DailyOutcome;
  taskStatus: "TODO" | "IN_PROGRESS" | "DONE" | "DEFERRED" | "DROPPED";
}

/**
 * What the end of a day does to one plan entry still marked pending.
 * Finished elsewhere → completed. Started and left → missed, and abandoned. Never touched → missed.
 * Entries the user already acted on are left alone, which makes closing a day safe to repeat.
 */
export function closeEntry(entry: DayEndEntry): { outcome: DailyOutcome; abandoned: boolean } {
  if (entry.outcome !== "PENDING") return { outcome: entry.outcome, abandoned: false };
  if (entry.taskStatus === "DONE") return { outcome: "COMPLETED", abandoned: false };
  return { outcome: "MISSED", abandoned: entry.taskStatus === "IN_PROGRESS" };
}
