import { SaveDailyPlanInputSchema, type DailyPlan, type IsoDate, type SaveDailyPlanInput } from "@nova/types";
import { inTransaction, type Db } from "../client";
import { fromIsoDate, toDailyPlan } from "../mappers";

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
