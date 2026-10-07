import {
  PlannerInputError,
  buildGraph,
  capacityForDate,
  countDownstream,
  daysLeft,
  detectCycle,
  getUnblockedTasks,
  goalPressure,
  scoreTask,
  taskUrgency,
  topologicalOrder,
} from "@nova/planner";
import type { TaskStatus } from "@nova/types";
import { describe, expect, it } from "vitest";
import { TODAY, goal, task } from "./builders";

const nodes = (...ids: (string | [string, TaskStatus])[]) =>
  ids.map((entry) => (typeof entry === "string" ? { id: entry, status: "TODO" as TaskStatus } : { id: entry[0], status: entry[1] }));
const edge = (taskId: string, dependsOnTaskId: string) => ({ taskId, dependsOnTaskId });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof PlannerInputError ? error.code : "OTHER";
  }
  return "NO_ERROR";
};

describe("dependency resolver", () => {
  it("orders a chain", () => {
    const graph = buildGraph(nodes("c", "a", "b"), [edge("b", "a"), edge("c", "b")]);
    expect(topologicalOrder(graph)).toEqual(["a", "b", "c"]);
    expect(getUnblockedTasks(graph)).toEqual(["a"]);
  });

  it("orders a diamond with ties alphabetical", () => {
    const graph = buildGraph(nodes("d", "c", "b", "a"), [edge("b", "a"), edge("c", "a"), edge("d", "b"), edge("d", "c")]);
    expect(detectCycle(graph)).toBeNull();
    expect(topologicalOrder(graph)).toEqual(["a", "b", "c", "d"]);
    expect(countDownstream(graph, "a")).toBe(3);
    expect(countDownstream(graph, "b")).toBe(1);
    expect(countDownstream(graph, "d")).toBe(0);
  });

  it("handles a graph in separate pieces", () => {
    const graph = buildGraph(nodes("a", "b", "x", "y"), [edge("b", "a"), edge("y", "x")]);
    expect(topologicalOrder(graph)).toEqual(["a", "b", "x", "y"]);
    expect(getUnblockedTasks(graph)).toEqual(["a", "x"]);
  });

  it("finds a cycle and refuses to order it", () => {
    const graph = buildGraph(nodes("a", "b", "c"), [edge("a", "c"), edge("b", "a"), edge("c", "b")]);
    expect(detectCycle(graph)).toEqual(["a", "c", "b", "a"]);
    expect(code(() => topologicalOrder(graph))).toBe("CYCLE");
  });

  it("treats a task as unblocked once its prerequisite is done", () => {
    expect(getUnblockedTasks(buildGraph(nodes(["a", "DONE"], "b"), [edge("b", "a")]))).toEqual(["b"]);
  });

  it("treats a dropped prerequisite as finished, and a deferred or in-progress one as not", () => {
    const blocked = (status: TaskStatus) => !getUnblockedTasks(buildGraph(nodes(["a", status], "b"), [edge("b", "a")])).includes("b");
    expect(blocked("DROPPED")).toBe(false);
    expect(blocked("DEFERRED")).toBe(true);
    expect(blocked("IN_PROGRESS")).toBe(true);
    expect(blocked("TODO")).toBe(true);
  });

  it("counts only unfinished tasks downstream, each once", () => {
    const graph = buildGraph(nodes("a", ["b", "DONE"], "c", "d"), [edge("b", "a"), edge("c", "a"), edge("d", "b"), edge("d", "c")]);
    expect(countDownstream(graph, "a")).toBe(2);
  });

  it("ignores a repeated edge", () => {
    const graph = buildGraph(nodes("a", "b"), [edge("b", "a"), edge("b", "a")]);
    expect(graph.prerequisites.get("b")).toEqual(["a"]);
    expect(countDownstream(graph, "a")).toBe(1);
  });

  it("rejects bad input", () => {
    expect(code(() => buildGraph(nodes("a"), [edge("a", "a")]))).toBe("SELF_DEPENDENCY");
    expect(code(() => buildGraph(nodes("a"), [edge("a", "ghost")]))).toBe("UNKNOWN_TASK");
    expect(code(() => buildGraph(nodes("a", "a"), []))).toBe("DUPLICATE_ID");
  });
});

