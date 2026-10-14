import { FakeLLMClient } from "@nova/ai";
import { addDependency, createGoal, createMilestone, createTask, getTask, listDependencies, listEvents, listFriction, listTasks } from "@nova/database";
import { addDays } from "@nova/planner";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tasksReply } from "../ai/fixtures";
import { db, makeUser, resetDb } from "./helpers";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", () => ({ getSessionUserId: async () => session.userId }));

import * as decomposeRoute from "@/app/api/goals/decompose/route";
import * as todayRoute from "@/app/api/plan/today/route";
import * as decideRoute from "@/app/api/tasks/[id]/decide/route";
import * as frictionRoute from "@/app/api/tasks/[id]/friction/route";
import * as skipRoute from "@/app/api/tasks/[id]/skip/route";
import * as startRoute from "@/app/api/tasks/[id]/start/route";
import { setLLMForTests } from "@/server/ai";
import { todayIn } from "@/server/clock";
import { resetRateLimits } from "@/server/rate-limit";
import { finishSession, openSession } from "@/server/services/start";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, params: Record<string, string> = {}, body?: unknown, method = "POST") {
  const request = new Request("http://test.local/api", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await handler(request, { params: Promise.resolve(params) });
  const payload = (await response.json()) as { data?: any; error?: { code: string } };
  return { status: response.status, ...payload };
}
const friction = (id: string, reason: string, note?: string) => call(frictionRoute.POST as Handler, { id }, { reason, ...(note ? { note } : {}) });
const plan = async () => (await call(todayRoute.GET as Handler, {}, undefined, "GET")).data;

let user: Awaited<ReturnType<typeof makeUser>>;
let milestoneId = "";
const today = () => todayIn("UTC");

async function addTask(title: string, estimatedMin: number, overrides: object = {}) {
  return (await createTask(db, user.id, milestoneId, { title, estimatedMin, ...overrides }))!;
}
const titles = async () => (await listTasks(db, user.id)).map((t) => `${t.title} · ${t.estimatedMin} · ${t.status}`);

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  setLLMForTests(null);
  user = await makeUser();
  session.userId = user.id;
  const goal = await createGoal(db, user.id, { title: "Dissertation", deadline: addDays(today(), 30), dailyCapacityMin: 120 });
  milestoneId = (await createMilestone(db, user.id, goal.id, { title: "Draft" }))!.id;
});
afterEach(() => setLLMForTests(undefined));
afterAll(() => db.$disconnect());

describe("too overwhelming", () => {
  it("shrinks the task to a 30-minute start and keeps the rest as a follow-on that comes after it", async () => {
    const big = await addTask("Write the literature review", 60);
    const later = await addTask("Send the draft to the supervisor", 10);
    await addDependency(db, user.id, { taskId: later.id, dependsOnTaskId: big.id });

    const result = await friction(big.id, "TOO_OVERWHELMING");
    expect(result.status).toBe(201);
    expect(result.data.replan).toMatchObject({ action: "SHRINK", askToKeep: false });
    expect(result.data.replan.message).toContain("30-minute start");
    expect(result.data.friction.appliedAction).toBe("SHRINK");

    const rest = (await getTask(db, user.id, result.data.replan.createdTaskIds[0]))!;
    expect(rest).toMatchObject({ title: "Finish: Write the literature review", estimatedMin: 30, origin: "SPLIT", parentTaskId: big.id });
    expect((await getTask(db, user.id, big.id))?.estimatedMin).toBe(30);

    // The follow-on waits for the start, and what waited for the whole task now waits for the follow-on.
    expect((await listDependencies(db, user.id)).sort((a, b) => a.taskId.localeCompare(b.taskId))).toEqual(
      [{ taskId: rest.id, dependsOnTaskId: big.id }, { taskId: later.id, dependsOnTaskId: rest.id }].sort((a, b) => a.taskId.localeCompare(b.taskId)),
    );

    const events = await listEvents(db, user.id, { types: ["REPLAN_APPLIED", "FRICTION_REPORTED", "TASK_CREATED"] });
    expect(events.map((e) => e.type).sort()).toEqual(["FRICTION_REPORTED", "REPLAN_APPLIED", "TASK_CREATED"]);
    expect(events.find((e) => e.type === "REPLAN_APPLIED")?.payload).toEqual({ actions: [{ taskId: big.id, action: "SHRINK", frictionReason: "TOO_OVERWHELMING" }] });
  });

  it("shrinks further each time the same reason is given", async () => {
    const big = await addTask("Write the chapter", 60);
    await friction(big.id, "TOO_OVERWHELMING");
    await friction(big.id, "TOO_OVERWHELMING");
    expect((await getTask(db, user.id, big.id))?.estimatedMin).toBe(15);
    await friction(big.id, "TOO_OVERWHELMING");
    expect((await getTask(db, user.id, big.id))?.estimatedMin).toBe(5);
    const last = await friction(big.id, "TOO_OVERWHELMING");
    expect(last.data.replan).toMatchObject({ action: "DROP_SUGGESTED", askToKeep: true });
    // Nothing was lost along the way: the minutes add back up to the original hour.
    expect((await listTasks(db, user.id)).reduce((sum, t) => sum + t.estimatedMin, 0)).toBe(60);
  });
});

