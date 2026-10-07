import { addDependency, createGoal, createMilestone, createTask, getDailyPlan, updateGoal, updateTask } from "@nova/database";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seed } from "../../prisma/seed";
import { testDatabaseUrl } from "./env";
import { db, makeUser, resetDb } from "./helpers";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", () => ({ getSessionUserId: async () => session.userId }));

import * as regenerateRoute from "@/app/api/plan/today/regenerate/route";
import * as todayRoute from "@/app/api/plan/today/route";
import { setLLMForTests } from "@/server/ai";
import { todayIn } from "@/server/clock";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, method = "GET") {
  const response = await handler(new Request("http://test.local/api", { method }), { params: Promise.resolve({}) });
  const payload = (await response.json()) as { data?: any; error?: { code: string } };
  return { status: response.status, ...payload };
}
const today = () => call(todayRoute.GET as Handler);
const regenerate = () => call(regenerateRoute.POST as Handler, "POST");

// Any call to a model during planning is a bug: the planner must work with the AI switched off or broken.
const explodingModel = { name: "must-not-be-called", model: "none", generate: async () => { throw new Error("the planner called the model"); } };

beforeEach(async () => {
  await resetDb();
  setLLMForTests(explodingModel);
  session.userId = null;
});
afterEach(() => setLLMForTests(undefined));
afterAll(() => db.$disconnect());

/** A user with one goal whose deadline is 30 days out, and the given tasks (title, minutes, overrides). */
async function world(tasks: [string, number, object?][], goalOverrides: { dailyCapacityMin?: number } = {}) {
  const user = await makeUser();
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  const goal = await createGoal(db, user.id, { title: "Portfolio", deadline: date.toISOString().slice(0, 10), dailyCapacityMin: 60, ...goalOverrides });
  const milestone = (await createMilestone(db, user.id, goal.id, { title: "Design" }))!;
  const created = [];
  for (const [title, estimatedMin, overrides] of tasks) {
    created.push((await createTask(db, user.id, milestone.id, { title, estimatedMin, ...overrides }))!);
  }
  session.userId = user.id;
  return { user, goal, milestone, tasks: created };
}

describe("GET /plan/today", () => {
  it("requires a session", async () => {
    expect((await today()).status).toBe(401);
    expect((await regenerate()).status).toBe(401);
  });

  it("plans the seeded goal within capacity, with only startable tasks and a reason for each", async () => {
    const { userId } = await seed(testDatabaseUrl());
    session.userId = userId;

    const { status, data: plan } = await today();
    expect(status).toBe(200);

    // The demo user's budget is 120 minutes and the goal was given 90: the smaller wins.
    expect(plan.capacityMin).toBe(90);
    expect(plan.usedMin).toBeLessThanOrEqual(90);
    expect(plan.entries.length).toBeGreaterThan(0);
    expect(plan.entries.length).toBeLessThanOrEqual(5);
    expect(plan.usedMin).toBe(plan.entries.reduce((sum: number, e: { plannedMin: number }) => sum + e.plannedMin, 0));
    expect(plan.plannerVersion).toBe("v1");
    expect(plan.emptyReason).toBeNull();

    const blocked = new Set((await db.taskDependency.findMany()).map((d) => d.taskId));
    for (const entry of plan.entries) {
      expect(blocked.has(entry.taskId)).toBe(false);
      expect(entry.reason.length).toBeGreaterThan(10);
      expect(entry.outcome).toBe("PENDING");
      expect(entry.goal.title).toBe("Get a software engineering internship");
      expect(entry.task.title).toBeTruthy();
    }
    expect(plan.entries.map((e: { order: number }) => e.order)).toEqual(plan.entries.map((_: unknown, i: number) => i));
  });

  it("stores the plan, and reading it again returns the same plan without reshuffling", async () => {
    const { user } = await world([["Choose the three projects", 20], ["Sketch the home page", 25]]);
    const first = await today();
    const stored = await getDailyPlan(db, user.id, todayIn(user.timezone));
    expect(stored?.tasks.map((t) => t.id)).toEqual(first.data.entries.map((e: { id: string }) => e.id));

    // A new task appears, but the plan for today has been made: it stays until asked to rebuild.
    const { milestone } = { milestone: await db.milestone.findFirstOrThrow() };
    await createTask(db, user.id, milestone.id, { title: "Urgent new thing", estimatedMin: 10, priority: "CRITICAL" });
    const second = await today();
    expect(second.data.entries.map((e: { id: string }) => e.id)).toEqual(first.data.entries.map((e: { id: string }) => e.id));
    expect(second.data.generatedAt).toBe(first.data.generatedAt);
    expect(await db.dailyPlan.count()).toBe(1);
  });

  it("uses the date in the user's own timezone", async () => {
    const { user } = await world([["Task", 20]]);
    await db.user.update({ where: { id: user.id }, data: { timezone: "Pacific/Kiritimati" } });
    expect((await today()).data.date).toBe(todayIn("Pacific/Kiritimati"));
  });

  it("puts the task that unblocks others ahead of an equal one, and leaves blocked work out", async () => {
    const { user, tasks } = await world([["Later step", 20], ["First step", 20], ["Unrelated", 20]]);
    await addDependency(db, user.id, { taskId: tasks[0]!.id, dependsOnTaskId: tasks[1]!.id });
    const plan = (await today()).data;
    expect(plan.entries.map((e: { task: { title: string } }) => e.task.title)).toEqual(["First step", "Unrelated"]);
    expect(plan.entries[0].reason).toContain("unblocks 1 other task");
  });

  it("keeps one user's plan apart from another's", async () => {
    const mine = await world([["Mine", 20]]);
    const theirs = await world([["Theirs", 20]]);
    const theirPlan = (await today()).data;
    session.userId = mine.user.id;
    const myPlan = (await today()).data;
    expect(myPlan.entries.map((e: { task: { title: string } }) => e.task.title)).toEqual(["Mine"]);
    expect(theirPlan.entries.map((e: { task: { title: string } }) => e.task.title)).toEqual(["Theirs"]);
    expect(theirs.user.id).not.toBe(mine.user.id);
  });
});