describe("capacityForDate", () => {
  it("is the smaller of the user's budget and what the goals were offered", () => {
    expect(capacityForDate({ userDailyCapacityMin: 120, activeGoalCapacitiesMin: [120] })).toBe(120);
    expect(capacityForDate({ userDailyCapacityMin: 120, activeGoalCapacitiesMin: [60, 90] })).toBe(120);
    expect(capacityForDate({ userDailyCapacityMin: 120, activeGoalCapacitiesMin: [45] })).toBe(45);
  });

  it("is zero with no active goals or no budget", () => {
    expect(capacityForDate({ userDailyCapacityMin: 120, activeGoalCapacitiesMin: [] })).toBe(0);
    expect(capacityForDate({ userDailyCapacityMin: 0, activeGoalCapacitiesMin: [60] })).toBe(0);
  });

  it("subtracts time already used and time that is busy, never going below zero", () => {
    expect(capacityForDate({ userDailyCapacityMin: 120, activeGoalCapacitiesMin: [120], usedTodayMin: 50 })).toBe(70);
    expect(capacityForDate({ userDailyCapacityMin: 120, activeGoalCapacitiesMin: [120], usedTodayMin: 50, busyMin: 30 })).toBe(40);
    expect(capacityForDate({ userDailyCapacityMin: 120, activeGoalCapacitiesMin: [120], usedTodayMin: 200 })).toBe(0);
  });

  it("rejects negative or non-numeric values", () => {
    expect(code(() => capacityForDate({ userDailyCapacityMin: -1, activeGoalCapacitiesMin: [60] }))).toBe("INVALID_NUMBER");
    expect(code(() => capacityForDate({ userDailyCapacityMin: 60, activeGoalCapacitiesMin: [Number.NaN] }))).toBe("INVALID_NUMBER");
  });
});

describe("pressure and urgency", () => {
  it("counts both today and the deadline day, and never less than one day", () => {
    expect(daysLeft(TODAY, "2026-10-15")).toBe(10);
    expect(daysLeft(TODAY, TODAY)).toBe(1);
    expect(daysLeft(TODAY, "2026-10-01")).toBe(1);
  });

  it("is remaining work over remaining room, clamped to 0–1", () => {
    expect(goalPressure(TODAY, goal(), 540)).toBe(0.9);
    expect(goalPressure(TODAY, goal(), 300)).toBe(0.5);
    expect(goalPressure(TODAY, goal(), 0)).toBe(0);
    expect(goalPressure(TODAY, goal(), 5000)).toBe(1);
    expect(goalPressure(TODAY, goal({ deadline: "2026-09-01" }), 120)).toBe(1);
    expect(goalPressure(TODAY, goal({ dailyCapacityMin: 0 }), 120)).toBe(1);
  });

  it("rises from 0 two weeks out to 1 on the day", () => {
    expect(taskUrgency(TODAY, null)).toBe(0);
    expect(taskUrgency(TODAY, "2026-10-27")).toBe(0);
    expect(taskUrgency(TODAY, "2026-10-20")).toBe(0);
    expect(taskUrgency(TODAY, "2026-10-13")).toBe(0.5);
    expect(taskUrgency(TODAY, TODAY)).toBe(1);
    expect(taskUrgency(TODAY, "2026-10-01")).toBe(1);
  });
});

describe("scoreTask", () => {
  const context = { today: TODAY, goal: goal(), goalRemainingMin: 300, downstream: 0 };
  const score = (overrides = {}, ctx = {}) => scoreTask(task("t", 30, overrides), { ...context, ...ctx }).score;

  it("reproduces the hand-calculated scores from the specification", () => {
    expect(score({ priority: "HIGH" })).toBe(33.125);
    expect(score()).toBe(30);
    expect(score({ priority: "LOW" })).toBe(26.875);
    expect(score({ priority: "LOW" }, { downstream: 1 })).toBe(28.875);
    expect(score({ status: "IN_PROGRESS" })).toBe(35);
    expect(score({ priority: "LOW", deadline: "2026-10-05" }, { goalRemainingMin: 240 })).toBe(59.375);
    expect(score({ priority: "CRITICAL" }, { goalRemainingMin: 240 })).toBe(32.75);
  });

  it("returns each term between 0 and 1", () => {
    const { terms } = scoreTask(task("t", 30, { priority: "CRITICAL", deadline: "2026-10-01", status: "IN_PROGRESS" }), {
      ...context, goal: goal({ priority: "CRITICAL", health: "OFF_TRACK" }), downstream: 12,
    });
    expect(terms).toEqual({ pressure: 1, priority: 1, overdue: 1, unblocks: 1, risk: 1, continuity: 1 });
  });

  it("gives 100 at most and ranks each factor the right way round", () => {
    expect(score({ priority: "CRITICAL", deadline: "2026-10-01", status: "IN_PROGRESS" }, { goal: goal({ priority: "CRITICAL", health: "OFF_TRACK" }), downstream: 12 })).toBe(100);
    expect(score({ deadline: "2026-10-08" })).toBeGreaterThan(score({ deadline: "2026-10-12" }));
    expect(score({ priority: "HIGH" })).toBeGreaterThan(score({ priority: "MEDIUM" }));
    expect(score({ deadline: "2026-10-05" })).toBeGreaterThan(score({ deadline: TODAY }));
    expect(score({}, { downstream: 5 })).toBeGreaterThan(score({}, { downstream: 0 }));
    expect(score({}, { downstream: 9 })).toBe(score({}, { downstream: 5 }));
    expect(score({}, { goal: goal({ health: "AT_RISK" }) })).toBe(score() + 5);
    expect(score({}, { goal: goal({ priority: "HIGH" }) })).toBeGreaterThan(score());
  });

  it("gives identical scores for identical inputs", () => {
    expect(scoreTask(task("a", 30), context)).toEqual(scoreTask(task("b", 30), context));
  });
});