describe("not enough time", () => {
  it("splits the task into chained parts that add up to the original", async () => {
    const long = await addTask("Revise the methods chapter", 90);
    const after = await addTask("Print the chapter", 5);
    await addDependency(db, user.id, { taskId: after.id, dependsOnTaskId: long.id });

    const result = await friction(long.id, "NOT_ENOUGH_TIME");
    expect(result.data.replan).toMatchObject({ action: "SPLIT" });
    expect(await titles()).toEqual([
      "Revise the methods chapter (part 1 of 3) · 30 · TODO",
      "Print the chapter · 5 · TODO",
      "Revise the methods chapter (part 2 of 3) · 30 · TODO",
      "Revise the methods chapter (part 3 of 3) · 30 · TODO",
    ]);
    const [part2, part3] = result.data.replan.createdTaskIds;
    const edges = await listDependencies(db, user.id);
    expect(edges).toContainEqual({ taskId: part2, dependsOnTaskId: long.id });
    expect(edges).toContainEqual({ taskId: part3, dependsOnTaskId: part2 });
    expect(edges).toContainEqual({ taskId: after.id, dependsOnTaskId: part3 });
    expect(edges).toHaveLength(3);
  });
});

describe("low energy", () => {
  it("moves demanding work to tomorrow and out of today's plan", async () => {
    const hard = await addTask("Derive the main result", 45, { energyDemand: "HIGH" });
    const light = await addTask("Tidy the reference list", 20, { energyDemand: "LOW" });
    expect((await plan()).entries.map((e: any) => e.task.title)).toContain("Derive the main result");

    const result = await friction(hard.id, "LOW_ENERGY");
    expect(result.data.replan).toMatchObject({ action: "RETIME" });
    expect(await getTask(db, user.id, hard.id)).toMatchObject({ status: "DEFERRED", deferredUntil: addDays(today(), 1), postponeCount: 0 });
    expect((await plan()).entries.map((e: any) => e.task.title)).toEqual([light.title]);
  });
});

describe("don't understand", () => {
  it("rewords the task with the model, using what the user said was unclear", async () => {
    const vague = await addTask("Sort out the framework", 30);
    const llm = new FakeLLMClient().on("task-rewriter", {
      title: "Write one paragraph naming the theory the dissertation uses and why",
      description: "In the methods chapter document. Done when the paragraph names the theory and gives one reason.",
    });
    setLLMForTests(llm);
    const result = await friction(vague.id, "DONT_UNDERSTAND", "which framework?");
    expect(result.data.replan).toMatchObject({ action: "REWRITE" });
    expect(result.data.replan.message).toContain("Write one paragraph");
    expect((await getTask(db, user.id, vague.id))?.title).toBe("Write one paragraph naming the theory the dissertation uses and why");
    expect(llm.calls[0]?.user).toContain("which framework?");
  });

  it("changes nothing and says so when the model cannot help", async () => {
    const vague = await addTask("Sort out the framework", 30);
    const result = await friction(vague.id, "DONT_UNDERSTAND");
    expect(result.data.replan).toMatchObject({ action: null });
    expect(result.data.replan.message).toContain("couldn't reword");
    expect(result.data.friction.appliedAction).toBeNull();
    expect((await getTask(db, user.id, vague.id))?.title).toBe("Sort out the framework");
    expect(await listEvents(db, user.id, { types: ["REPLAN_APPLIED"] })).toEqual([]);
  });
});

describe("don't want to", () => {
  it("asks whether the task still matters, and only the user's answer changes it", async () => {
    const meh = await addTask("Reorganise the bibliography", 30);
    const result = await friction(meh.id, "DONT_WANT_TO");
    expect(result.data.replan).toMatchObject({ action: "DROP_SUGGESTED", askToKeep: true });
    expect((await getTask(db, user.id, meh.id))?.status).toBe("TODO");

    expect((await call(decideRoute.POST as Handler, { id: meh.id }, { choice: "KEEP" })).data.status).toBe("TODO");
    expect((await call(decideRoute.POST as Handler, { id: meh.id }, { choice: "NEXT_WEEK" })).data).toMatchObject({ status: "DEFERRED", deferredUntil: addDays(today(), 7) });
    expect((await call(decideRoute.POST as Handler, { id: meh.id }, { choice: "DROP" })).data.status).toBe("DROPPED");
    expect((await call(decideRoute.POST as Handler, { id: meh.id }, { choice: "BURN" })).status).toBe(422);
  });

  it("is refused for another user's task", async () => {
    const mine = await addTask("Mine", 30);
    session.userId = (await makeUser()).id;
    expect((await call(decideRoute.POST as Handler, { id: mine.id }, { choice: "DROP" })).status).toBe(404);
    expect((await friction(mine.id, "DONT_WANT_TO")).status).toBe(404);
  });
});

