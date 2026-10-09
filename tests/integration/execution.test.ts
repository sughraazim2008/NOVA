import { createGoal, createMilestone, createTask, getTask } from "@nova/database";
import { addDays } from "@nova/planner";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, makeUser, resetDb } from "./helpers";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", () => ({ getSessionUserId: async () => session.userId }));

import * as regenerateRoute from "@/app/api/plan/today/regenerate/route";
import * as todayRoute from "@/app/api/plan/today/route";
import * as completeRoute from "@/app/api/tasks/[id]/complete/route";
import * as postponeRoute from "@/app/api/tasks/[id]/postpone/route";
import * as reopenRoute from "@/app/api/tasks/[id]/reopen/route";
import * as skipRoute from "@/app/api/tasks/[id]/skip/route";
import * as startRoute from "@/app/api/tasks/[id]/start/route";
import { todayIn } from "@/server/clock";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, id?: string, body?: unknown) {
  const request = new Request("http://test.local/api", { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const params: Record<string, string> = id ? { id } : {};
  const response = await handler(request, { params: Promise.resolve(params) });
  const payload = (await response.json()) as { data?: any; error?: { code: string; details?: any } };
  return { status: response.status, ...payload };
}
const plan = async () => (await call(todayRoute.GET as Handler)).data;
const titles = (p: { entries: { task: { title: string }; outcome: string }[] }) => p.entries.map((e) => `${e.task.title}:${e.outcome}`);

let userId = "";
let ids: Record<string, string> = {};
const today = () => todayIn("UTC");

beforeEach(async () => {
  await resetDb();
  const user = await makeUser();
  userId = user.id;
  session.userId = userId;
  const goal = await createGoal(db, userId, { title: "Portfolio", deadline: addDays(today(), 30), dailyCapacityMin: 60 });
  const milestone = (await createMilestone(db, userId, goal.id, { title: "Design" }))!;
  ids = {};
  for (const [title, minutes, priority] of [["First", 30, "HIGH"], ["Second", 20, "MEDIUM"], ["Third", 20, "LOW"]] as const) {
    ids[title] = (await createTask(db, userId, milestone.id, { title, estimatedMin: minutes, priority }))!.id;
  }
});
afterAll(() => db.$disconnect());

describe("task actions", () => {
  it("require a session and hide other users' tasks", async () => {
    const handlers = [startRoute, completeRoute, reopenRoute, skipRoute, postponeRoute].map((r) => r.POST as Handler);
    session.userId = null;
    for (const handler of handlers) expect((await call(handler, ids.First)).status).toBe(401);
    session.userId = (await makeUser()).id;
    for (const handler of handlers) expect((await call(handler, ids.First)).status).toBe(404);
    expect((await getTask(db, userId, ids.First!))?.status).toBe("TODO");
  });

  it("start marks the task in progress and counts the start", async () => {
    await plan();
    const result = await call(startRoute.POST as Handler, ids.First);
    expect(result.data).toMatchObject({ status: "IN_PROGRESS", startCount: 1 });
    expect((await call(startRoute.POST as Handler, ids.First)).data.startCount).toBe(2);
    // Still the first thing in today's plan, now shown as in progress.
    const after = await plan();
    expect(after.entries[0]).toMatchObject({ outcome: "PENDING", task: { title: "First", status: "IN_PROGRESS" } });
  });

  it("complete finishes the task, marks the plan entry and records the time spent", async () => {
    await plan();
    const result = await call(completeRoute.POST as Handler, ids.First, { actualMin: 42 });
    expect(result.data).toMatchObject({ status: "DONE", actualMin: 42 });
    expect(result.data.completedAt).not.toBeNull();
    expect(titles(await plan())).toEqual(["First:COMPLETED", "Second:PENDING"]);
  });

  it("complete works with no body, and adds up time across sittings", async () => {
    await plan();
    expect((await call(completeRoute.POST as Handler, ids.First)).data).toMatchObject({ status: "DONE", actualMin: null });
    await call(reopenRoute.POST as Handler, ids.First);
    await call(completeRoute.POST as Handler, ids.First, { actualMin: 10 });
    await call(reopenRoute.POST as Handler, ids.First);
    expect((await call(completeRoute.POST as Handler, ids.First, { actualMin: 15 })).data.actualMin).toBe(25);
  });

  it("complete rejects an impossible duration", async () => {
    expect((await call(completeRoute.POST as Handler, ids.First, { actualMin: -5 })).status).toBe(422);
    expect((await getTask(db, userId, ids.First!))?.status).toBe("TODO");
  });

  it("reopen undoes a completion in both the task and the plan", async () => {
    await plan();
    await call(completeRoute.POST as Handler, ids.First);
    const result = await call(reopenRoute.POST as Handler, ids.First);
    expect(result.data).toMatchObject({ status: "TODO", completedAt: null });
    expect(titles(await plan())).toEqual(["First:PENDING", "Second:PENDING"]);
  });

  it("skip leaves the task as it is and marks only today's entry", async () => {
    await plan();
    const result = await call(skipRoute.POST as Handler, ids.First);
    expect(result.data).toMatchObject({ status: "TODO", postponeCount: 0 });
    expect(titles(await plan())).toEqual(["First:SKIPPED", "Second:PENDING"]);
  });

  it("skip refuses a task that is not in today's plan", async () => {
    await plan();
    // "Third" did not fit in the 60-minute day.
    const result = await call(skipRoute.POST as Handler, ids.Third);
    expect(result.status).toBe(409);
  });

  it("postpone moves the task to tomorrow by default and counts it", async () => {
    await plan();
    const result = await call(postponeRoute.POST as Handler, ids.First);
    expect(result.data).toMatchObject({ status: "DEFERRED", deferredUntil: addDays(today(), 1), postponeCount: 1 });
    expect(titles(await plan())).toEqual(["First:POSTPONED", "Second:PENDING"]);
  });

  it("postpone accepts a later date and refuses today or the past", async () => {
    const later = addDays(today(), 5);
    expect((await call(postponeRoute.POST as Handler, ids.First, { toDate: later })).data.deferredUntil).toBe(later);
    expect((await call(postponeRoute.POST as Handler, ids.Second, { toDate: today() })).status).toBe(422);
    expect((await call(postponeRoute.POST as Handler, ids.Second, { toDate: "not a date" })).status).toBe(422);
    expect((await getTask(db, userId, ids.Second!))?.status).toBe("TODO");
  });

  it("a task can be completed from outside today's plan without error", async () => {
    await plan();
    expect((await call(completeRoute.POST as Handler, ids.Third)).status).toBe(200);
    expect(titles(await plan())).toEqual(["First:PENDING", "Second:PENDING"]);
  });
});

describe("a day, start to finish", () => {
  it("frees time as tasks are skipped and postponed, and never plans a handled task again today", async () => {
    expect(titles(await plan())).toEqual(["First:PENDING", "Second:PENDING"]);

    await call(completeRoute.POST as Handler, ids.First);
    await call(skipRoute.POST as Handler, ids.Second);

    const rebuilt = (await call(regenerateRoute.POST as Handler)).data;
    // First took 30 of the 60 minutes; skipping Second spent none, so Third (20 min) now fits.
    expect(titles(rebuilt)).toEqual(["First:COMPLETED", "Second:SKIPPED", "Third:PENDING"]);
    expect(rebuilt.usedMin).toBe(50);

    await call(completeRoute.POST as Handler, ids.Third);
    const end = (await call(regenerateRoute.POST as Handler)).data;
    expect(titles(end)).toEqual(["First:COMPLETED", "Second:SKIPPED", "Third:COMPLETED"]);
    expect(end.emptyReason).toBeNull();
  });
});
