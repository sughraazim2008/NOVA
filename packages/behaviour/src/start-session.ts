import type { IsoDateTime, MicroAction, StartStep } from "@nova/types";

// The rules of a NOVA START session, as pure functions over plain data.

export interface SessionProgress {
  steps: StartStep[];
  /** Index of the step being shown. Equal to steps.length once every step has been handled. */
  currentStep: number;
  stuckCount: number;
}

export const toSteps = (actions: MicroAction[]): StartStep[] => actions.map((action) => ({ ...action, state: "PENDING" as const }));

/** True once there is no step left to show. The user may keep working or finish. */
export const stepsExhausted = (progress: SessionProgress): boolean => progress.currentStep >= progress.steps.length;

function settle(progress: SessionProgress, state: "DONE" | "SKIPPED"): SessionProgress {
  if (stepsExhausted(progress)) return progress;
  const steps = progress.steps.map((step, index) => (index === progress.currentStep ? { ...step, state } : step));
  return { ...progress, steps, currentStep: progress.currentStep + 1 };
}

export const completeStep = (progress: SessionProgress): SessionProgress => settle(progress, "DONE");
export const skipStep = (progress: SessionProgress): SessionProgress => settle(progress, "SKIPPED");

/**
 * "I'm stuck": the current step is set aside and a smaller or clearer one takes its place.
 * Nothing after it changes, and the stuck count goes up by one.
 */
export function replaceCurrentStep(progress: SessionProgress, replacement: MicroAction): SessionProgress {
  if (stepsExhausted(progress)) return progress;
  const { currentStep } = progress;
  const steps: StartStep[] = [
    ...progress.steps.slice(0, currentStep),
    { ...(progress.steps[currentStep] as StartStep), state: "REPLACED" },
    { ...replacement, state: "PENDING" },
    ...progress.steps.slice(currentStep + 1),
  ];
  return { steps, currentStep: currentStep + 1, stuckCount: progress.stuckCount + 1 };
}

/** Whole minutes between two instants, never less than 1: a session that happened took some time. */
export function sessionMinutes(startedAt: IsoDateTime, endedAt: IsoDateTime): number {
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  return Math.max(1, Math.round(ms / 60_000));
}

export interface SessionSummary {
  done: number;
  skipped: number;
  replaced: number;
  remaining: number;
}

export function summarise(progress: SessionProgress): SessionSummary {
  const count = (state: StartStep["state"]) => progress.steps.filter((step) => step.state === state).length;
  return { done: count("DONE"), skipped: count("SKIPPED"), replaced: count("REPLACED"), remaining: count("PENDING") };
}
