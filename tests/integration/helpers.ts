import { createDb, createGoal, createMilestone, createTask, createUser } from "@nova/database";
import type { CreateTaskInput } from "@nova/types";
import { testDatabaseUrl } from "./env";

export const db = createDb(testDatabaseUrl());

/** Empties every table. Everything hangs off User, so one cascade is enough. */
export async function resetDb() {
  await db.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
}

let counter = 0;

export async function makeUser() {
  counter += 1;
  return createUser(db, { email: `user${counter}-${process.pid}@test.local` });
}

/** A user with one goal, one milestone and as many tasks as asked for. */
export async function makeWorld(taskCount = 0, task: Partial<CreateTaskInput> = {}) {
  const user = await makeUser();
  const goal = await createGoal(db, user.id, { title: "Goal", deadline: "2026-12-15", dailyCapacityMin: 60 });
  const milestone = await createMilestone(db, user.id, goal.id, { title: "Milestone" });
  if (!milestone) throw new Error("makeWorld: milestone not created");
  const tasks = [];
  for (let i = 0; i < taskCount; i += 1) {
    const created = await createTask(db, user.id, milestone.id, { title: `Task ${i}`, estimatedMin: 30, ...task });
    if (!created) throw new Error("makeWorld: task not created");
    tasks.push(created);
  }
  return { user, goal, milestone, tasks };
}
