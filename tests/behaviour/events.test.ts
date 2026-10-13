import {
  FRICTION_OPTIONS,
  closeEntry,
  frictionLabel,
  frictionReported,
  shouldAskFriction,
  sizeBucket,
  snapshot,
  summariseEvents,
  taskAbandoned,
  taskCompleted,
  taskCreated,
  taskPostponed,
  taskSkipped,
  taskStarted,
} from "@nova/behaviour";
import { BehaviourEventSchema, FrictionReasonSchema, NewBehaviourEventSchema, type BehaviourEvent, type NewBehaviourEvent, type Task } from "@nova/types";
import { describe, expect, it } from "vitest";

const at = { now: "2026-10-13T18:30:00.000Z", localHour: 19, dayOfWeek: 2 };

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1", milestoneId: "m1", goalId: "g1", parentTaskId: null, title: "Write the introduction", description: null,
  estimatedMin: 40, actualMin: null, priority: "MEDIUM", category: "WRITING", energyDemand: "HIGH", deadline: null,
  status: "TODO", deferredUntil: null, origin: "AI", startCount: 1, postponeCount: 0, completedAt: null,
  createdAt: "2026-10-01T09:00:00.000Z", ...overrides,
});

const valid = (events: NewBehaviourEvent | NewBehaviourEvent[]) => [events].flat().every((event) => NewBehaviourEventSchema.safeParse(event).success);

describe("snapshot", () => {
  it("captures the task and the user's local clock at that moment", () => {
    expect(snapshot(task(), at)).toEqual({
      estimatedMin: 40, category: "WRITING", energyDemand: "HIGH", sizeBucket: "20_TO_60", localHour: 19, dayOfWeek: 2, postponeCount: 0, startCount: 1,
    });
  });

  it("sorts tasks into three sizes with the edges where the specification puts them", () => {
    expect([5, 19, 20, 60, 61, 240].map(sizeBucket)).toEqual(["UNDER_20", "UNDER_20", "20_TO_60", "20_TO_60", "OVER_60", "OVER_60"]);
  });
});

describe("event builders", () => {
  it("produce events the schema accepts, tied to the task and its goal", () => {
    const events = [
      taskCreated(task(), at),
      taskStarted(task(), at, true),
      taskSkipped(task(), at, 40),
      taskAbandoned(task(), at, "LEFT_UNFINISHED"),
      frictionReported(task(), at, "TOO_OVERWHELMING", false),
      ...taskCompleted(task({ actualMin: 55 }), at, 1),
      ...taskPostponed(task({ postponeCount: 1 }), at, "2026-10-14"),
    ];
    expect(valid(events)).toBe(true);
    expect(events.every((e) => e.taskId === "t1" && e.goalId === "g1" && e.occurredAt === at.now)).toBe(true);
    expect(events.map((e) => e.type)).toEqual([
      "TASK_CREATED", "TASK_STARTED", "TASK_SKIPPED", "TASK_ABANDONED", "FRICTION_REPORTED", "TASK_COMPLETED", "ESTIMATE_OVERRUN", "TASK_POSTPONED",
    ]);
  });

  it("records how a task was started and where it came from", () => {
    expect(taskStarted(task(), at, true).payload).toMatchObject({ viaNovaStart: true });
    expect(taskCreated(task({ origin: "USER" }), at).payload).toMatchObject({ origin: "USER" });
  });
});

describe("taskCompleted", () => {
  const types = (actualMin: number | null, estimatedMin = 40) => taskCompleted(task({ actualMin, estimatedMin }), at, 2).map((e) => e.type);

  it("reproduces the specification's example: estimated 35, actual 55", () => {
    const [completed, overrun] = taskCompleted(task({ estimatedMin: 35, actualMin: 55 }), at, 1);
    expect(completed?.payload).toMatchObject({ actualMin: 55, ratio: 1.57, sessions: 1 });
    expect(overrun).toMatchObject({ type: "ESTIMATE_OVERRUN", payload: { actualMin: 55, ratio: 1.57 } });
  });

  it("flags an overrun from 25% over and an underrun from 25% under, and nothing in between", () => {
    expect(types(50)).toEqual(["TASK_COMPLETED", "ESTIMATE_OVERRUN"]); // 1.25
    expect(types(49)).toEqual(["TASK_COMPLETED"]); // 1.23
    expect(types(40)).toEqual(["TASK_COMPLETED"]);
    expect(types(31)).toEqual(["TASK_COMPLETED"]); // 0.78
    expect(types(30)).toEqual(["TASK_COMPLETED", "ESTIMATE_UNDERRUN"]); // 0.75
  });

  it("infers nothing when the task was ticked off without timing it", () => {
    const events = taskCompleted(task({ actualMin: null }), at, 0);
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ actualMin: null, ratio: null, sessions: 0 });
    expect(valid(events)).toBe(true);
    expect(types(0)).toEqual(["TASK_COMPLETED"]);
  });
});

describe("taskPostponed", () => {
  const types = (postponeCount: number) => taskPostponed(task({ postponeCount }), at, "2026-10-14").map((e) => e.type);

  it("adds an abandonment on the third postponement, and only on that one", () => {
    expect(types(1)).toEqual(["TASK_POSTPONED"]);
    expect(types(2)).toEqual(["TASK_POSTPONED"]);
    expect(types(3)).toEqual(["TASK_POSTPONED", "TASK_ABANDONED"]);
    expect(types(4)).toEqual(["TASK_POSTPONED"]);
    expect(taskPostponed(task({ postponeCount: 3 }), at, "2026-10-14")[1]?.payload).toMatchObject({ cause: "REPEATED_POSTPONE" });
  });
});

