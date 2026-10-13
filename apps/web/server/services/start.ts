import { breakIntoSteps, fallbackReplacement, fallbackSteps, replaceStep } from "@nova/ai";
import { completeStep, replaceCurrentStep, sessionMinutes, skipStep, stepsExhausted, toSteps } from "@nova/behaviour";
import * as database from "@nova/database";
import { getDb, inTransaction, lockUser } from "@nova/database";
import type { Goal, MicroAction, StartSession, StartSessionOutcome, StepAction, Task, User } from "@nova/types";
import { aiDeps, getLLM } from "../ai";
import { todayIn } from "../clock";
import { onTaskCompleted, onTaskStarted } from "../hooks/behaviour";
import { found, HttpError } from "../http";

// NOVA START: the session that carries someone from "I should do this" to "I am doing this".

export interface StartView {
  session: StartSession;
  task: Task;
  goal: Pick<Goal, "id" | "title">;
  /** False when the steps are the built-in opener because no model could write task-specific ones. */
  tailored: boolean;
}

async function context(user: User, taskId: string) {
  const db = getDb();
  const task = found(await database.getTask(db, user.id, taskId));
  const goal = found(await database.getGoal(db, user.id, task.goalId));
  const milestone = await database.getMilestone(db, user.id, task.milestoneId);
  return { task, goal, milestone };
}

/** Task-specific steps from the model when there is one and it answers usably; the built-in opener otherwise. */
async function writeSteps(task: Task, goal: Goal, milestoneTitle: string | null): Promise<{ steps: MicroAction[]; tailored: boolean }> {
  const llm = getLLM();
  if (llm) {
    const result = await breakIntoSteps({ goalTitle: goal.title, milestoneTitle, task }, aiDeps(llm));
    if (result.ok) return { steps: result.value, tailored: true };
  }
  return { steps: fallbackSteps(task), tailored: false };
}

/**
 * Opens a session for a task, or returns the one already open so a reload or a second tab
 * picks up where the user was. Starting never fails for lack of a model.
 */
export async function openSession(user: User, taskId: string, now: Date = new Date()): Promise<StartView> {
  const { task, goal, milestone } = await context(user, taskId);
  const view = (session: StartSession, current: Task, tailored: boolean): StartView => ({ session, task: current, goal: { id: goal.id, title: goal.title }, tailored });

  const open = await database.getOpenStartSession(getDb(), user.id, taskId);
  if (open) return view(open, task, true);

  if (task.status === "DONE" || task.status === "DROPPED") throw new HttpError("CONFLICT", "That task is already finished.");

  // The model call happens before the transaction: it is slow, and nothing is held open while waiting.
  const { steps, tailored } = await writeSteps(task, goal, milestone?.title ?? null);

  return inTransaction(getDb(), async (tx) => {
    // Two requests can race here (a double tap). The lock makes them take turns, so the second finds the first one's session.
    await lockUser(tx, user.id);
    const raced = await database.getOpenStartSession(tx, user.id, taskId);
    if (raced) return view(raced, task, true);
    const started = found(await database.startTask(tx, user.id, taskId));
    const session = found(await database.createStartSession(tx, user.id, taskId, { steps: toSteps(steps), startedAt: now.toISOString() }));
    await onTaskStarted(tx, user, started);
    return view(session, started, tailored);
  });
}

export async function getSession(user: User, sessionId: string): Promise<StartView> {
  const session = found(await database.getStartSession(getDb(), user.id, sessionId));
  const { task, goal } = await context(user, session.taskId);
  return { session, task, goal: { id: goal.id, title: goal.title }, tailored: true };
}

/** Done, skip or stuck on the step being shown. */
export async function stepAction(user: User, sessionId: string, input: StepAction): Promise<StartView> {
  const db = getDb();
  const session = found(await database.getStartSession(db, user.id, sessionId));
  if (session.endedAt) throw new HttpError("CONFLICT", "That session has ended.");
  if (stepsExhausted(session)) throw new HttpError("CONFLICT", "There are no steps left in this session.");
  const { task, goal } = await context(user, session.taskId);

  let progress;
  if (input.action === "done") progress = completeStep(session);
  else if (input.action === "skip") progress = skipStep(session);
  else {
    const current = session.steps[session.currentStep] as MicroAction;
    const llm = getLLM();
    const reply = llm ? await replaceStep({ taskTitle: task.title, step: current, note: input.note ?? null }, aiDeps(llm)) : null;
    progress = replaceCurrentStep(session, reply?.ok ? reply.value : fallbackReplacement(current));
  }

  const saved = found(await database.saveStartSessionProgress(db, user.id, sessionId, progress));
  return { session: saved, task, goal: { id: goal.id, title: goal.title }, tailored: true };
}

export interface FinishView extends StartView {
  /** Minutes this sitting took. */
  sessionMin: number;
}

/**
 * Ends the session and records the time it took.
 * COMPLETED finishes the task. PARTIAL keeps it in progress and counts today's entry as partly done.
 * ABANDONED keeps the time and leaves the task where it was.
 */
export async function finishSession(user: User, sessionId: string, outcome: StartSessionOutcome, now: Date = new Date()): Promise<FinishView> {
  const today = todayIn(user.timezone, now);
  return inTransaction(getDb(), async (tx) => {
    const ended = await database.endStartSession(tx, user.id, sessionId, { endedAt: now.toISOString(), outcome });
    if (!ended) {
      found(await database.getStartSession(tx, user.id, sessionId));
      throw new HttpError("CONFLICT", "That session has already ended.");
    }
    const sessionMin = sessionMinutes(ended.startedAt, ended.endedAt as string);
    const goal = found(await database.getGoal(tx, user.id, found(await database.getTask(tx, user.id, ended.taskId)).goalId));

    let task: Task;
    if (outcome === "COMPLETED") {
      task = found(await database.completeTask(tx, user.id, ended.taskId, { now: now.toISOString(), actualMin: sessionMin }));
      await database.setDailyOutcome(tx, user.id, today, ended.taskId, "COMPLETED");
      await onTaskCompleted(tx, user, task);
    } else {
      task = found(await database.addTaskTime(tx, user.id, ended.taskId, sessionMin));
      if (outcome === "PARTIAL") await database.setDailyOutcome(tx, user.id, today, ended.taskId, "PARTIAL");
    }
    return { session: ended, task, goal: { id: goal.id, title: goal.title }, tailored: true, sessionMin };
  });
}
