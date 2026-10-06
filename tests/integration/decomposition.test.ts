import { SAMPLE_SENTENCES, type LLMClient } from "@nova/ai";
import * as database from "@nova/database";
import { getGoalTree, listEvents } from "@nova/database";
import type { GoalDraft } from "@nova/types";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { happyLLM } from "../ai/fixtures";
import { db, makeUser, resetDb } from "./helpers";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", () => ({ getSessionUserId: async () => session.userId }));

import * as statusRoute from "@/app/api/ai/status/route";
import * as confirmRoute from "@/app/api/goals/confirm/route";
import * as decomposeRoute from "@/app/api/goals/decompose/route";
import { setLLMForTests } from "@/server/ai";
import { todayIn } from "@/server/clock";
import { resetRateLimits } from "@/server/rate-limit";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function post(handler: Handler, body: unknown) {
  const request = new Request("http://test.local/api", { method: "POST", body: JSON.stringify(body) });
  const response = await handler(request, { params: Promise.resolve({}) });
  const payload = (await response.json()) as { data?: any; error?: { code: string; message: string; details?: any } };
  return { status: response.status, ...payload };
}

const decompose = (body: unknown) => post(decomposeRoute.POST as Handler, body);
const confirm = (draft: GoalDraft, aiTitles: { key: string; title: string }[] = []) => post(confirmRoute.POST as Handler, { draft, aiTitles });
const titlesOf = (draft: GoalDraft) => draft.tasks.map((t) => ({ key: t.key, title: t.realityCheck?.original ?? t.title }));

// The fixture plan is dated for October 2026; give it a deadline that is always in the future.
const future = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 40);
  return date.toISOString().slice(0, 10);
};
const scripted = (): LLMClient => {
  const deadline = future();
  const llm = happyLLM();
  // Replace the dated replies with ones relative to the real today.
  return {
    name: llm.name,
    model: llm.model,
    async generate(request) {
      const reply = await llm.generate(request);
      if (!reply.ok) return reply;
      if (request.task === "goal-parser") return { ok: true, value: { ...(reply.value as object), deadline } };
      if (request.task === "goal-decomposer") {
        return { ok: true, value: { milestones: (reply.value as { milestones: object[] }).milestones.map((m) => ({ ...m, targetDate: null })) } };
      }
      return reply;
    },
  };
};

let userId = "";

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  setLLMForTests(null);
  userId = (await makeUser()).id;
  session.userId = userId;
});
afterEach(() => {
  setLLMForTests(undefined);
  vi.restoreAllMocks();
});
afterAll(() => db.$disconnect());

describe("POST /goals/decompose", () => {
  it("requires a session", async () => {
    session.userId = null;
    expect((await decompose({ text: SAMPLE_SENTENCES[0] })).status).toBe(401);
  });

  it("rejects a sentence too short to be a goal", async () => {
    expect((await decompose({ text: "hi" })).status).toBe(422);
  });

  it("returns a draft from the model and saves nothing", async () => {
    setLLMForTests(scripted());
    const result = await decompose({ text: "Build a portfolio by the end of next month, an hour a day." });
    expect(result.status).toBe(200);
    expect(result.data.goal.title).toBe("Build a portfolio");
    expect(result.data.milestones).toHaveLength(3);
    expect(result.data.tasks[0]).toMatchObject({ title: "Choose the three projects to showcase", realityCheck: { verdict: "REWRITTEN", original: "Work on portfolio" } });
    expect(await db.goal.count()).toBe(0);
    expect(await db.task.count()).toBe(0);
    expect(await db.behaviourEvent.count()).toBe(0);
  });

  it("asks for a deadline when the sentence has none", async () => {
    const llm = scripted();
    setLLMForTests({ ...llm, generate: async (request) => {
      const reply = await llm.generate(request);
      return reply.ok && request.task === "goal-parser" ? { ok: true, value: { ...(reply.value as object), deadline: null } } : reply;
    } });
    const result = await decompose({ text: "Build a portfolio some day" });
    expect(result.status).toBe(422);
    expect(result.error?.details).toEqual([{ path: "deadline", message: "No deadline was found in your sentence." }]);
  });

  it("answers 503 when the model is unreachable", async () => {
    setLLMForTests({ name: "down", model: "none", generate: async () => ({ ok: false, error: { kind: "UNAVAILABLE", message: "timeout" } }) });
    const result = await decompose({ text: "Build a portfolio by next month" });
    expect(result.status).toBe(503);
    expect(result.error?.code).toBe("AI_UNAVAILABLE");
  });

  it("answers 503 when the model never produces a usable plan", async () => {
    setLLMForTests({ name: "bad", model: "none", generate: async () => ({ ok: true, value: { nonsense: true } }) });
    expect((await decompose({ text: "Build a portfolio by next month" })).status).toBe(503);
  });

  it("limits how often one user can ask", async () => {
    const statuses = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await decompose({ text: SAMPLE_SENTENCES[0] })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429]);
  });

  describe("sample mode (no model configured)", () => {
    it("reports its status and the sentences it knows", async () => {
      const response = await (statusRoute.GET as Handler)(new Request("http://test.local/api"), { params: Promise.resolve({}) });
      expect((await response.json()).data).toEqual({ mode: "sample", model: null, examples: SAMPLE_SENTENCES });
    });

    it("returns the pre-written plan for a known sentence, labelled as a sample", async () => {
      const result = await decompose({ text: SAMPLE_SENTENCES[0] });
      expect(result.status).toBe(200);
      expect(result.data.notes[0]).toContain("Sample plan");
      expect(result.data.milestones).toHaveLength(5);
    });

    it("explains itself for any other sentence instead of inventing a plan", async () => {
      const result = await decompose({ text: "Learn to juggle five balls by spring" });
      expect(result.status).toBe(503);
      expect(result.error?.message).toContain("No AI model is connected");
    });
  });
});

