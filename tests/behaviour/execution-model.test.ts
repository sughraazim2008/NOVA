import { MODEL, buildExecutionModel, frictionReported, taskCompleted, taskStarted } from "@nova/behaviour";
import { BehaviourEventSchema, type BehaviourEvent, type NewBehaviourEvent, type Task } from "@nova/types";
import { describe, expect, it } from "vitest";

const at = { now: "2026-10-14T18:00:00.000Z", localHour: 19, dayOfWeek: 3 };
let n = 0;
const stored = (event: NewBehaviourEvent): BehaviourEvent =>
  BehaviourEventSchema.parse({ ...event, id: `e${(n += 1)}`, userId: "u1", taskId: event.taskId ?? null, goalId: event.goalId ?? null });
const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id, milestoneId: "m1", goalId: "g1", parentTaskId: null, title: "T", description: null, estimatedMin: 30, actualMin: null, priority: "MEDIUM",
  category: "STUDY", energyDemand: "MEDIUM", deadline: null, status: "TODO", deferredUntil: null, origin: "AI", startCount: 1, postponeCount: 0,
  completedAt: null, createdAt: at.now, ...overrides,
});
const done = (id: string, category: Task["category"], estimatedMin: number, actualMin: number | null) =>
  taskCompleted(task(id, { category, estimatedMin, actualMin }), at, 1).map(stored);
const start = (id: string, estimatedMin: number) => stored(taskStarted(task(id, { estimatedMin }), at, true));

describe("duration multipliers", () => {
  it("are not used until a category has three timed completions", () => {
    const events = [...done("a", "STUDY", 35, 55), ...done("b", "STUDY", 40, 52)];
    expect(buildExecutionModel(events).multipliers).toEqual([]);
  });

  it("lean towards 1 when there is little data, so a few odd results cannot swing them far", () => {
    // Ratios 1.57, 1.3, 1.5 plus three imaginary completions at exactly 1: (4.37 + 3) / 6.
    const events = [...done("a", "STUDY", 35, 55), ...done("b", "STUDY", 40, 52), ...done("c", "STUDY", 30, 45)];
    expect(buildExecutionModel(events).multipliers).toEqual([{ category: "STUDY", multiplier: 1.23, sampleSize: 3 }]);
  });

  it("move further from 1 as evidence grows, and are clamped to 0.7–2", () => {
    const many = Array.from({ length: 30 }, (_, i) => done(`s${i}`, "STUDY", 20, 60)).flat(); // ratio 3 each
    expect(buildExecutionModel(many).multipliers[0]).toMatchObject({ category: "STUDY", multiplier: MODEL.MULTIPLIER_MAX, sampleSize: 30 });
    const fast = Array.from({ length: 30 }, (_, i) => done(`f${i}`, "READING", 60, 12)).flat(); // ratio 0.2
    expect(buildExecutionModel(fast).multipliers[0]).toMatchObject({ multiplier: MODEL.MULTIPLIER_MIN });
  });

  it("ignore completions with no recorded time, and keep categories apart", () => {
    const events = [
      ...done("a", "STUDY", 30, 45), ...done("b", "STUDY", 30, 45), ...done("c", "STUDY", 30, 45),
      ...done("d", "READING", 30, null), ...done("e", "READING", 30, null), ...done("f", "READING", 30, null),
    ];
    const model = buildExecutionModel(events);
    expect(model.multipliers.map((m) => m.category)).toEqual(["STUDY"]);
    expect(model.multipliers[0]?.multiplier).toBe(1.25);
  });
});

describe("preferred task size", () => {
  it("is set when long tasks are started but rarely finished", () => {
    const events = [start("a", 90), start("b", 90), start("c", 120), ...done("a", "WRITING", 90, 100)];
    const model = buildExecutionModel(events);
    expect(model.sizes).toEqual([{ bucket: "OVER_60", started: 3, completed: 1, rate: 0.33 }]);
    expect(model.preferredMaxMin).toBe(60);
    expect(model.hints).toContain("keep every task under 60 minutes; longer tasks rarely get finished");
  });

  it("drops to 20 minutes when even middle-sized tasks are rarely finished, and counts a task once however often it is started", () => {
    const events = [start("a", 30), start("a", 30), start("b", 40), start("c", 45), ...done("c", "WRITING", 45, 50)];
    expect(buildExecutionModel(events)).toMatchObject({ preferredMaxMin: 20, sizes: [{ bucket: "20_TO_60", started: 3, completed: 1 }] });
  });

  it("is not set without enough starts, or when tasks of that size do get finished", () => {
    expect(buildExecutionModel([start("a", 90), start("b", 90)]).preferredMaxMin).toBeNull();
    const finished = [start("a", 90), start("b", 90), start("c", 90), ...done("a", "WRITING", 90, 90), ...done("b", "WRITING", 90, 90)];
    expect(buildExecutionModel(finished).preferredMaxMin).toBeNull();
  });
});

describe("hints for the task writer", () => {
  it("mention slow kinds of work and repeated friction, in plain words", () => {
    const events = [
      ...done("a", "STUDY", 20, 40), ...done("b", "STUDY", 20, 40), ...done("c", "STUDY", 20, 40), ...done("d", "STUDY", 20, 40),
      stored(frictionReported(task("x"), at, "TOO_OVERWHELMING", true)),
      stored(frictionReported(task("y"), at, "TOO_OVERWHELMING", false)),
      stored(frictionReported(task("z"), at, "DONT_KNOW_HOW_TO_START", false)),
    ];
    const { hints } = buildExecutionModel(events);
    expect(hints).toEqual([
      "study tasks take this person about 1.57× as long as estimated, so estimate them generously",
      "make tasks small and concrete; large tasks feel overwhelming to this person",
    ]);
  });

  it("are empty for someone NOVA knows nothing about", () => {
    expect(buildExecutionModel([])).toEqual({ multipliers: [], sizes: [], preferredMaxMin: null, hints: [] });
  });
});
