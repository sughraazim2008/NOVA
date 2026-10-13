import { FakeLLMClient } from "@nova/ai";
import { createGoal, createMilestone, createTask, getTask } from "@nova/database";
import { addDays } from "@nova/planner";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, makeUser, resetDb } from "./helpers";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", () => ({ getSessionUserId: async () => session.userId }));

import * as todayRoute from "@/app/api/plan/today/route";
import * as openRoute from "@/app/api/start/[taskId]/route";
import * as finishRoute from "@/app/api/start/sessions/[id]/finish/route";
import * as sessionRoute from "@/app/api/start/sessions/[id]/route";
import * as stepRoute from "@/app/api/start/sessions/[id]/step/route";
import { setLLMForTests } from "@/server/ai";
import { todayIn } from "@/server/clock";
import { resetRateLimits } from "@/server/rate-limit";
import { finishSession, openSession } from "@/server/services/start";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, params: Record<string, string>, body?: unknown, method = "POST") {
  const request = new Request("http://test.local/api", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await handler(request, { params: Promise.resolve(params) });
  const payload = (await response.json()) as { data?: any; error?: { code: string } };
  return { status: response.status, ...payload };
}
const open = (taskId: string) => call(openRoute.POST as Handler, { taskId });
const step = (id: string, body: unknown) => call(stepRoute.POST as Handler, { id }, body);
const finish = (id: string, outcome: string) => call(finishRoute.POST as Handler, { id }, { outcome });

const modelSteps = {
  steps: [
    { instruction: "Open your dissertation document.", estimatedMin: 2, doneLabel: "I'm there" },
    { instruction: "Find the introduction section.", estimatedMin: 3, doneLabel: "Found it" },
    { instruction: "Write three terrible sentences.", estimatedMin: 5, doneLabel: "Written" },
  ],
};
const smaller = { instruction: "Write one sentence saying what question it asks.", estimatedMin: 2, doneLabel: "Written" };

let user: Awaited<ReturnType<typeof makeUser>>;
let taskId = "";
let llm: FakeLLMClient;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  llm = new FakeLLMClient().on("task-breaker", modelSteps).on("step-replacer", smaller);
  setLLMForTests(llm);
  user = await makeUser();
  session.userId = user.id;
  const goal = await createGoal(db, user.id, { title: "Finish dissertation", deadline: addDays(todayIn("UTC"), 30), dailyCapacityMin: 90 });
  const milestone = (await createMilestone(db, user.id, goal.id, { title: "Draft" }))!;
  taskId = (await createTask(db, user.id, milestone.id, { title: "Write dissertation introduction", estimatedMin: 60 }))!.id;
});
afterEach(() => setLLMForTests(undefined));
afterAll(() => db.$disconnect());

describe("opening a session", () => {
  it("starts the task and returns the model's steps, all pending", async () => {
    const result = await open(taskId);
    expect(result.status).toBe(200);
    expect(result.data.session.steps.map((s: { instruction: string; state: string }) => [s.instruction, s.state])).toEqual(
      modelSteps.steps.map((s) => [s.instruction, "PENDING"]),
    );
    expect(result.data.session).toMatchObject({ currentStep: 0, stuckCount: 0, endedAt: null, outcome: null });
    expect(result.data.task).toMatchObject({ status: "IN_PROGRESS", startCount: 1 });
    expect(result.data.goal.title).toBe("Finish dissertation");
    expect(result.data.tailored).toBe(true);
    expect(llm.calls[0]?.user).toContain("Stage: Draft");
  });

  it("returns the same session when opened again, without starting twice or asking the model again", async () => {
    const first = await open(taskId);
    await step(first.data.session.id, { action: "done" });
    const again = await open(taskId);
    expect(again.data.session.id).toBe(first.data.session.id);
    expect(again.data.session.currentStep).toBe(1);
    expect(again.data.task.startCount).toBe(1);
    expect(llm.callsFor("task-breaker")).toHaveLength(1);
    expect(await db.startSession.count()).toBe(1);
  });

  it("opens only one session when the button is tapped twice at once", async () => {
    const [a, b] = await Promise.all([open(taskId), open(taskId)]);
    expect(a.data.session.id).toBe(b.data.session.id);
    expect(await db.startSession.count()).toBe(1);
    expect((await getTask(db, user.id, taskId))?.startCount).toBe(1);
  });

  it.each([
    ["no model is configured", null],
    ["the model is unreachable", new FakeLLMClient().on("task-breaker", { error: { kind: "UNAVAILABLE", message: "down" } })],
    ["the model answers with nonsense twice", new FakeLLMClient().on("task-breaker", { nonsense: true })],
  ])("still starts, with the built-in opener, when %s", async (_name, client) => {
    setLLMForTests(client);
    const result = await open(taskId);
    expect(result.status).toBe(200);
    expect(result.data.tailored).toBe(false);
    expect(result.data.session.steps.length).toBeGreaterThanOrEqual(3);
    expect(result.data.session.steps[0].instruction).toContain("Write dissertation introduction");
    expect(result.data.task.status).toBe("IN_PROGRESS");
  });

  it("refuses a finished task, a missing task and another user's task", async () => {
    await db.task.update({ where: { id: taskId }, data: { status: "DONE" } });
    expect((await open(taskId)).status).toBe(409);
    expect((await open("no-such-task")).status).toBe(404);
    await db.task.update({ where: { id: taskId }, data: { status: "TODO" } });
    session.userId = (await makeUser()).id;
    expect((await open(taskId)).status).toBe(404);
    session.userId = null;
    expect((await open(taskId)).status).toBe(401);
    expect(await db.startSession.count()).toBe(0);
  });
});

