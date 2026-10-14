import { GAME, hasSurprise, sparksForTask } from "@nova/behaviour";
import { createGoal, createMilestone, createTask, listEvents } from "@nova/database";
import { addDays } from "@nova/planner";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, makeUser, resetDb } from "./helpers";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", () => ({ getSessionUserId: async () => session.userId }));

import * as meRoute from "@/app/api/me/route";
import * as todayRoute from "@/app/api/plan/today/route";
import * as progressRoute from "@/app/api/progress/route";
import * as openRoute from "@/app/api/start/[taskId]/route";
import * as finishRoute from "@/app/api/start/sessions/[id]/finish/route";
import * as stepRoute from "@/app/api/start/sessions/[id]/step/route";
import * as frictionRoute from "@/app/api/tasks/[id]/friction/route";
import { setLLMForTests } from "@/server/ai";
import { todayIn } from "@/server/clock";
import { resetRateLimits } from "@/server/rate-limit";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, params: Record<string, string> = {}, body?: unknown, method = "POST") {
  const request = new Request("http://test.local/api", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await handler(request, { params: Promise.resolve(params) });
  const payload = (await response.json()) as { data?: any };
  return { status: response.status, ...payload };
}
const progress = async () => (await call(progressRoute.GET as Handler, {}, undefined, "GET")).data;

let user: Awaited<ReturnType<typeof makeUser>>;
let taskId = "";

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  setLLMForTests(null); // built-in steps: four of them
  user = await makeUser();
  session.userId = user.id;
  const goal = await createGoal(db, user.id, { title: "Dissertation", deadline: addDays(todayIn("UTC"), 30), dailyCapacityMin: 120 });
  const milestone = (await createMilestone(db, user.id, goal.id, { title: "Draft" }))!;
  taskId = (await createTask(db, user.id, milestone.id, { title: "Write the introduction", estimatedMin: 30 }))!.id;
});
afterEach(() => setLLMForTests(undefined));
afterAll(() => db.$disconnect());

describe("GET /progress", () => {
  it("requires a session", async () => {
    session.userId = null;
    expect((await call(progressRoute.GET as Handler, {}, undefined, "GET")).status).toBe(401);
  });

  it("starts everyone at level one with nothing earned and nothing lost", async () => {
    const start = await progress();
    expect(start).toMatchObject({ sparks: 0, level: 1, nextLevelAt: 50, todayEarned: 0, awayDays: null, welcomeBack: false, gameMode: "FULL" });
    expect(start.momentum).toBeGreaterThan(0);
    expect(start.badges.filter((b: { earned: boolean }) => b.earned)).toEqual([]);
  });

  it("adds up a real session: steps, the first step of the day, a stuck moment, the task and a friction answer", async () => {
    const opened = await call(openRoute.POST as Handler, { taskId });
    const id = opened.data.session.id;

    await call(stepRoute.POST as Handler, { id }, { action: "done" });
    expect(await progress()).toMatchObject({ sparks: 15, todayEarned: 15 }); // 5 + 10 for the day's first step

    await call(stepRoute.POST as Handler, { id }, { action: "stuck" });
    await call(stepRoute.POST as Handler, { id }, { action: "done" });
    await call(stepRoute.POST as Handler, { id }, { action: "skip" });
    expect((await progress()).sparks).toBe(20); // one more step done; stuck and skip earn nothing

    await call(frictionRoute.POST as Handler, { id: taskId }, { reason: "TOO_OVERWHELMING" });
    expect((await progress()).sparks).toBe(20 + GAME.FRICTION);

    await call(finishRoute.POST as Handler, { id }, { outcome: "COMPLETED" });
    const completion = (await listEvents(db, user.id, { types: ["TASK_COMPLETED"] }))[0]!;
    const expected = 25 + sparksForTask(30) + (hasSurprise(completion.id) ? GAME.SURPRISE : 0);

    const end = await progress();
    expect(end).toMatchObject({ sparks: expected, todayEarned: expected, awayDays: 0, activeDays: 1 });
    expect(end.level).toBe(expected >= 50 ? 2 : 1);
    expect(end.badges.filter((b: { earned: boolean }) => b.earned).map((b: { id: string }) => b.id).sort()).toEqual(
      ["ASKED_FOR_HELP", "FIRST_FINISH", "FIRST_START", "SAID_WHY"].sort(),
    );
  });

  it("gives the same answer every time it is asked", async () => {
    const id = (await call(openRoute.POST as Handler, { taskId })).data.session.id;
    await call(stepRoute.POST as Handler, { id }, { action: "done" });
    await call(finishRoute.POST as Handler, { id }, { outcome: "COMPLETED" });
    expect(await progress()).toEqual(await progress());
  });

  it("belongs to one user", async () => {
    const id = (await call(openRoute.POST as Handler, { taskId })).data.session.id;
    await call(stepRoute.POST as Handler, { id }, { action: "done" });
    session.userId = (await makeUser()).id;
    expect((await progress()).sparks).toBe(0);
  });

  it("reports the chosen mode, which changes nothing about what was earned", async () => {
    const id = (await call(openRoute.POST as Handler, { taskId })).data.session.id;
    await call(stepRoute.POST as Handler, { id }, { action: "done" });
    for (const gameMode of ["QUIET", "OFF", "FULL"]) {
      expect((await call(meRoute.PATCH as Handler, {}, { gameMode }, "PATCH")).status).toBe(200);
      expect(await progress()).toMatchObject({ gameMode, sparks: 15 });
    }
    expect((await call(meRoute.PATCH as Handler, {}, { gameMode: "HARDCORE" }, "PATCH")).status).toBe(422);
  });

  it("leaves the plan exactly as it was, whatever has been earned", async () => {
    const plan = async () => (await call(todayRoute.GET as Handler, {}, undefined, "GET")).data.entries.map((e: any) => [e.taskId, e.score, e.reason, e.plannedMin]);
    const before = await plan();
    const id = (await call(openRoute.POST as Handler, { taskId })).data.session.id;
    for (let i = 0; i < 3; i += 1) await call(stepRoute.POST as Handler, { id }, { action: "done" });
    await call(frictionRoute.POST as Handler, { id: taskId }, { reason: "LOW_ENERGY" });
    expect((await progress()).sparks).toBeGreaterThan(0);
    expect(await plan()).toEqual(before);
  });
});