describe("other cases", () => {
  it("changes nothing for a task that is already finished, but keeps the answer", async () => {
    const done = await addTask("Done already", 60, {});
    await db.task.update({ where: { id: done.id }, data: { status: "DONE" } });
    const result = await friction(done.id, "TOO_OVERWHELMING");
    expect(result.data.replan.action).toBeNull();
    expect(await listTasks(db, user.id)).toHaveLength(1);
    expect(await listFriction(db, user.id)).toHaveLength(1);
  });

  it("records when a task NOVA changed is then started: the sign that the change helped", async () => {
    const big = await addTask("Write the literature review", 60);
    await friction(big.id, "TOO_OVERWHELMING");
    expect((await listFriction(db, user.id))[0]?.startedAfter).toBeNull();
    await call(startRoute.POST as Handler, { id: big.id });
    expect((await listFriction(db, user.id))[0]?.startedAfter).toBe(true);
  });
});

describe("the plan learns how long things take", () => {
  it("plans study tasks longer after several of them overran, and says why", async () => {
    // Three study tasks that each took 1.5× their estimate: multiplier (3 × 1.5 + 3) / 6 = 1.25.
    for (let i = 0; i < 3; i += 1) {
      const t = await addTask(`Practice set ${i}`, 40, { category: "STUDY" });
      const start = new Date(Date.now() - (i + 1) * 3_600_000);
      await finishSession(user, (await openSession(user, t.id, start)).session.id, "COMPLETED", new Date(start.getTime() + 60 * 60_000));
    }
    await addTask("Review chapter four", 40, { category: "STUDY" });
    const entry = (await plan()).entries.find((e: any) => e.task.title === "Review chapter four");
    expect(entry.plannedMin).toBe(50);
    expect(entry.reason).toContain("Planned 50 min: your study tasks usually take 1.25× the estimate.");
  });

  it("tells the task writer what it has learned, without the user's own words", async () => {
    const t = await addTask("Big thing", 60);
    await friction(t.id, "TOO_OVERWHELMING", "my private note");
    const other = await addTask("Other big thing", 60);
    await friction(other.id, "TOO_OVERWHELMING");
    // The scripted plan's milestone dates are fixed; clear them so they are never "in the past".
    const scripted = new FakeLLMClient()
      .on("goal-parser", { title: "Build a portfolio", desiredOutcome: null, deadline: addDays(today(), 40), priority: "MEDIUM", constraints: null, availableMinPerDay: 60 })
      .on("goal-decomposer", { milestones: [{ title: "Design", targetDate: null }, { title: "Development", targetDate: null }, { title: "Deployment", targetDate: null }] })
      .on("task-generator", tasksReply)
      .on("task-reality-check", { error: { kind: "UNAVAILABLE", message: "not needed here" } });
    setLLMForTests(scripted);
    await call(decomposeRoute.POST as Handler, {}, { text: "Build a portfolio by the end of next month", deadline: addDays(today(), 40) });
    const prompt = scripted.callsFor("task-generator")[0]?.user ?? "";
    expect(prompt).toContain("make tasks small and concrete");
    expect(prompt).not.toContain("my private note");
  });
});

describe("Gate B: three tasks fail for three reasons, and the plan changes", () => {
  it("responds differently to each, and the next plan reflects all three", async () => {
    const review = await addTask("Write the literature review", 60, { energyDemand: "MEDIUM" });
    const proof = await addTask("Derive the main proof", 60, { energyDemand: "HIGH" });
    const methods = await addTask("Revise the methods chapter", 90, { energyDemand: "MEDIUM" });

    const before = await plan();
    expect(before.entries.map((e: any) => `${e.task.title}:${e.plannedMin}`).sort()).toEqual(["Derive the main proof:60", "Write the literature review:60"]);

    for (const id of before.entries.map((e: any) => e.taskId)) await call(skipRoute.POST as Handler, { id });
    const answers = [
      await friction(review.id, "TOO_OVERWHELMING"),
      await friction(proof.id, "LOW_ENERGY"),
      await friction(methods.id, "NOT_ENOUGH_TIME"),
    ].map((r) => r.data.replan.action);
    expect(answers).toEqual(["SHRINK", "RETIME", "SPLIT"]);

    expect(await titles()).toEqual([
      "Write the literature review · 30 · TODO",
      "Derive the main proof · 60 · DEFERRED",
      "Revise the methods chapter (part 1 of 3) · 30 · TODO",
      "Finish: Write the literature review · 30 · TODO",
      "Revise the methods chapter (part 2 of 3) · 30 · TODO",
      "Revise the methods chapter (part 3 of 3) · 30 · TODO",
    ]);

    // Today: the two skipped tasks stay handled; the freed time goes to work that can now start.
    const after = await plan();
    expect(after.entries.map((e: any) => `${e.task.title}:${e.outcome}`)).toEqual([
      "Write the literature review:SKIPPED",
      "Derive the main proof:SKIPPED",
      "Revise the methods chapter (part 1 of 3):PENDING",
    ]);
    expect(await listEvents(db, user.id, { types: ["REPLAN_APPLIED"] })).toHaveLength(3);
  });
});