describe("working through the steps", () => {
  it("advances on done and skip, and reports when the steps run out", async () => {
    const id = (await open(taskId)).data.session.id;
    expect((await step(id, { action: "done" })).data.session.currentStep).toBe(1);
    expect((await step(id, { action: "skip" })).data.session.currentStep).toBe(2);
    const last = await step(id, { action: "done" });
    expect(last.data.session.steps.map((s: { state: string }) => s.state)).toEqual(["DONE", "SKIPPED", "DONE"]);
    expect(last.data.session.currentStep).toBe(3);
    expect((await step(id, { action: "done" })).status).toBe(409);
  });

  it("on stuck, swaps in a smaller step from the model and tells it what the user said", async () => {
    const id = (await open(taskId)).data.session.id;
    await step(id, { action: "done" });
    await step(id, { action: "done" });
    const result = await step(id, { action: "stuck", note: "I don't know what the argument is" });
    const steps = result.data.session.steps;
    expect(steps.map((s: { state: string }) => s.state)).toEqual(["DONE", "DONE", "REPLACED", "PENDING"]);
    expect(steps[3].instruction).toBe(smaller.instruction);
    expect(result.data.session).toMatchObject({ currentStep: 3, stuckCount: 1 });
    expect(llm.callsFor("step-replacer")[0]?.user).toContain("I don't know what the argument is");
  });

  it("on stuck with no usable model, cuts the step down itself", async () => {
    const id = (await open(taskId)).data.session.id;
    setLLMForTests(new FakeLLMClient().on("step-replacer", { error: { kind: "UNAVAILABLE", message: "down" } }));
    const result = await step(id, { action: "stuck" });
    expect(result.status).toBe(200);
    const replacement = result.data.session.steps[1];
    expect(replacement.instruction).toContain("Set a timer for 2 minutes");
    expect(replacement.estimatedMin).toBeLessThanOrEqual(2);
  });

  it("reads back a session, and rejects an unknown action", async () => {
    const id = (await open(taskId)).data.session.id;
    await step(id, { action: "done" });
    const read = await call(sessionRoute.GET as Handler, { id }, undefined, "GET");
    expect(read.data.session.currentStep).toBe(1);
    expect((await step(id, { action: "explode" })).status).toBe(422);
  });

  it("keeps another user out of a session", async () => {
    const id = (await open(taskId)).data.session.id;
    session.userId = (await makeUser()).id;
    expect((await step(id, { action: "done" })).status).toBe(404);
    expect((await finish(id, "COMPLETED")).status).toBe(404);
    expect((await call(sessionRoute.GET as Handler, { id }, undefined, "GET")).status).toBe(404);
  });
});

describe("finishing", () => {
  const at = (minutes: number) => new Date(Date.parse("2026-10-13T18:00:00.000Z") + minutes * 60_000);

  it("COMPLETED finishes the task and records how long the sitting took", async () => {
    const view = await openSession(user, taskId, at(0));
    const done = await finishSession(user, view.session.id, "COMPLETED", at(55));
    expect(done.sessionMin).toBe(55);
    expect(done.task).toMatchObject({ status: "DONE", actualMin: 55, estimatedMin: 60 });
    expect(done.session).toMatchObject({ outcome: "COMPLETED", endedAt: at(55).toISOString() });
  });

  it("PARTIAL keeps the task in progress, keeps the time, and adds up across sittings", async () => {
    const first = await openSession(user, taskId, at(0));
    const partial = await finishSession(user, first.session.id, "PARTIAL", at(20));
    expect(partial.task).toMatchObject({ status: "IN_PROGRESS", actualMin: 20 });

    const second = await openSession(user, taskId, at(100));
    expect(second.session.id).not.toBe(first.session.id);
    expect(second.task.startCount).toBe(2);
    const done = await finishSession(user, second.session.id, "COMPLETED", at(130));
    expect(done.task).toMatchObject({ status: "DONE", actualMin: 50 });
  });

  it("ABANDONED keeps the time and leaves the task open", async () => {
    const view = await openSession(user, taskId, at(0));
    const left = await finishSession(user, view.session.id, "ABANDONED", at(4));
    expect(left.task).toMatchObject({ status: "IN_PROGRESS", actualMin: 4 });
    expect(left.session.outcome).toBe("ABANDONED");
  });

  it("updates today's plan: completed entries are done, partial ones are not planned again today", async () => {
    const plan = async () => (await call(todayRoute.GET as Handler, {}, undefined, "GET")).data;
    expect((await plan()).entries[0]).toMatchObject({ outcome: "PENDING" });

    const id = (await open(taskId)).data.session.id;
    expect((await finish(id, "PARTIAL")).status).toBe(200);
    expect((await plan()).entries[0]).toMatchObject({ outcome: "PARTIAL", task: { status: "IN_PROGRESS" } });

    const second = (await open(taskId)).data.session.id;
    await finish(second, "COMPLETED");
    expect((await plan()).entries[0]).toMatchObject({ outcome: "COMPLETED", task: { status: "DONE" } });
  });

  it("cannot be finished twice, and takes no more steps once finished", async () => {
    const id = (await open(taskId)).data.session.id;
    expect((await finish(id, "COMPLETED")).status).toBe(200);
    expect((await finish(id, "COMPLETED")).status).toBe(409);
    expect((await step(id, { action: "done" })).status).toBe(409);
    expect((await finish(id, "SOMETHING")).status).toBe(422);
    expect((await getTask(db, user.id, taskId))?.status).toBe("DONE");
  });
});
