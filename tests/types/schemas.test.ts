import {
  BehaviourEventSchema,
  CreateGoalInputSchema,
  CreateTaskInputSchema,
  NewBehaviourEventSchema,
  SaveDailyPlanInputSchema,
  StartStepsSchema,
  TaskDependencySchema,
  UpdateTaskInputSchema,
} from "@nova/types";
import { describe, expect, it } from "vitest";

const snapshot = {
  estimatedMin: 30,
  category: "WRITING",
  energyDemand: "MEDIUM",
  sizeBucket: "20_TO_60",
  localHour: 18,
  dayOfWeek: 2,
  postponeCount: 0,
  startCount: 1,
} as const;

describe("CreateGoalInputSchema", () => {
  const valid = { title: "Build a portfolio", deadline: "2026-10-31", dailyCapacityMin: 60 };

  it("accepts a minimal goal and applies defaults", () => {
    expect(CreateGoalInputSchema.parse(valid)).toMatchObject({ ...valid, priority: "MEDIUM" });
  });

  it("trims the title", () => {
    expect(CreateGoalInputSchema.parse({ ...valid, title: "  Build a portfolio  " }).title).toBe("Build a portfolio");
  });

  it.each([
    ["an empty title", { title: "" }],
    ["a blank title", { title: "   " }],
    ["a title over 200 characters", { title: "x".repeat(201) }],
    ["a date that is not a calendar date", { deadline: "2026-02-30" }],
    ["a timestamp instead of a date", { deadline: "2026-10-31T00:00:00Z" }],
    ["a free-text date", { deadline: "by December" }],
    ["zero daily capacity", { dailyCapacityMin: 0 }],
    ["fractional minutes", { dailyCapacityMin: 45.5 }],
    ["more than 16 hours a day", { dailyCapacityMin: 961 }],
    ["an unknown priority", { priority: "URGENT" }],
  ])("rejects %s", (_name, override) => {
    expect(CreateGoalInputSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe("CreateTaskInputSchema", () => {
  const valid = { title: "Choose the three projects to showcase", estimatedMin: 20 };

  it("accepts a minimal task and applies defaults", () => {
    expect(CreateTaskInputSchema.parse(valid)).toMatchObject({
      priority: "MEDIUM",
      category: "OTHER",
      energyDemand: "MEDIUM",
      origin: "USER",
    });
  });

  it.each([
    ["an empty title", { title: "" }],
    ["a zero duration", { estimatedMin: 0 }],
    ["a negative duration", { estimatedMin: -5 }],
    ["a duration over eight hours", { estimatedMin: 481 }],
    ["a category outside the fixed list", { category: "GARDENING" }],
  ])("rejects %s", (_name, override) => {
    expect(CreateTaskInputSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe("UpdateTaskInputSchema", () => {
  it("accepts a partial update", () => {
    expect(UpdateTaskInputSchema.safeParse({ title: "New title" }).success).toBe(true);
  });

  it("rejects deferring a task without a date", () => {
    expect(UpdateTaskInputSchema.safeParse({ status: "DEFERRED" }).success).toBe(false);
  });

  it("accepts deferring a task with a date", () => {
    expect(UpdateTaskInputSchema.safeParse({ status: "DEFERRED", deferredUntil: "2026-10-09" }).success).toBe(true);
  });
});

describe("TaskDependencySchema", () => {
  it("rejects a task depending on itself", () => {
    expect(TaskDependencySchema.safeParse({ taskId: "a", dependsOnTaskId: "a" }).success).toBe(false);
  });
});

describe("SaveDailyPlanInputSchema", () => {
  const entry = { taskId: "a", order: 0, plannedMin: 60, score: 33.125, reason: "high priority" };
  const valid = { date: "2026-10-06", capacityMin: 120, usedMin: 60, plannerVersion: "v1", tasks: [entry] };

  it("accepts a valid plan", () => {
    expect(SaveDailyPlanInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a plan that uses more minutes than the day has", () => {
    expect(SaveDailyPlanInputSchema.safeParse({ ...valid, usedMin: 121 }).success).toBe(false);
  });

  it("rejects the same task twice", () => {
    expect(SaveDailyPlanInputSchema.safeParse({ ...valid, tasks: [entry, { ...entry, order: 1 }] }).success).toBe(false);
  });

  it("rejects an entry without a reason", () => {
    expect(SaveDailyPlanInputSchema.safeParse({ ...valid, tasks: [{ ...entry, reason: "" }] }).success).toBe(false);
  });
});

describe("StartStepsSchema", () => {
  it("accepts steps and defaults their state", () => {
    const steps = StartStepsSchema.parse([{ instruction: "Open the document", estimatedMin: 2, doneLabel: "I'm there" }]);
    expect(steps[0]?.state).toBe("PENDING");
  });

  it("rejects a micro-action longer than five minutes", () => {
    expect(
      StartStepsSchema.safeParse([{ instruction: "Write the chapter", estimatedMin: 30, doneLabel: "Done" }]).success,
    ).toBe(false);
  });

  it("rejects an empty session", () => {
    expect(StartStepsSchema.safeParse([]).success).toBe(false);
  });
});

describe("behaviour events", () => {
  const base = { occurredAt: "2026-10-06T18:00:00.000Z", taskId: "t1" };

  it("accepts each payload that matches its event type", () => {
    const events = [
      { ...base, type: "TASK_CREATED", payload: { ...snapshot, origin: "AI" } },
      { ...base, type: "TASK_STARTED", payload: { ...snapshot, viaNovaStart: true } },
      { ...base, type: "TASK_COMPLETED", payload: { ...snapshot, actualMin: 55, ratio: 1.57, sessions: 1 } },
      { ...base, type: "TASK_POSTPONED", payload: { ...snapshot, toDate: "2026-10-07" } },
      { ...base, type: "FRICTION_REPORTED", payload: { ...snapshot, reason: "TOO_OVERWHELMING", hasNote: false } },
      { occurredAt: base.occurredAt, type: "REPLAN_APPLIED", payload: { actions: [{ taskId: "t1", action: "SHRINK", frictionReason: "TOO_OVERWHELMING" }] } },
    ];
    for (const event of events) expect(NewBehaviourEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects a payload that belongs to a different event type", () => {
    const event = { ...base, type: "TASK_COMPLETED", payload: { ...snapshot, viaNovaStart: true } };
    expect(NewBehaviourEventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects an unknown event type", () => {
    expect(NewBehaviourEventSchema.safeParse({ ...base, type: "TASK_EXPLODED", payload: snapshot }).success).toBe(false);
  });

  it("rejects an hour outside the day", () => {
    const event = { ...base, type: "TASK_STARTED", payload: { ...snapshot, localHour: 24, viaNovaStart: false } };
    expect(NewBehaviourEventSchema.safeParse(event).success).toBe(false);
  });

  it("requires stored events to carry their identity", () => {
    const stored = { ...base, type: "TASK_STARTED", payload: { ...snapshot, viaNovaStart: false } };
    expect(BehaviourEventSchema.safeParse(stored).success).toBe(false);
    expect(BehaviourEventSchema.safeParse({ ...stored, id: "e1", userId: "u1", goalId: null }).success).toBe(true);
  });
});