describe("POST /goals/confirm", () => {
  const sample = async (): Promise<GoalDraft> => (await decompose({ text: SAMPLE_SENTENCES[1] })).data;

  it("saves the goal, milestones, tasks and prerequisites together", async () => {
    const draft = await sample();
    const result = await confirm(draft, titlesOf(draft));
    expect(result.status).toBe(201);

    const tree = await getGoalTree(db, userId, result.data.id);
    expect(tree?.goal).toMatchObject({ title: draft.goal.title, deadline: draft.goal.deadline, sourceText: SAMPLE_SENTENCES[1] });
    expect(tree?.milestones.map((m) => m.title)).toEqual(draft.milestones.map((m) => m.title));
    const saved = tree?.milestones.flatMap((m) => m.tasks) ?? [];
    expect(saved.map((t) => t.title)).toEqual(draft.tasks.map((t) => t.title));
    expect(saved.every((t) => t.origin === "AI" && t.status === "TODO")).toBe(true);
    expect(tree?.dependencies).toHaveLength(draft.tasks.reduce((n, t) => n + t.dependsOn.length, 0));

    // A prerequisite in the draft is a prerequisite in the database.
    const byTitle = new Map(saved.map((t) => [t.title, t.id]));
    const sketch = draft.tasks.find((t) => t.title.startsWith("Sketch"))!;
    const firstPrerequisite = draft.tasks.find((t) => t.key === sketch.dependsOn[0])!;
    expect(tree?.dependencies).toContainEqual({ taskId: byTitle.get(sketch.title), dependsOnTaskId: byTitle.get(firstPrerequisite.title) });
  });

  it("records what the reviewer changed", async () => {
    const draft = await sample();
    const proposed = titlesOf(draft);
    const removed = draft.tasks.at(-1)!;
    const edited: GoalDraft = {
      ...draft,
      tasks: [
        ...draft.tasks.slice(0, -1).map((t, i) => (i === 1 ? { ...t, title: "Collect three portfolio sites and note one idea from each" } : t)),
        { ...draft.tasks[1]!, key: "user-1", title: "Buy the domain name", dependsOn: [], source: "USER" as const, realityCheck: null },
      ].map((t) => ({ ...t, dependsOn: t.dependsOn.filter((key) => key !== removed.key) })),
    };
    const result = await confirm(edited, proposed);
    expect(result.status).toBe(201);

    const events = await listEvents(db, userId, { types: ["DECOMPOSITION_CONFIRMED"] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ goalId: result.data.id });
    expect(events[0]?.payload).toMatchObject({
      // One task was rewritten by the reality check before the reviewer saw it, so it counts as edited too.
      accepted: proposed.length - 3,
      edited: 2,
      deleted: 1,
      added: 1,
    });
    const tree = await getGoalTree(db, userId, result.data.id);
    expect(tree?.milestones.flatMap((m) => m.tasks).find((t) => t.title === "Buy the domain name")?.origin).toBe("USER");
  });

  const broken: [string, (draft: GoalDraft) => GoalDraft][] = [
    ["a loop between tasks", (d) => ({ ...d, tasks: d.tasks.map((t, i) => (i === 0 ? { ...t, dependsOn: [d.tasks[2]!.key] } : t)) })],
    ["a prerequisite that is not in the draft", (d) => ({ ...d, tasks: d.tasks.map((t, i) => (i === 0 ? { ...t, dependsOn: ["ghost"] } : t)) })],
    ["a task in a missing milestone", (d) => ({ ...d, tasks: d.tasks.map((t, i) => (i === 0 ? { ...t, milestoneKey: "m99" } : t)) })],
    ["a deadline in the past", (d) => ({ ...d, goal: { ...d.goal, deadline: "2020-01-01" } })],
    ["a task with an impossible duration", (d) => ({ ...d, tasks: d.tasks.map((t, i) => (i === 0 ? { ...t, estimatedMin: 5000 } : t)) })],
    ["an empty title", (d) => ({ ...d, goal: { ...d.goal, title: " " } })],
  ];

  it.each(broken)("rejects a tampered draft with %s and saves nothing", async (_name, tamper) => {
    const result = await confirm(tamper(await sample()));
    expect(result.status).toBe(422);
    expect(await db.goal.count()).toBe(0);
    expect(await db.task.count()).toBe(0);
  });

  it("rolls everything back if any part of the save fails", async () => {
    const draft = await sample();
    vi.spyOn(database, "recordEvent").mockRejectedValueOnce(new Error("disk full"));
    const result = await confirm(draft);
    expect(result.status).toBe(500);
    expect(await db.goal.count()).toBe(0);
    expect(await db.milestone.count()).toBe(0);
    expect(await db.task.count()).toBe(0);
    expect(await db.taskDependency.count()).toBe(0);
  });

  it("requires a session", async () => {
    const draft = await sample();
    session.userId = null;
    expect((await confirm(draft)).status).toBe(401);
  });

  it("uses the user's own timezone to decide what today is", () => {
    const instant = new Date("2026-10-06T23:30:00.000Z");
    expect(todayIn("Europe/London", instant)).toBe("2026-10-07");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-06");
    expect(todayIn("Not/AZone", instant)).toBe("2026-10-06");
  });
});
