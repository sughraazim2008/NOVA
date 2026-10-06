import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, makeWorld, resetDb } from "./helpers";

// The session is the one thing faked here: everything below it (routes, services, queries, database) is real.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", () => ({ getSessionUserId: async () => session.userId }));

import * as goalRoute from "@/app/api/goals/[id]/route";
import * as goalMilestonesRoute from "@/app/api/goals/[id]/milestones/route";
import * as goalsRoute from "@/app/api/goals/route";
import * as meRoute from "@/app/api/me/route";
import * as milestoneRoute from "@/app/api/milestones/[id]/route";
import * as milestoneTasksRoute from "@/app/api/milestones/[id]/tasks/route";
import * as dependenciesRoute from "@/app/api/tasks/[id]/dependencies/route";
import * as taskRoute from "@/app/api/tasks/[id]/route";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, options: { method?: string; body?: unknown; id?: string; query?: string } = {}) {
  const { method = "GET", body, id, query = "" } = options;
  const request = new Request(`http://test.local/api${query}`, {
    method,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
  const response = await handler(request, { params: Promise.resolve(id ? { id } : {}) });
  const payload = (await response.json()) as { data?: any; error?: { code: string; message: string; details?: any } };
  return { status: response.status, ...payload };
}

beforeEach(async () => {
  await resetDb();
  session.userId = null;
});
afterAll(() => db.$disconnect());

const newGoal = { title: "Build a portfolio", deadline: "2026-10-31", dailyCapacityMin: 60 };

describe("authentication", () => {
  it("refuses every route without a session", async () => {
    const attempts = [
      call(goalsRoute.GET as Handler),
      call(goalsRoute.POST as Handler, { method: "POST", body: newGoal }),
      call(goalRoute.GET as Handler, { id: "x" }),
      call(goalRoute.PATCH as Handler, { method: "PATCH", id: "x", body: {} }),
      call(goalRoute.DELETE as Handler, { method: "DELETE", id: "x" }),
      call(goalMilestonesRoute.POST as Handler, { method: "POST", id: "x", body: { title: "M" } }),
      call(milestoneRoute.PATCH as Handler, { method: "PATCH", id: "x", body: {} }),
      call(milestoneRoute.DELETE as Handler, { method: "DELETE", id: "x" }),
      call(milestoneTasksRoute.POST as Handler, { method: "POST", id: "x", body: { title: "T", estimatedMin: 10 } }),
      call(taskRoute.GET as Handler, { id: "x" }),
      call(taskRoute.PATCH as Handler, { method: "PATCH", id: "x", body: {} }),
      call(taskRoute.DELETE as Handler, { method: "DELETE", id: "x" }),
      call(dependenciesRoute.POST as Handler, { method: "POST", id: "x", body: { dependsOnTaskId: "y" } }),
      call(dependenciesRoute.DELETE as Handler, { method: "DELETE", id: "x", body: { dependsOnTaskId: "y" } }),
      call(meRoute.GET as Handler),
    ];
    for (const result of await Promise.all(attempts)) {
      expect(result.status).toBe(401);
      expect(result.error?.code).toBe("UNAUTHENTICATED");
    }
  });

  it("refuses a session whose account no longer exists", async () => {
    session.userId = "deleted-user";
    expect((await call(goalsRoute.GET as Handler)).status).toBe(401);
  });
});

describe("the full lifecycle", () => {
  it("creates a goal, milestones, tasks and a dependency, then reads, updates and deletes them", async () => {
    const { user } = await makeWorld();
    session.userId = user.id;

    const goal = await call(goalsRoute.POST as Handler, { method: "POST", body: newGoal });
    expect(goal.status).toBe(201);
    expect(goal.data).toMatchObject({ ...newGoal, priority: "MEDIUM", status: "ACTIVE" });

    const milestone = await call(goalMilestonesRoute.POST as Handler, { method: "POST", id: goal.data.id, body: { title: "Design" } });
    expect(milestone.status).toBe(201);
    expect(milestone.data.order).toBe(0);

    const first = await call(milestoneTasksRoute.POST as Handler, {
      method: "POST", id: milestone.data.id, body: { title: "Choose the three projects to showcase", estimatedMin: 20 },
    });
    const second = await call(milestoneTasksRoute.POST as Handler, {
      method: "POST", id: milestone.data.id, body: { title: "Write the README for the strongest project", estimatedMin: 60, category: "WRITING" },
    });
    expect(first.status).toBe(201);
    expect(second.data).toMatchObject({ goalId: goal.data.id, category: "WRITING", status: "TODO", origin: "USER" });

    const dependency = await call(dependenciesRoute.POST as Handler, {
      method: "POST", id: second.data.id, body: { dependsOnTaskId: first.data.id },
    });
    expect(dependency.status).toBe(201);

    const done = await call(taskRoute.PATCH as Handler, { method: "PATCH", id: first.data.id, body: { status: "DONE" } });
    expect(done.data.status).toBe("DONE");
    expect(done.data.completedAt).not.toBeNull();

    const tree = await call(goalRoute.GET as Handler, { id: goal.data.id });
    expect(tree.data.milestones[0].tasks.map((t: { title: string }) => t.title)).toEqual([first.data.title, second.data.title]);
    expect(tree.data.dependencies).toEqual([{ taskId: second.data.id, dependsOnTaskId: first.data.id }]);
    expect(tree.data.progress).toEqual({ doneMin: 20, totalMin: 80, taskCount: 2, doneCount: 1, percent: 25 });

    const reopened = await call(taskRoute.PATCH as Handler, { method: "PATCH", id: first.data.id, body: { status: "TODO" } });
    expect(reopened.data.completedAt).toBeNull();

    const renamed = await call(goalRoute.PATCH as Handler, { method: "PATCH", id: goal.data.id, body: { title: "Launch portfolio", priority: "HIGH" } });
    expect(renamed.data).toMatchObject({ title: "Launch portfolio", priority: "HIGH", deadline: "2026-10-31" });

    const list = await call(goalsRoute.GET as Handler, { query: "?status=ACTIVE" });
    expect(list.data.map((g: { title: string }) => g.title)).toContain("Launch portfolio");

    expect((await call(dependenciesRoute.DELETE as Handler, { method: "DELETE", id: second.data.id, body: { dependsOnTaskId: first.data.id } })).status).toBe(200);
    expect((await call(taskRoute.DELETE as Handler, { method: "DELETE", id: second.data.id })).status).toBe(200);
    expect((await call(milestoneRoute.DELETE as Handler, { method: "DELETE", id: milestone.data.id })).status).toBe(200);
    expect((await call(goalRoute.DELETE as Handler, { method: "DELETE", id: goal.data.id })).status).toBe(200);
    expect((await call(goalRoute.GET as Handler, { id: goal.data.id })).status).toBe(404);
  });

  it("reports progress as zero for a goal with no tasks", async () => {
    const { user } = await makeWorld();
    session.userId = user.id;
    const list = await call(goalsRoute.GET as Handler);
    expect(list.data[0].progress.percent).toBe(0);
  });
});

describe("validation", () => {
  it("answers 422 with the failing fields", async () => {
    const { user } = await makeWorld();
    session.userId = user.id;
    const result = await call(goalsRoute.POST as Handler, { method: "POST", body: { title: "", deadline: "soon", dailyCapacityMin: 0 } });
    expect(result.status).toBe(422);
    expect(result.error?.code).toBe("VALIDATION_FAILED");
    expect(result.error?.details.map((d: { path: string }) => d.path).sort()).toEqual(["dailyCapacityMin", "deadline", "title"]);
  });

  it("answers 422 for a body that is not JSON", async () => {
    const { user } = await makeWorld();
    session.userId = user.id;
    const result = await call(goalsRoute.POST as Handler, { method: "POST", body: "not json" });
    expect(result.status).toBe(422);
  });

  it("answers 422 for an unknown status filter", async () => {
    const { user } = await makeWorld();
    session.userId = user.id;
    expect((await call(goalsRoute.GET as Handler, { query: "?status=LOST" })).status).toBe(422);
  });

  it("answers 422 for a task that is too long or deferred without a date", async () => {
    const { user, milestone, tasks } = await makeWorld(1);
    session.userId = user.id;
    const tooLong = await call(milestoneTasksRoute.POST as Handler, { method: "POST", id: milestone.id, body: { title: "Everything", estimatedMin: 900 } });
    expect(tooLong.status).toBe(422);
    const deferred = await call(taskRoute.PATCH as Handler, { method: "PATCH", id: tasks[0]!.id, body: { status: "DEFERRED" } });
    expect(deferred.status).toBe(422);
  });

  it("answers 409 when two milestones claim the same position", async () => {
    const { user, goal } = await makeWorld();
    session.userId = user.id;
    const clash = await call(goalMilestonesRoute.POST as Handler, { method: "POST", id: goal.id, body: { title: "Clash", order: 0 } });
    expect(clash.status).toBe(409);
    expect(clash.error?.code).toBe("CONFLICT");
  });
});

describe("another user's data", () => {
  it("is reported as not found on every route, and is left untouched", async () => {
    const mine = await makeWorld(2);
    const intruder = await makeWorld(1);
    session.userId = intruder.user.id;
    const [taskA, taskB] = mine.tasks.map((t) => t.id) as [string, string];

    const attempts = [
      call(goalRoute.GET as Handler, { id: mine.goal.id }),
      call(goalRoute.PATCH as Handler, { method: "PATCH", id: mine.goal.id, body: { title: "Hijacked" } }),
      call(goalRoute.DELETE as Handler, { method: "DELETE", id: mine.goal.id }),
      call(goalMilestonesRoute.POST as Handler, { method: "POST", id: mine.goal.id, body: { title: "Intruder" } }),
      call(milestoneRoute.PATCH as Handler, { method: "PATCH", id: mine.milestone.id, body: { title: "Hijacked" } }),
      call(milestoneRoute.DELETE as Handler, { method: "DELETE", id: mine.milestone.id }),
      call(milestoneTasksRoute.POST as Handler, { method: "POST", id: mine.milestone.id, body: { title: "Intruder", estimatedMin: 10 } }),
      call(taskRoute.GET as Handler, { id: taskA }),
      call(taskRoute.PATCH as Handler, { method: "PATCH", id: taskA, body: { title: "Hijacked" } }),
      call(taskRoute.DELETE as Handler, { method: "DELETE", id: taskA }),
      call(dependenciesRoute.POST as Handler, { method: "POST", id: taskB, body: { dependsOnTaskId: taskA } }),
      // one of mine, one of theirs
      call(dependenciesRoute.POST as Handler, { method: "POST", id: intruder.tasks[0]!.id, body: { dependsOnTaskId: taskA } }),
    ];
    for (const result of await Promise.all(attempts)) {
      expect(result.status).toBe(404);
      expect(result.error?.code).toBe("NOT_FOUND");
    }

    const list = await call(goalsRoute.GET as Handler);
    expect(list.data.map((g: { id: string }) => g.id)).toEqual([intruder.goal.id]);

    session.userId = mine.user.id;
    const tree = await call(goalRoute.GET as Handler, { id: mine.goal.id });
    expect(tree.data.goal.title).toBe("Goal");
    expect(tree.data.milestones[0].tasks).toHaveLength(2);
    expect(tree.data.dependencies).toEqual([]);
  });
});

describe("dependencies", () => {
  it("rejects a self-reference with 422 and a cycle with 409", async () => {
    const { user, tasks } = await makeWorld(3);
    session.userId = user.id;
    const [a, b, c] = tasks.map((t) => t.id) as [string, string, string];

    expect((await call(dependenciesRoute.POST as Handler, { method: "POST", id: a, body: { dependsOnTaskId: a } })).status).toBe(422);

    await call(dependenciesRoute.POST as Handler, { method: "POST", id: b, body: { dependsOnTaskId: a } });
    await call(dependenciesRoute.POST as Handler, { method: "POST", id: c, body: { dependsOnTaskId: b } });
    const cycle = await call(dependenciesRoute.POST as Handler, { method: "POST", id: a, body: { dependsOnTaskId: c } });
    expect(cycle.status).toBe(409);
    expect(cycle.error?.code).toBe("CONFLICT");
  });

  it("answers 404 when removing a dependency that does not exist", async () => {
    const { user, tasks } = await makeWorld(2);
    session.userId = user.id;
    const result = await call(dependenciesRoute.DELETE as Handler, { method: "DELETE", id: tasks[0]!.id, body: { dependsOnTaskId: tasks[1]!.id } });
    expect(result.status).toBe(404);
  });
});

describe("profile", () => {
  it("reads and updates the signed-in user", async () => {
    const { user } = await makeWorld();
    session.userId = user.id;
    expect((await call(meRoute.GET as Handler)).data.email).toBe(user.email);
    const updated = await call(meRoute.PATCH as Handler, { method: "PATCH", body: { defaultDailyCapacityMin: 90, timezone: "Europe/London", gameMode: "QUIET" } });
    expect(updated.data).toMatchObject({ defaultDailyCapacityMin: 90, timezone: "Europe/London", gameMode: "QUIET" });
    expect((await call(meRoute.PATCH as Handler, { method: "PATCH", body: { defaultDailyCapacityMin: -5 } })).status).toBe(422);
  });
});
