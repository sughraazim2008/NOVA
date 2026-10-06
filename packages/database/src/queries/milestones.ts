import {
  CreateMilestoneInputSchema,
  UpdateMilestoneInputSchema,
  type CreateMilestoneInput,
  type Milestone,
  type UpdateMilestoneInput,
} from "@nova/types";
import { inTransaction, type Db } from "../client";
import { fromIsoDate, toMilestone } from "../mappers";

/** Returns null when the goal does not exist or belongs to someone else. */
export async function createMilestone(
  db: Db,
  userId: string,
  goalId: string,
  input: CreateMilestoneInput,
): Promise<Milestone | null> {
  const data = CreateMilestoneInputSchema.parse(input);
  return inTransaction(db, async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
    if (!goal) return null;
    const last = await tx.milestone.aggregate({ where: { goalId }, _max: { order: true } });
    const row = await tx.milestone.create({
      data: {
        goalId,
        title: data.title,
        order: data.order ?? (last._max.order ?? -1) + 1,
        targetDate: data.targetDate ? fromIsoDate(data.targetDate) : undefined,
      },
    });
    return toMilestone(row);
  });
}

export async function getMilestone(db: Db, userId: string, milestoneId: string): Promise<Milestone | null> {
  const row = await db.milestone.findFirst({ where: { id: milestoneId, goal: { userId } } });
  return row ? toMilestone(row) : null;
}

export async function updateMilestone(
  db: Db,
  userId: string,
  milestoneId: string,
  input: UpdateMilestoneInput,
): Promise<Milestone | null> {
  const { targetDate, ...rest } = UpdateMilestoneInputSchema.parse(input);
  const { count } = await db.milestone.updateMany({
    where: { id: milestoneId, goal: { userId } },
    data: { ...rest, targetDate: targetDate === undefined ? undefined : targetDate && fromIsoDate(targetDate) },
  });
  return count === 0 ? null : getMilestone(db, userId, milestoneId);
}

export async function deleteMilestone(db: Db, userId: string, milestoneId: string): Promise<boolean> {
  const { count } = await db.milestone.deleteMany({ where: { id: milestoneId, goal: { userId } } });
  return count > 0;
}