describe("an empty plan says why", () => {
  it("NO_GOALS for a user with nothing set up", async () => {
    session.userId = (await makeUser()).id;
    const plan = (await today()).data;
    expect(plan).toMatchObject({ entries: [], capacityMin: 0, usedMin: 0, emptyReason: "NO_GOALS" });
  });

  it("NO_GOALS when the only goal is archived", async () => {
    const { user, goal } = await world([["Task", 20]]);
    await updateGoal(db, user.id, goal.id, { status: "ARCHIVED" });
    expect((await today()).data.emptyReason).toBe("NO_GOALS");
  });

  it("ALL_DONE when every task is finished", async () => {
    const { user, tasks } = await world([["Task", 20]]);
    await updateTask(db, user.id, tasks[0]!.id, { status: "DONE" });
    expect((await today()).data.emptyReason).toBe("ALL_DONE");
  });

  it("NOTHING_ELIGIBLE when the remaining work is deferred", async () => {
    const { user, tasks } = await world([["Task", 20]]);
    await updateTask(db, user.id, tasks[0]!.id, { status: "DEFERRED", deferredUntil: "2099-01-01" });
    expect((await today()).data.emptyReason).toBe("NOTHING_ELIGIBLE");
  });

  it("NO_CAPACITY when the user has no time today", async () => {
    const { user } = await world([["Task", 20]]);
    await db.user.update({ where: { id: user.id }, data: { defaultDailyCapacityMin: 0 } });
    expect((await today()).data).toMatchObject({ entries: [], emptyReason: "NO_CAPACITY" });
  });
});

describe("tasks too long for any day", () => {
  it("are listed for splitting while the rest of the day is still planned", async () => {
    await world([["Write the whole dissertation", 200, { priority: "HIGH" }], ["Open the document", 10]]);
    const plan = (await today()).data;
    expect(plan.entries.map((e: { task: { title: string } }) => e.task.title)).toEqual(["Open the document"]);
    expect(plan.needsSplit.map((e: { task: { title: string } }) => e.task.title)).toEqual(["Write the whole dissertation"]);
    // Still reported when the stored plan is read back.
    expect((await today()).data.needsSplit).toHaveLength(1);
  });
});

describe("POST /plan/today/regenerate", () => {
  it("picks up changes made since the plan was built", async () => {
    const { user, milestone } = await world([["Ordinary task", 20]]);
    await today();
    await createTask(db, user.id, milestone.id, { title: "Urgent new thing", estimatedMin: 10, priority: "CRITICAL" });
    const plan = (await regenerate()).data;
    expect(plan.entries.map((e: { task: { title: string } }) => e.task.title)).toEqual(["Urgent new thing", "Ordinary task"]);
    expect(await db.dailyPlan.count()).toBe(1);
  });

  it("keeps what was completed today, counts its time as spent, and plans only the time left", async () => {
    const { user, tasks } = await world([["First", 30, { priority: "HIGH" }], ["Second", 20], ["Third", 20]]);
    const before = (await today()).data;
    expect(before.entries.map((e: { task: { title: string } }) => e.task.title)).toEqual(["First", "Second"]);

    // The user finishes "First" (30 of the day's 60 minutes).
    await db.dailyTask.update({ where: { id: before.entries[0].id }, data: { outcome: "COMPLETED" } });
    await updateTask(db, user.id, tasks[0]!.id, { status: "DONE" });

    const after = (await regenerate()).data;
    expect(after.entries.map((e: { task: { title: string }; outcome: string }) => [e.task.title, e.outcome])).toEqual([
      ["First", "COMPLETED"],
      ["Second", "PENDING"],
    ]);
    expect(after.capacityMin).toBe(60);
    expect(after.usedMin).toBe(50);
    expect(after.entries.reduce((sum: number, e: { plannedMin: number }) => sum + e.plannedMin, 0)).toBeLessThanOrEqual(60);
  });

  it("does not bring back today a task the user skipped today", async () => {
    await world([["Skipped", 20, { priority: "HIGH" }], ["Other", 20]]);
    const before = (await today()).data;
    const skipped = before.entries.find((e: { task: { title: string } }) => e.task.title === "Skipped");
    await db.dailyTask.update({ where: { id: skipped.id }, data: { outcome: "SKIPPED" } });

    const after = (await regenerate()).data;
    const titles = after.entries.map((e: { task: { title: string }; outcome: string }) => `${e.task.title}:${e.outcome}`);
    expect(titles).toEqual(["Skipped:SKIPPED", "Other:PENDING"]);
    // Skipping spends no time: the whole hour is still there for other work.
    expect(after.usedMin).toBe(20);
  });

  it("gives the same plan when run twice with nothing changed", async () => {
    await world([["A", 20], ["B", 20, { priority: "HIGH" }], ["C", 30, { priority: "LOW" }]]);
    const first = (await regenerate()).data;
    const second = (await regenerate()).data;
    const shape = (plan: { entries: { taskId: string; order: number; plannedMin: number; score: number; reason: string }[] }) =>
      plan.entries.map(({ taskId, order, plannedMin, score, reason }) => ({ taskId, order, plannedMin, score, reason }));
    expect(shape(second)).toEqual(shape(first));
  });

  it("never calls the model", async () => {
    await world([["A", 20]]);
    expect((await today()).status).toBe(200);
    expect((await regenerate()).status).toBe(200);
  });
});
