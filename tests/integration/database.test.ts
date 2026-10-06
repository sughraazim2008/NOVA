import {
  addDependency,
  createGoal,
  createMilestone,
  createTask,
  createUser,
  deleteGoal,
  deleteTask,
  getDailyPlan,
  getGoal,
  getGoalTree,
  getTask,
  listDependencies,
  listEvents,
  listGoals,
  listTasks,
  recordEvent,
  removeDependency,
  saveDailyPlan,
  updateGoal,
  updateTask,
} from "@nova/database";
import * as Generated from "@nova/database/generated/enums";
import * as Types from "@nova/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_EMAIL, seed } from "../../prisma/seed";
import { testDatabaseUrl } from "./env";
import { db, makeUser, makeWorld, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const snapshot = {
  estimatedMin: 30,
  category: "OTHER",
  energyDemand: "MEDIUM",
  sizeBucket: "20_TO_60",
  localHour: 18,
  dayOfWeek: 2,
  postponeCount: 0,
  startCount: 0,
} as const;

describe("schema agreement", () => {
  // The same enums are declared in Prisma and in Zod; this keeps them from drifting apart.
  it.each([
    ["Priority", Types.PrioritySchema],
    ["GoalStatus", Types.GoalStatusSchema],
    ["MilestoneStatus", Types.MilestoneStatusSchema],
    ["TaskStatus", Types.TaskStatusSchema],
    ["TaskCategory", Types.TaskCategorySchema],
    ["EnergyDemand", Types.EnergyDemandSchema],
    ["TaskOrigin", Types.TaskOriginSchema],
    ["DailyOutcome", Types.DailyOutcomeSchema],
    ["StartSessionOutcome", Types.StartSessionOutcomeSchema],
    ["EventType", Types.EventTypeSchema],
    ["FrictionReason", Types.FrictionReasonSchema],
    ["ReplanActionType", Types.ReplanActionTypeSchema],
    ["HealthStatus", Types.HealthStatusSchema],
    ["EstimateDimension", Types.EstimateDimensionSchema],
    ["GameMode", Types.GameModeSchema],
  ] as const)("%s has the same values in the database and in @nova/types", (name, schema) => {
    expect([...schema.options].sort()).toEqual(Object.values(Generated[name]).sort());
  });

  it("has twelve tables", async () => {
    const rows = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'`;
    expect(Number(rows[0]?.count)).toBe(12);
  });
});

describe("goals", () => {
  it("creates, reads, updates and deletes", async () => {
    const user = await makeUser();
    const goal = await createGoal(db, user.id, { title: "Build a portfolio", deadline: "2026-10-31", dailyCapacityMin: 60 });
    expect(goal).toMatchObject({ deadline: "2026-10-31", priority: "MEDIUM", status: "ACTIVE" });

    const updated = await updateGoal(db, user.id, goal.id, { priority: "HIGH", deadline: "2026-11-15" });
    expect(updated).toMatchObject({ priority: "HIGH", deadline: "2026-11-15", title: "Build a portfolio" });

    expect(await deleteGoal(db, user.id, goal.id)).toBe(true);
    expect(await getGoal(db, user.id, goal.id)).toBeNull();
  });

  it("lists by status, nearest deadline first", async () => {
    const user = await makeUser();
    const later = await createGoal(db, user.id, { title: "Later", deadline: "2026-12-01", dailyCapacityMin: 30 });
    const sooner = await createGoal(db, user.id, { title: "Sooner", deadline: "2026-11-01", dailyCapacityMin: 30 });
    await updateGoal(db, user.id, later.id, { status: "ARCHIVED" });
    expect((await listGoals(db, user.id)).map((g) => g.id)).toEqual([sooner.id, later.id]);
    expect((await listGoals(db, user.id, { status: "ACTIVE" })).map((g) => g.id)).toEqual([sooner.id]);
  });

  it("rejects invalid input before touching the database", async () => {
    const user = await makeUser();
    await expect(createGoal(db, user.id, { title: "", deadline: "2026-10-31", dailyCapacityMin: 60 })).rejects.toThrow();
  });

  it("rejects a duplicate email", async () => {
    await createUser(db, { email: "same@test.local" });
    await expect(createUser(db, { email: "same@test.local" })).rejects.toThrow();
  });
});

describe("ownership", () => {
  it("hides one user's records from another", async () => {
    const mine = await makeWorld(1);
    const other = await makeUser();
    const task = mine.tasks[0]!;

    expect(await getGoal(db, other.id, mine.goal.id)).toBeNull();
    expect(await getGoalTree(db, other.id, mine.goal.id)).toBeNull();
    expect(await getTask(db, other.id, task.id)).toBeNull();
    expect(await updateGoal(db, other.id, mine.goal.id, { title: "Hijacked" })).toBeNull();
    expect(await updateTask(db, other.id, task.id, { title: "Hijacked" })).toBeNull();
    expect(await deleteGoal(db, other.id, mine.goal.id)).toBe(false);
    expect(await deleteTask(db, other.id, task.id)).toBe(false);
    expect(await createMilestone(db, other.id, mine.goal.id, { title: "Intruder" })).toBeNull();
    expect(await createTask(db, other.id, mine.milestone.id, { title: "Intruder", estimatedMin: 10 })).toBeNull();
    expect(await listTasks(db, other.id)).toEqual([]);

    expect((await getGoal(db, mine.user.id, mine.goal.id))?.title).toBe("Goal");
  });
});

describe("milestones and tasks", () => {
  it("appends milestones in order and refuses a duplicate position", async () => {
    const { user, goal } = await makeWorld();
    const second = await createMilestone(db, user.id, goal.id, { title: "Second" });
    expect(second?.order).toBe(1);
    await expect(createMilestone(db, user.id, goal.id, { title: "Clash", order: 0 })).rejects.toThrow();
  });

  it("stores the goal on the task and returns the tree in order", async () => {
    const { user, goal, milestone, tasks } = await makeWorld(2);
    expect(tasks.every((t) => t.goalId === goal.id && t.milestoneId === milestone.id)).toBe(true);
    const tree = await getGoalTree(db, user.id, goal.id);
    expect(tree?.milestones[0]?.tasks.map((t) => t.title)).toEqual(["Task 0", "Task 1"]);
  });

  it("updates status and dates", async () => {
    const { user, tasks } = await makeWorld(1);
    const deferred = await updateTask(db, user.id, tasks[0]!.id, { status: "DEFERRED", deferredUntil: "2026-10-09" });
    expect(deferred).toMatchObject({ status: "DEFERRED", deferredUntil: "2026-10-09" });
    const cleared = await updateTask(db, user.id, tasks[0]!.id, { status: "TODO", deferredUntil: null });
    expect(cleared).toMatchObject({ status: "TODO", deferredUntil: null });
  });

  it("filters tasks by status", async () => {
    const { user, tasks } = await makeWorld(3);
    await updateTask(db, user.id, tasks[0]!.id, { status: "DONE" });
    expect(await listTasks(db, user.id, { statuses: ["TODO", "IN_PROGRESS"] })).toHaveLength(2);
  });
});

describe("database constraints", () => {
  it("refuses a duration outside 1–480 minutes even when validation is bypassed", async () => {
    const { tasks } = await makeWorld(1);
    await expect(db.task.update({ where: { id: tasks[0]!.id }, data: { estimatedMin: 0 } })).rejects.toThrow();
    await expect(db.task.update({ where: { id: tasks[0]!.id }, data: { estimatedMin: 481 } })).rejects.toThrow();
  });

  it("refuses a deferred task with no date", async () => {
    const { tasks } = await makeWorld(1);
    await expect(db.task.update({ where: { id: tasks[0]!.id }, data: { status: "DEFERRED" } })).rejects.toThrow();
  });

  it("refuses a self-dependency written directly", async () => {
    const { tasks } = await makeWorld(1);
    const id = tasks[0]!.id;
    await expect(db.taskDependency.create({ data: { taskId: id, dependsOnTaskId: id } })).rejects.toThrow();
  });

  it("refuses a plan that uses more than its capacity", async () => {
    const user = await makeUser();
    await expect(
      db.dailyPlan.create({
        data: { userId: user.id, date: new Date("2026-10-06"), capacityMin: 60, usedMin: 90, plannerVersion: "v1" },
      }),
    ).rejects.toThrow();
  });
});

describe("dependencies", () => {
  it("adds, lists and removes", async () => {
    const { user, tasks } = await makeWorld(2);
    const edge = { taskId: tasks[1]!.id, dependsOnTaskId: tasks[0]!.id };
    expect(await addDependency(db, user.id, edge)).toEqual({ ok: true, value: edge });
    expect(await listDependencies(db, user.id)).toEqual([edge]);
    expect(await removeDependency(db, user.id, edge)).toBe(true);
    expect(await listDependencies(db, user.id)).toEqual([]);
  });

  it("is idempotent", async () => {
    const { user, tasks } = await makeWorld(2);
    const edge = { taskId: tasks[1]!.id, dependsOnTaskId: tasks[0]!.id };
    await addDependency(db, user.id, edge);
    expect((await addDependency(db, user.id, edge)).ok).toBe(true);
    expect(await listDependencies(db, user.id)).toHaveLength(1);
  });

  it("rejects a self-reference", async () => {
    const { user, tasks } = await makeWorld(1);
    const result = await addDependency(db, user.id, { taskId: tasks[0]!.id, dependsOnTaskId: tasks[0]!.id });
    expect(result).toEqual({ ok: false, error: "SELF_REFERENCE" });
  });

  it("rejects a direct cycle", async () => {
    const { user, tasks } = await makeWorld(2);
    const [a, b] = tasks.map((t) => t.id) as [string, string];
    await addDependency(db, user.id, { taskId: b, dependsOnTaskId: a });
    expect(await addDependency(db, user.id, { taskId: a, dependsOnTaskId: b })).toEqual({ ok: false, error: "CYCLE" });
  });

  it("rejects a cycle through a chain and leaves the graph unchanged", async () => {
    const { user, tasks } = await makeWorld(4);
    const [a, b, c, d] = tasks.map((t) => t.id) as [string, string, string, string];
    await addDependency(db, user.id, { taskId: b, dependsOnTaskId: a });
    await addDependency(db, user.id, { taskId: c, dependsOnTaskId: b });
    await addDependency(db, user.id, { taskId: d, dependsOnTaskId: c });
    expect(await addDependency(db, user.id, { taskId: a, dependsOnTaskId: d })).toEqual({ ok: false, error: "CYCLE" });
    expect(await listDependencies(db, user.id)).toHaveLength(3);
  });

  it("allows a diamond, which is not a cycle", async () => {
    const { user, tasks } = await makeWorld(4);
    const [a, b, c, d] = tasks.map((t) => t.id) as [string, string, string, string];
    for (const [taskId, dependsOnTaskId] of [[b, a], [c, a], [d, b], [d, c]] as const) {
      expect((await addDependency(db, user.id, { taskId, dependsOnTaskId })).ok).toBe(true);
    }
  });

  it("rejects a dependency on another user's task", async () => {
    const mine = await makeWorld(1);
    const theirs = await makeWorld(1);
    const result = await addDependency(db, mine.user.id, { taskId: mine.tasks[0]!.id, dependsOnTaskId: theirs.tasks[0]!.id });
    expect(result).toEqual({ ok: false, error: "TASK_NOT_FOUND" });
  });

  it("never lets concurrent inserts form a cycle", async () => {
    const { user, tasks } = await makeWorld(2);
    const [a, b] = tasks.map((t) => t.id) as [string, string];
    const results = await Promise.all([
      addDependency(db, user.id, { taskId: a, dependsOnTaskId: b }),
      addDependency(db, user.id, { taskId: b, dependsOnTaskId: a }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await listDependencies(db, user.id)).toHaveLength(1);
  });
});

describe("cascades", () => {
  it("deleting a goal removes everything under it", async () => {
    const { user, goal, tasks } = await makeWorld(2);
    await addDependency(db, user.id, { taskId: tasks[1]!.id, dependsOnTaskId: tasks[0]!.id });
    await saveDailyPlan(db, user.id, {
      date: "2026-10-06", capacityMin: 60, usedMin: 30, plannerVersion: "v1",
      tasks: [{ taskId: tasks[0]!.id, order: 0, plannedMin: 30, score: 30, reason: "high priority" }],
    });

    await deleteGoal(db, user.id, goal.id);

    expect(await db.milestone.count()).toBe(0);
    expect(await db.task.count()).toBe(0);
    expect(await db.taskDependency.count()).toBe(0);
    expect(await db.dailyTask.count()).toBe(0);
    expect(await db.dailyPlan.count()).toBe(1);
  });

  it("deleting a task keeps its history", async () => {
    const { user, goal, tasks } = await makeWorld(1);
    const task = tasks[0]!;
    await recordEvent(db, user.id, {
      type: "TASK_STARTED", taskId: task.id, goalId: goal.id,
      occurredAt: "2026-10-06T18:00:00.000Z", payload: { ...snapshot, viaNovaStart: true },
    });
    await deleteTask(db, user.id, task.id);
    const events = await listEvents(db, user.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ taskId: null, goalId: goal.id, type: "TASK_STARTED" });
  });
});

describe("daily plans", () => {
  const entry = (taskId: string, order: number) => ({ taskId, order, plannedMin: 30, score: 30 - order, reason: "high priority" });

  it("stores one plan per user and date, replacing on regenerate", async () => {
    const { user, tasks } = await makeWorld(3);
    const [a, b, c] = tasks.map((t) => t.id) as [string, string, string];
    const base = { date: "2026-10-06", capacityMin: 120, plannerVersion: "v1" };

    await saveDailyPlan(db, user.id, { ...base, usedMin: 60, tasks: [entry(a, 0), entry(b, 1)] });
    const second = await saveDailyPlan(db, user.id, { ...base, usedMin: 60, tasks: [entry(c, 0), entry(a, 1)] });

    expect(await db.dailyPlan.count()).toBe(1);
    expect(second.tasks.map((t) => t.taskId)).toEqual([c, a]);
    expect(await getDailyPlan(db, user.id, "2026-10-06")).toEqual(second);
    expect(await getDailyPlan(db, user.id, "2026-10-07")).toBeNull();
  });

  it("keeps entries the user already acted on when the plan is rebuilt", async () => {
    const { user, tasks } = await makeWorld(3);
    const [a, b, c] = tasks.map((t) => t.id) as [string, string, string];
    const base = { date: "2026-10-06", capacityMin: 120, plannerVersion: "v1" };

    const first = await saveDailyPlan(db, user.id, { ...base, usedMin: 60, tasks: [entry(a, 0), entry(b, 1)] });
    await db.dailyTask.update({ where: { id: first.tasks[1]!.id }, data: { outcome: "COMPLETED" } });

    const rebuilt = await saveDailyPlan(db, user.id, { ...base, usedMin: 60, tasks: [entry(c, 0), entry(b, 1)] });
    expect(rebuilt.tasks.map((t) => [t.taskId, t.outcome, t.order])).toEqual([
      [b, "COMPLETED", 0],
      [c, "PENDING", 1],
    ]);
  });

  it("refuses a plan containing another user's task and saves nothing", async () => {
    const mine = await makeWorld(1);
    const theirs = await makeWorld(1);
    await expect(
      saveDailyPlan(db, mine.user.id, {
        date: "2026-10-06", capacityMin: 60, usedMin: 30, plannerVersion: "v1", tasks: [entry(theirs.tasks[0]!.id, 0)],
      }),
    ).rejects.toThrow();
    expect(await db.dailyPlan.count()).toBe(0);
  });
});

describe("behaviour events", () => {
  it("returns events in the order they happened and filters them", async () => {
    const { user, tasks } = await makeWorld(1);
    const taskId = tasks[0]!.id;
    await recordEvent(db, user.id, { type: "TASK_COMPLETED", taskId, occurredAt: "2026-10-06T19:00:00.000Z", payload: { ...snapshot, actualMin: 40, ratio: 1.33, sessions: 1 } });
    await recordEvent(db, user.id, { type: "TASK_STARTED", taskId, occurredAt: "2026-10-06T18:00:00.000Z", payload: { ...snapshot, viaNovaStart: true } });

    expect((await listEvents(db, user.id)).map((e) => e.type)).toEqual(["TASK_STARTED", "TASK_COMPLETED"]);
    expect(await listEvents(db, user.id, { types: ["TASK_COMPLETED"] })).toHaveLength(1);
    expect(await listEvents(db, user.id, { from: "2026-10-06T18:30:00.000Z" })).toHaveLength(1);
    expect(await listEvents(db, user.id, { to: "2026-10-06T18:00:00.000Z" })).toHaveLength(0);
  });

  it("refuses a payload that does not match the event type", async () => {
    const { user } = await makeWorld();
    await expect(
      // @ts-expect-error wrong payload for the type, on purpose
      recordEvent(db, user.id, { type: "TASK_COMPLETED", occurredAt: "2026-10-06T19:00:00.000Z", payload: { ...snapshot, viaNovaStart: true } }),
    ).rejects.toThrow();
    expect(await db.behaviourEvent.count()).toBe(0);
  });
});

describe("seed", () => {
  it("creates the example goal and can be run twice", async () => {
    await seed(testDatabaseUrl());
    const summary = await seed(testDatabaseUrl());
    expect(summary).toMatchObject({ milestones: 5, tasks: 21, dependencies: 21 });
    expect(await db.user.count({ where: { email: DEMO_EMAIL } })).toBe(1);

    const tree = await getGoalTree(db, summary.userId, summary.goalId);
    expect(tree?.milestones.map((m) => m.title)).toEqual(["Prepare", "Build evidence", "Find opportunities", "Apply", "Interview"]);
    expect(tree?.dependencies).toHaveLength(21);
  });
});
