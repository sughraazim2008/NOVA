import type { FrictionReason, IsoDate, IsoDateTime, NewBehaviourEvent, SizeBucket, Task, TaskSnapshot } from "@nova/types";

// Builders for behaviour events. Pure: the time and the user's local clock are passed in.
// An event is a fact about something that happened; these functions only decide its shape.

/** Where the user's day stood when the event happened, in their own timezone. */
export interface LocalMoment {
  now: IsoDateTime;
  localHour: number;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
}

/** A completion counts as an overrun at 25% over the estimate, and an underrun at 25% under. */
export const OVERRUN_RATIO = 1.25;
export const UNDERRUN_RATIO = 0.75;

/** Postponing the same task this many times means it is being avoided, not rescheduled. */
export const REPEATED_POSTPONE_LIMIT = 3;

export function sizeBucket(estimatedMin: number): SizeBucket {
  if (estimatedMin < 20) return "UNDER_20";
  if (estimatedMin <= 60) return "20_TO_60";
  return "OVER_60";
}

/** The task as it was at this moment, so later analysis does not depend on the task still existing unchanged. */
export function snapshot(task: Task, at: LocalMoment): TaskSnapshot {
  return {
    estimatedMin: task.estimatedMin,
    category: task.category,
    energyDemand: task.energyDemand,
    sizeBucket: sizeBucket(task.estimatedMin),
    localHour: at.localHour,
    dayOfWeek: at.dayOfWeek,
    postponeCount: task.postponeCount,
    startCount: task.startCount,
  };
}

const about = (task: Task, at: LocalMoment) => ({ taskId: task.id, goalId: task.goalId, occurredAt: at.now });
const round2 = (value: number) => Math.round(value * 100) / 100;

export const taskCreated = (task: Task, at: LocalMoment): NewBehaviourEvent => ({
  type: "TASK_CREATED",
  ...about(task, at),
  payload: { ...snapshot(task, at), origin: task.origin },
});

export const taskStarted = (task: Task, at: LocalMoment, viaNovaStart: boolean): NewBehaviourEvent => ({
  type: "TASK_STARTED",
  ...about(task, at),
  payload: { ...snapshot(task, at), viaNovaStart },
});

/**
 * A completion, plus an overrun or underrun event when the time taken was far from the estimate.
 * A task ticked off with no time recorded produces the completion alone: nothing is inferred.
 */
export function taskCompleted(task: Task, at: LocalMoment, sessions: number): NewBehaviourEvent[] {
  const timed = task.actualMin !== null && task.actualMin > 0;
  const ratio = timed ? round2((task.actualMin as number) / task.estimatedMin) : null;
  const events: NewBehaviourEvent[] = [
    { type: "TASK_COMPLETED", ...about(task, at), payload: { ...snapshot(task, at), actualMin: timed ? task.actualMin : null, ratio, sessions } },
  ];
  if (ratio !== null && (ratio >= OVERRUN_RATIO || ratio <= UNDERRUN_RATIO)) {
    events.push({
      type: ratio >= OVERRUN_RATIO ? "ESTIMATE_OVERRUN" : "ESTIMATE_UNDERRUN",
      ...about(task, at),
      payload: { ...snapshot(task, at), actualMin: task.actualMin as number, ratio },
    });
  }
  return events;
}

export const taskSkipped = (task: Task, at: LocalMoment, plannedMin: number): NewBehaviourEvent => ({
  type: "TASK_SKIPPED",
  ...about(task, at),
  payload: { ...snapshot(task, at), plannedMin },
});

/** A postponement, plus an abandonment event on the postponement that reaches the limit (and only that one). */
export function taskPostponed(task: Task, at: LocalMoment, toDate: IsoDate): NewBehaviourEvent[] {
  const events: NewBehaviourEvent[] = [{ type: "TASK_POSTPONED", ...about(task, at), payload: { ...snapshot(task, at), toDate } }];
  if (task.postponeCount === REPEATED_POSTPONE_LIMIT) events.push(taskAbandoned(task, at, "REPEATED_POSTPONE"));
  return events;
}

export const taskAbandoned = (task: Task, at: LocalMoment, cause: "LEFT_UNFINISHED" | "REPEATED_POSTPONE"): NewBehaviourEvent => ({
  type: "TASK_ABANDONED",
  ...about(task, at),
  payload: { ...snapshot(task, at), cause },
});

export const frictionReported = (task: Task, at: LocalMoment, reason: FrictionReason, hasNote: boolean): NewBehaviourEvent => ({
  type: "FRICTION_REPORTED",
  ...about(task, at),
  payload: { ...snapshot(task, at), reason, hasNote },
});
