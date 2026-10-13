import { FakeLLMClient } from "@nova/ai";
import { createGoal, createMilestone, createTask, listEvents, listFriction, saveDailyPlan } from "@nova/database";
import { addDays } from "@nova/planner";
import type { EventType } from "@nova/types";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, makeUser, resetDb } from "./helpers";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", () => ({ getSessionUserId: async () => session.userId }));

import * as summaryRoute from "@/app/api/behaviour/summary/route";
import * as milestoneTasksRoute from "@/app/api/milestones/[id]/tasks/route";
import * as todayRoute from "@/app/api/plan/today/route";
import * as openRoute from "@/app/api/start/[taskId]/route";
import * as completeRoute from "@/app/api/tasks/[id]/complete/route";
import * as frictionRoute from "@/app/api/tasks/[id]/friction/route";
import * as postponeRoute from "@/app/api/tasks/[id]/postpone/route";
import * as skipRoute from "@/app/api/tasks/[id]/skip/route";
import * as startRoute from "@/app/api/tasks/[id]/start/route";
import { setLLMForTests } from "@/server/ai";
import { localMoment, todayIn } from "@/server/clock";
import { resetRateLimits } from "@/server/rate-limit";
import { closePastDays } from "@/server/services/behaviour";
import { finishSession, openSession } from "@/server/services/start";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, params: Record<string, string> = {}, body?: unknown, method = "POST", query = "") {
  const request = new Request(`http://test.local/api${query}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await handler(request, { params: Promise.resolve(params) });
  const payload = (await response.json()) as { data?: any; error?: { code: string } };
  return { status: response.status, ...payload };
}
const plan = async () => (await call(todayRoute.GET as Handler, {}, undefined, "GET")).data;

let user: Awaited<ReturnType<typeof makeUser>>;
let goalId = "";
let milestoneId = "";
const today = () => todayIn("UTC");
const types = async (taskId?: string): Promise<EventType[]> => (await listEvents(db, user.id, taskId ? { taskId } : {})).map((e) => e.type);

async function addTask(title: string, estimatedMin = 30, overrides: object = {}) {
  return (await createTask(db, user.id, milestoneId, { title, estimatedMin, ...overrides }))!;
}

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  setLLMForTests(null);
  user = await makeUser();
  session.userId = user.id;
  const goal = await createGoal(db, user.id, { title: "Dissertation", deadline: addDays(today(), 30), dailyCapacityMin: 120 });
  goalId = goal.id;
  milestoneId = (await createMilestone(db, user.id, goal.id, { title: "Draft" }))!.id;
});
afterEach(() => setLLMForTests(undefined));
afterAll(() => db.$disconnect());

describe("every change records exactly one matching event", () => {
  it("creating a task through the API", async () => {
    const created = await call(milestoneTasksRoute.POST as Handler, { id: milestoneId }, { title: "Read chapter two", estimatedMin: 25, category: "READING" });
    const events = await listEvents(db, user.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "TASK_CREATED", taskId: created.data.id, goalId,
      payload: { origin: "USER", category: "READING", estimatedMin: 25, sizeBucket: "20_TO_60", startCount: 0 },
    });
  });

  it("start, complete, skip and postpone", async () => {
    const [a, b, c] = [await addTask("A"), await addTask("B"), await addTask("C")];
    await plan();

    await call(startRoute.POST as Handler, { id: a.id });
    await call(completeRoute.POST as Handler, { id: a.id }, { actualMin: 30 });
    await call(skipRoute.POST as Handler, { id: b.id });
    await call(postponeRoute.POST as Handler, { id: c.id });

    expect(await types(a.id)).toEqual(["TASK_STARTED", "TASK_COMPLETED"]);
    expect(await types(b.id)).toEqual(["TASK_SKIPPED"]);
    expect(await types(c.id)).toEqual(["TASK_POSTPONED"]);

    const events = await listEvents(db, user.id);
    expect(events.find((e) => e.type === "TASK_STARTED")?.payload).toMatchObject({ viaNovaStart: false, startCount: 1 });
    expect(events.find((e) => e.type === "TASK_COMPLETED")?.payload).toMatchObject({ actualMin: 30, ratio: 1, sessions: 0 });
    expect(events.find((e) => e.type === "TASK_SKIPPED")?.payload).toMatchObject({ plannedMin: 30 });
    expect(events.find((e) => e.type === "TASK_POSTPONED")?.payload).toMatchObject({ toDate: addDays(today(), 1), postponeCount: 1 });
  });

  it("a failed action records nothing", async () => {
    const outside = await addTask("Not in the plan", 300); // longer than the 120-minute day, so the planner leaves it out
    await plan();
    expect((await call(skipRoute.POST as Handler, { id: outside.id })).status).toBe(409);
    expect((await call(postponeRoute.POST as Handler, { id: outside.id }, { toDate: today() })).status).toBe(422);
    expect((await call(completeRoute.POST as Handler, { id: "missing" })).status).toBe(404);
    expect(await db.behaviourEvent.count()).toBe(0);
  });

  it("stamps events with the hour and weekday where the user is", async () => {
    const instant = new Date("2026-10-13T23:30:00.000Z"); // Tuesday evening in London, Wednesday morning in Tokyo
    expect(localMoment("Europe/London", instant)).toMatchObject({ localHour: 0, dayOfWeek: 3 });
    expect(localMoment("UTC", instant)).toMatchObject({ localHour: 23, dayOfWeek: 2 });
    expect(localMoment("Asia/Tokyo", instant)).toMatchObject({ localHour: 8, dayOfWeek: 3 });
    expect(localMoment("America/Los_Angeles", instant)).toMatchObject({ localHour: 16, dayOfWeek: 2 });
    expect(localMoment("Not/AZone", instant)).toMatchObject({ localHour: 23, dayOfWeek: 2 });
  });
});

describe("NOVA START sessions", () => {
  const at = (minutes: number) => new Date(Date.parse("2026-10-13T18:00:00.000Z") + minutes * 60_000);

  it("record the start as coming from NOVA START, and an overrun when the sitting ran long", async () => {
    const task = await addTask("Review complex numbers", 35, { category: "STUDY" });
    const view = await openSession(user, task.id, at(0));
    await finishSession(user, view.session.id, "COMPLETED", at(55));

    const events = await listEvents(db, user.id, { taskId: task.id });
    expect(events.map((e) => e.type)).toEqual(["TASK_STARTED", "TASK_COMPLETED", "ESTIMATE_OVERRUN"]);
    expect(events[0]?.payload).toMatchObject({ viaNovaStart: true });
    expect(events[1]?.payload).toMatchObject({ estimatedMin: 35, actualMin: 55, ratio: 1.57, sessions: 1 });
    expect(events[2]?.payload).toMatchObject({ ratio: 1.57 });
    expect(events[0]?.occurredAt).toBe(at(0).toISOString());
  });

  it("record an underrun, and nothing extra when the estimate was about right", async () => {
    const quick = await addTask("Quick one", 40);
    const fair = await addTask("Fair one", 40);
    await finishSession(user, (await openSession(user, quick.id, at(0))).session.id, "COMPLETED", at(20));
    await finishSession(user, (await openSession(user, fair.id, at(100))).session.id, "COMPLETED", at(142));
    expect(await types(quick.id)).toEqual(["TASK_STARTED", "TASK_COMPLETED", "ESTIMATE_UNDERRUN"]);
    expect(await types(fair.id)).toEqual(["TASK_STARTED", "TASK_COMPLETED"]);
  });

  it("record one start per sitting, and reopening a session is not a new start", async () => {
    const task = await addTask("Two sittings", 60);
    const first = await call(openRoute.POST as Handler, { taskId: task.id });
    await call(openRoute.POST as Handler, { taskId: task.id });
    await finishSession(user, first.data.session.id, "PARTIAL");
    await call(openRoute.POST as Handler, { taskId: task.id });
    expect(await types(task.id)).toEqual(["TASK_STARTED", "TASK_STARTED"]);
  });

  it("pass earlier friction to the step writer as labels, never the user's notes", async () => {
    const task = await addTask("Write dissertation introduction", 60);
    await call(frictionRoute.POST as Handler, { id: task.id }, { reason: "TOO_OVERWHELMING", note: "my supervisor hates my topic" });
    const llm = new FakeLLMClient().on("task-breaker", {
      steps: [
        { instruction: "Open the document.", estimatedMin: 1, doneLabel: "Open" },
        { instruction: "Find the introduction.", estimatedMin: 2, doneLabel: "Found it" },
        { instruction: "Write one rough sentence.", estimatedMin: 3, doneLabel: "Written" },
      ],
    });
    setLLMForTests(llm);
    await call(openRoute.POST as Handler, { taskId: task.id });
    expect(llm.calls[0]?.user).toContain("- It feels too big");
    expect(llm.calls[0]?.user).not.toContain("supervisor");
  });
});

describe("postponing again and again", () => {
  it("records an abandonment on the third postponement only", async () => {
    const task = await addTask("Avoided");
    for (let i = 0; i < 4; i += 1) await call(postponeRoute.POST as Handler, { id: task.id });
    const events = await listEvents(db, user.id, { taskId: task.id });
    expect(events.map((e) => e.type)).toEqual(["TASK_POSTPONED", "TASK_POSTPONED", "TASK_POSTPONED", "TASK_ABANDONED", "TASK_POSTPONED"]);
    expect(events[3]?.payload).toMatchObject({ cause: "REPEATED_POSTPONE", postponeCount: 3 });
  });
});

describe("friction", () => {
  it("is stored with its event in one go", async () => {
    const task = await addTask("Hard thing", 60);
    const result = await call(frictionRoute.POST as Handler, { id: task.id }, { reason: "DONT_KNOW_HOW_TO_START", note: "  no idea where to begin  " });
    expect(result.status).toBe(201);
    expect(result.data).toMatchObject({ taskId: task.id, reason: "DONT_KNOW_HOW_TO_START", note: "no idea where to begin", appliedAction: null, startedAfter: null });
    expect(await listFriction(db, user.id, { taskId: task.id })).toHaveLength(1);
    const events = await listEvents(db, user.id, { types: ["FRICTION_REPORTED"] });
    expect(events[0]?.payload).toMatchObject({ reason: "DONT_KNOW_HOW_TO_START", hasNote: true, sizeBucket: "20_TO_60" });
  });

  it("accepts all seven reasons and rejects anything else", async () => {
    const task = await addTask("Thing");
    const reasons = ["TOO_OVERWHELMING", "DONT_KNOW_HOW_TO_START", "LOW_ENERGY", "DISTRACTED", "DONT_UNDERSTAND", "DONT_WANT_TO", "NOT_ENOUGH_TIME"];
    for (const reason of reasons) expect((await call(frictionRoute.POST as Handler, { id: task.id }, { reason })).status).toBe(201);
    expect((await call(frictionRoute.POST as Handler, { id: task.id }, { reason: "LAZY" })).status).toBe(422);
    expect((await call(frictionRoute.POST as Handler, { id: task.id }, {})).status).toBe(422);
    expect(await db.frictionEvent.count()).toBe(7);
  });

  it("is refused for another user's task and without a session", async () => {
    const task = await addTask("Mine");
    session.userId = (await makeUser()).id;
    expect((await call(frictionRoute.POST as Handler, { id: task.id }, { reason: "LOW_ENERGY" })).status).toBe(404);
    session.userId = null;
    expect((await call(frictionRoute.POST as Handler, { id: task.id }, { reason: "LOW_ENERGY" })).status).toBe(401);
    expect(await db.frictionEvent.count()).toBe(0);
  });
});

describe("closing earlier days", () => {
  const yesterday = () => addDays(today(), -1);
  const planFor = (date: string, taskIds: string[]) =>
    saveDailyPlan(db, user.id, {
      date, capacityMin: 120, usedMin: taskIds.length * 30, plannerVersion: "v1",
      tasks: taskIds.map((taskId, order) => ({ taskId, order, plannedMin: 30, score: 30, reason: "test" })),
    });
  const outcomes = async () =>
    Object.fromEntries((await db.dailyTask.findMany({ include: { task: true } })).map((entry) => [entry.task.title, entry.outcome]));

  it("tells missed, abandoned and finished-elsewhere apart, and leaves handled entries alone", async () => {
    const untouched = await addTask("Untouched");
    const startedAndLeft = await addTask("Started and left");
    const finishedElsewhere = await addTask("Finished elsewhere");
    const skipped = await addTask("Skipped");
    await planFor(yesterday(), [untouched.id, startedAndLeft.id, finishedElsewhere.id, skipped.id]);
    await db.task.update({ where: { id: startedAndLeft.id }, data: { status: "IN_PROGRESS", startCount: 1 } });
    await db.task.update({ where: { id: finishedElsewhere.id }, data: { status: "DONE" } });
    await db.dailyTask.updateMany({ where: { taskId: skipped.id }, data: { outcome: "SKIPPED" } });

    expect(await closePastDays(user, today())).toBe(3);
    expect(await outcomes()).toEqual({ Untouched: "MISSED", "Started and left": "MISSED", "Finished elsewhere": "COMPLETED", Skipped: "SKIPPED" });

    const events = await listEvents(db, user.id);
    expect(events.map((e) => [e.type, e.taskId])).toEqual([["TASK_ABANDONED", startedAndLeft.id]]);
    expect(events[0]?.payload).toMatchObject({ cause: "LEFT_UNFINISHED" });
  });

  it("changes nothing when run again, or twice at once", async () => {
    const task = await addTask("Started and left");
    await planFor(yesterday(), [task.id]);
    await db.task.update({ where: { id: task.id }, data: { status: "IN_PROGRESS", startCount: 1 } });

    const [a, b] = await Promise.all([closePastDays(user, today()), closePastDays(user, today())]);
    expect(a + b).toBe(1);
    expect(await closePastDays(user, today())).toBe(0);
    expect(await db.behaviourEvent.count()).toBe(1);
  });

  it("never touches today's plan", async () => {
    const task = await addTask("Today's task");
    await planFor(today(), [task.id]);
    expect(await closePastDays(user, today())).toBe(0);
    expect(await outcomes()).toEqual({ "Today's task": "PENDING" });
  });

  it("happens by itself when the user opens Today, and the missed task is planned again", async () => {
    const task = await addTask("Yesterday's task");
    await planFor(yesterday(), [task.id]);
    const todays = await plan();
    expect(await db.dailyTask.count({ where: { outcome: "MISSED" } })).toBe(1);
    expect(todays.entries.map((e: { task: { title: string } }) => e.task.title)).toEqual(["Yesterday's task"]);
  });
});

describe("asking what got in the way", () => {
  it("asks about a task missed yesterday, and stops once answered", async () => {
    const task = await addTask("Missed yesterday");
    await saveDailyPlan(db, user.id, {
      date: addDays(today(), -1), capacityMin: 120, usedMin: 30, plannerVersion: "v1",
      tasks: [{ taskId: task.id, order: 0, plannedMin: 30, score: 30, reason: "test" }],
    });

    const before = await plan();
    expect(before.askAbout.map((q: { task: { title: string } }) => q.task.title)).toEqual(["Missed yesterday"]);

    await call(frictionRoute.POST as Handler, { id: task.id }, { reason: "LOW_ENERGY" });
    expect((await plan()).askAbout).toEqual([]);
  });

  it("asks about two at most, and never about finished work or anything from today", async () => {
    const tasks = [await addTask("One"), await addTask("Two"), await addTask("Three"), await addTask("Done since")];
    await saveDailyPlan(db, user.id, {
      date: addDays(today(), -1), capacityMin: 120, usedMin: 120, plannerVersion: "v1",
      tasks: tasks.map((t, order) => ({ taskId: t.id, order, plannedMin: 30, score: 30, reason: "test" })),
    });
    await closePastDays(user, today());
    await db.task.update({ where: { id: tasks[3]!.id }, data: { status: "DONE" } });

    const result = await plan();
    expect(result.askAbout).toHaveLength(2);
    expect(result.askAbout.map((q: { task: { title: string } }) => q.task.title)).not.toContain("Done since");
  });
});

describe("GET /behaviour/summary", () => {
  it("describes a simulated week correctly", async () => {
    // Six days: study runs over, reading is about right, one long writing task keeps being put off.
    const base = Date.parse(`${addDays(today(), -6)}T18:00:00.000Z`);
    const day = (index: number, minutes: number) => new Date(base + index * 86_400_000 + minutes * 60_000);
    const study = [[35, 55], [40, 52], [30, 45]] as const;
    const reading = [[20, 22], [30, 31], [25, 26]] as const;

    for (const [index, [estimate, actual]] of study.entries()) {
      const task = await addTask(`Study ${index}`, estimate, { category: "STUDY" });
      await finishSession(user, (await openSession(user, task.id, day(index, 0))).session.id, "COMPLETED", day(index, actual));
    }
    for (const [index, [estimate, actual]] of reading.entries()) {
      const task = await addTask(`Reading ${index}`, estimate, { category: "READING" });
      await finishSession(user, (await openSession(user, task.id, day(index, 120))).session.id, "COMPLETED", day(index, 120 + actual));
    }
    const essay = await addTask("Write the essay", 90, { category: "WRITING" });
    for (let i = 0; i < 3; i += 1) await call(postponeRoute.POST as Handler, { id: essay.id });
    await call(frictionRoute.POST as Handler, { id: essay.id }, { reason: "TOO_OVERWHELMING" });
    await call(frictionRoute.POST as Handler, { id: essay.id }, { reason: "TOO_OVERWHELMING" });
    await call(frictionRoute.POST as Handler, { id: essay.id }, { reason: "LOW_ENERGY" });

    const { status, data } = await call(summaryRoute.GET as Handler, {}, undefined, "GET");
    expect(status).toBe(200);
    expect(data).toMatchObject({ days: 30, started: 6, startedViaNovaStart: 6, completed: 6 });
    expect(data.byType).toMatchObject({ TASK_STARTED: 6, TASK_COMPLETED: 6, ESTIMATE_OVERRUN: 3, TASK_POSTPONED: 3, TASK_ABANDONED: 1, FRICTION_REPORTED: 3 });
    expect(data.byCategory).toEqual([
      // 22/20, 31/30, 26/25 → 1.10, 1.03, 1.04
      { category: "READING", completed: 3, timed: 3, meanRatio: 1.06, estimatedMin: 75, actualMin: 79 },
      // 55/35, 52/40, 45/30 → 1.57, 1.30, 1.50
      { category: "STUDY", completed: 3, timed: 3, meanRatio: 1.46, estimatedMin: 105, actualMin: 152 },
    ]);
    expect(data.friction).toEqual([{ reason: "TOO_OVERWHELMING", count: 2 }, { reason: "LOW_ENERGY", count: 1 }]);
    expect(data.overallRatio).toBe(1.26);
  });

  it("covers only the days asked for, belongs to one user, and validates its input", async () => {
    const task = await addTask("Old");
    await finishSession(user, (await openSession(user, task.id, new Date(Date.now() - 20 * 86_400_000))).session.id, "COMPLETED", new Date(Date.now() - 20 * 86_400_000 + 600_000));
    expect((await call(summaryRoute.GET as Handler, {}, undefined, "GET", "?days=7")).data.completed).toBe(0);
    expect((await call(summaryRoute.GET as Handler, {}, undefined, "GET", "?days=30")).data.completed).toBe(1);
    expect((await call(summaryRoute.GET as Handler, {}, undefined, "GET", "?days=0")).status).toBe(422);
    session.userId = (await makeUser()).id;
    expect((await call(summaryRoute.GET as Handler, {}, undefined, "GET")).data.completed).toBe(0);
    session.userId = null;
    expect((await call(summaryRoute.GET as Handler, {}, undefined, "GET")).status).toBe(401);
  });
});