describe("friction", () => {
  it("offers exactly the seven reasons in the specification, each with a label", () => {
    expect(FRICTION_OPTIONS.map((o) => o.reason).sort()).toEqual([...FrictionReasonSchema.options].sort());
    expect(FRICTION_OPTIONS.every((o) => o.label.length > 3)).toBe(true);
    expect(frictionLabel("TOO_OVERWHELMING")).toBe("It feels too big");
  });

  it("asks after a miss or a skip, and after the second postponement", () => {
    const ask = (lastOutcome: Parameters<typeof shouldAskFriction>[0]["lastOutcome"], postponeCount = 0, answeredSince = false) =>
      shouldAskFriction({ lastOutcome, postponeCount, answeredSince });
    expect(ask("MISSED")).toBe(true);
    expect(ask("SKIPPED")).toBe(true);
    expect(ask("POSTPONED", 1)).toBe(false);
    expect(ask("POSTPONED", 2)).toBe(true);
    expect(ask("COMPLETED")).toBe(false);
    expect(ask("PARTIAL")).toBe(false);
    expect(ask("PENDING")).toBe(false);
    expect(ask(null)).toBe(false);
  });

  it("never asks twice about the same occasion", () => {
    expect(shouldAskFriction({ lastOutcome: "MISSED", postponeCount: 5, answeredSince: true })).toBe(false);
  });
});

describe("closing a day", () => {
  it("tells apart never touched, started and left, and finished elsewhere", () => {
    expect(closeEntry({ outcome: "PENDING", taskStatus: "TODO" })).toEqual({ outcome: "MISSED", abandoned: false });
    expect(closeEntry({ outcome: "PENDING", taskStatus: "DEFERRED" })).toEqual({ outcome: "MISSED", abandoned: false });
    expect(closeEntry({ outcome: "PENDING", taskStatus: "IN_PROGRESS" })).toEqual({ outcome: "MISSED", abandoned: true });
    expect(closeEntry({ outcome: "PENDING", taskStatus: "DONE" })).toEqual({ outcome: "COMPLETED", abandoned: false });
  });

  it("leaves alone anything the user already acted on", () => {
    for (const outcome of ["COMPLETED", "PARTIAL", "SKIPPED", "POSTPONED", "MISSED"] as const) {
      expect(closeEntry({ outcome, taskStatus: "IN_PROGRESS" })).toEqual({ outcome, abandoned: false });
    }
  });
});

describe("summariseEvents", () => {
  let n = 0;
  const stored = (event: NewBehaviourEvent): BehaviourEvent =>
    BehaviourEventSchema.parse({ ...event, id: `e${(n += 1)}`, userId: "u1", taskId: event.taskId ?? null, goalId: event.goalId ?? null });
  const done = (category: Task["category"], estimatedMin: number, actualMin: number | null) =>
    taskCompleted(task({ category, estimatedMin, actualMin }), at, 1).map(stored);

  const events = [
    stored(taskStarted(task(), at, true)),
    stored(taskStarted(task(), at, true)),
    stored(taskStarted(task(), at, false)),
    ...done("STUDY", 35, 55), // 1.57
    ...done("STUDY", 40, 50), // 1.25
    ...done("READING", 20, 22), // 1.1
    ...done("READING", 30, null), // untimed
    stored(frictionReported(task(), at, "TOO_OVERWHELMING", false)),
    stored(frictionReported(task(), at, "TOO_OVERWHELMING", true)),
    stored(frictionReported(task(), at, "LOW_ENERGY", false)),
    stored(taskSkipped(task(), at, 40)),
  ];

  it("counts what happened", () => {
    const summary = summariseEvents(events);
    expect(summary).toMatchObject({ started: 3, startedViaNovaStart: 2, completed: 4 });
    expect(summary.byType).toMatchObject({ TASK_STARTED: 3, TASK_COMPLETED: 4, ESTIMATE_OVERRUN: 2, FRICTION_REPORTED: 3, TASK_SKIPPED: 1 });
    expect(summary.friction).toEqual([{ reason: "TOO_OVERWHELMING", count: 2 }, { reason: "LOW_ENERGY", count: 1 }]);
  });

  it("compares estimate with actual per kind of work, ignoring untimed completions", () => {
    const summary = summariseEvents(events);
    expect(summary.byCategory).toEqual([
      { category: "READING", completed: 2, timed: 1, meanRatio: 1.1, estimatedMin: 20, actualMin: 22 },
      { category: "STUDY", completed: 2, timed: 2, meanRatio: 1.41, estimatedMin: 75, actualMin: 105 },
    ]);
    expect(summary.overallRatio).toBe(1.31);
  });

  it("is the same whatever order the events arrive in, and empty for no events", () => {
    expect(summariseEvents([...events].reverse())).toEqual(summariseEvents(events));
    expect(summariseEvents([])).toEqual({ byType: {}, started: 0, completed: 0, startedViaNovaStart: 0, byCategory: [], friction: [], overallRatio: null });
  });
});
