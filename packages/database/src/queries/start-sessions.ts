import { StartStepsSchema, type IsoDateTime, type StartSession, type StartSessionOutcome, type StartStep } from "@nova/types";
import type { Db } from "../client";
import type * as Row from "../generated/client";

/** The steps are a JSON column, so they are validated on the way out as well as on the way in. */
const toStartSession = (row: Row.StartSession): StartSession => ({
  id: row.id,
  userId: row.userId,
  taskId: row.taskId,
  steps: StartStepsSchema.parse(row.steps),
  currentStep: row.currentStep,
  stuckCount: row.stuckCount,
  startedAt: row.startedAt.toISOString(),
  endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  outcome: row.outcome,
});

/** Returns null when the task does not exist or belongs to someone else. */
export async function createStartSession(
  db: Db,
  userId: string,
  taskId: string,
  args: { steps: StartStep[]; startedAt: IsoDateTime },
): Promise<StartSession | null> {
  const owned = await db.task.count({ where: { id: taskId, goal: { userId } } });
  if (owned === 0) return null;
  const row = await db.startSession.create({
    data: { userId, taskId, steps: StartStepsSchema.parse(args.steps), startedAt: new Date(args.startedAt) },
  });
  return toStartSession(row);
}

export async function getStartSession(db: Db, userId: string, sessionId: string): Promise<StartSession | null> {
  const row = await db.startSession.findFirst({ where: { id: sessionId, userId } });
  return row ? toStartSession(row) : null;
}

/** The unfinished session for a task, if the user left one open. */
export async function getOpenStartSession(db: Db, userId: string, taskId: string): Promise<StartSession | null> {
  const row = await db.startSession.findFirst({ where: { userId, taskId, endedAt: null }, orderBy: { startedAt: "desc" } });
  return row ? toStartSession(row) : null;
}

/** Saves progress on an open session. Returns null when it does not exist, is not the user's, or has ended. */
export async function saveStartSessionProgress(
  db: Db,
  userId: string,
  sessionId: string,
  progress: { steps: StartStep[]; currentStep: number; stuckCount: number },
): Promise<StartSession | null> {
  const { count } = await db.startSession.updateMany({
    where: { id: sessionId, userId, endedAt: null },
    data: { steps: StartStepsSchema.parse(progress.steps), currentStep: progress.currentStep, stuckCount: progress.stuckCount },
  });
  return count === 0 ? null : getStartSession(db, userId, sessionId);
}

/** Closes an open session. Returns null when there is no open session to close. */
export async function endStartSession(
  db: Db,
  userId: string,
  sessionId: string,
  args: { endedAt: IsoDateTime; outcome: StartSessionOutcome },
): Promise<StartSession | null> {
  const { count } = await db.startSession.updateMany({
    where: { id: sessionId, userId, endedAt: null },
    data: { endedAt: new Date(args.endedAt), outcome: args.outcome },
  });
  return count === 0 ? null : getStartSession(db, userId, sessionId);
}

/** How many NOVA START sessions the task has had, finished or not. */
export function countStartSessions(db: Db, userId: string, taskId: string): Promise<number> {
  return db.startSession.count({ where: { userId, taskId } });
}

/** Every NOVA START session the user has had, oldest first. */
export async function listStartSessions(db: Db, userId: string): Promise<StartSession[]> {
  const rows = await db.startSession.findMany({ where: { userId }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] });
  return rows.map(toStartSession);
}
