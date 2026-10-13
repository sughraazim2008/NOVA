import { SaveDailyPlanInputSchema, type DailyPlan, type IsoDate, type SaveDailyPlanInput } from "@nova/types";
import { inTransaction, type Db } from "../client";
import { fromIsoDate, toDailyPlan, toDailyTask } from "../mappers";

export async function getDailyPlan(db: Db, userId: string, date: IsoDate): Promise<DailyPlan | null> {
  const row = await db.dailyPlan.findUnique({
    where: { userId_date: { userId, date: fromIsoDate(date) } },
    include: { tasks: true },
  });
  return row ? toDailyPlan(row) : null;
}

/**
 * Stores the plan for a date, replacing an earlier plan for the same date.
 *
 * Entries the user has already acted on today (any outcome other than PENDING) are kept and
 * stay first; untouched entries are replaced by the new ones.
 */
export async function saveDailyPlan(db: Db, userId: string, input: SaveDailyPlanInput): Promise<DailyPlan> {
  const plan = SaveDailyPlanInputSchema.parse(input);
  const date = fromIsoDate(plan.date);
  const header = { capacityMin: plan.capacityMin, usedMin: plan.usedMin, plannerVersion: plan.plannerVersion };

  return inTransaction(db, async (tx) => {
    const owned = await tx.task.count({ where: { id: { in: plan.tasks.map((t) => t.taskId) }, goal: { userId } } });
    if (owned !== plan.tasks.length) throw new Error("saveDailyPlan: plan refers to a task the user does not own");

    const saved = await tx.dailyPlan.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...header },
      update: { ...header, generatedAt: new Date() },
    });

    await tx.dailyTask.deleteMany({ where: { dailyPlanId: saved.id, outcome: "PENDING" } });
    const kept = await tx.dailyTask.findMany({ where: { dailyPlanId: saved.id }, orderBy: { order: "asc" } });
    await Promise.all(kept.map((row, index) => tx.dailyTask.update({ where: { id: row.id }, data: { order: index } })));

    const keptTaskIds = new Set(kept.map((row) => row.taskId));
    const fresh = [...plan.tasks].sort((a, b) => a.order - b.order).filter((t) => !keptTaskIds.has(t.taskId));
    await tx.dailyTask.createMany({
      data: fresh.map((t, index) => ({ ...t, dailyPlanId: saved.id, order: kept.length + index })),
    });

    const row = await tx.dailyPlan.findUniqueOrThrow({ where: { id: saved.id }, include: { tasks: true } });
    return toDailyPlan(row);
  });
}

/**
 * Records what happened today to a task in today's plan. Returns false when the task is not
 * in that day's plan, which is not an error: a task can be completed from the goal page too.
 */
export async function setDailyOutcome(
  db: Db,
  userId: string,
  date: IsoDate,
  taskId: string,
  outcome: DailyPlan["tasks"][number]["outcome"],
): Promise<boolean> {
  const { count } = await db.dailyTask.updateMany({
    where: { taskId, dailyPlan: { userId, date: fromIsoDate(date) } },
    data: { outcome },
  });
  return count > 0;
}

export interface OpenPastEntry {
  id: string;
  date: IsoDate;
  taskId: string;
  plannedMin: number;
  outcome: DailyPlan["tasks"][number]["outcome"];
  taskStatus: "TODO" | "IN_PROGRESS" | "DONE" | "DEFERRED" | "DROPPED";
}

/** Entries still marked pending in plans for days before `before`: the days that have not been closed yet. */
export async function listPendingEntriesBefore(db: Db, userId: string, before: IsoDate): Promise<OpenPastEntry[]> {
  const rows = await db.dailyTask.findMany({
    where: { outcome: "PENDING", dailyPlan: { userId, date: { lt: fromIsoDate(before) } } },
    include: { dailyPlan: { select: { date: true } }, task: { select: { status: true } } },
    orderBy: [{ dailyPlan: { date: "asc" } }, { order: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    date: row.dailyPlan.date.toISOString().slice(0, 10),
    taskId: row.taskId,
    plannedMin: row.plannedMin,
    outcome: row.outcome,
    taskStatus: row.task.status,
  }));
}

/** Sets the outcome of one plan entry, only if it is still pending. Returns whether it changed. */
export async function closeDailyEntry(db: Db, userId: string, entryId: string, outcome: DailyPlan["tasks"][number]["outcome"]): Promise<boolean> {
  const { count } = await db.dailyTask.updateMany({ where: { id: entryId, outcome: "PENDING", dailyPlan: { userId } }, data: { outcome } });
  return count > 0;
}

export interface RecentOutcome {
  taskId: string;
  date: IsoDate;
  outcome: DailyPlan["tasks"][number]["outcome"];
  plannedMin: number;
}

/** The latest plan entry for each task among plans from `since` up to, but not including, `before`. Newest plan first. */
export async function listRecentOutcomes(db: Db, userId: string, since: IsoDate, before: IsoDate): Promise<RecentOutcome[]> {
  const rows = await db.dailyTask.findMany({
    where: { dailyPlan: { userId, date: { gte: fromIsoDate(since), lt: fromIsoDate(before) } } },
    include: { dailyPlan: { select: { date: true } } },
    orderBy: [{ dailyPlan: { date: "desc" } }, { order: "asc" }],
  });
  const latest = new Map<string, RecentOutcome>();
  for (const row of rows) {
    if (!latest.has(row.taskId)) {
      latest.set(row.taskId, { taskId: row.taskId, date: row.dailyPlan.date.toISOString().slice(0, 10), outcome: row.outcome, plannedMin: row.plannedMin });
    }
  }
  return [...latest.values()];
}

/** The task's entry in the plan for `date`, if it has one. */
export async function getDailyEntry(db: Db, userId: string, date: IsoDate, taskId: string): Promise<DailyPlan["tasks"][number] | null> {
  const row = await db.dailyTask.findFirst({ where: { taskId, dailyPlan: { userId, date: fromIsoDate(date) } } });
  return row ? toDailyTask(row) : null;
}
