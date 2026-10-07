import { PlannerInputError, generateDailyPlan, type PlannerInput, type PlannerOutput } from "@nova/planner";
import { describe, expect, it } from "vitest";
import { TODAY, goal, input, padTo, seeded, task } from "./builders";

const planned = (output: PlannerOutput) => output.tasks.map((t) => t.taskId);
const scores = (output: PlannerOutput) => Object.fromEntries(output.tasks.map((t) => [t.taskId, t.score]));
/** Exclusions, leaving out the padding tasks the builders add. */
const excluded = (output: PlannerOutput) =>
  Object.fromEntries(output.excluded.filter((e) => !e.taskId.startsWith("zz-pad")).map((e) => [e.taskId, e.why]));

// Each test below is a worked example from docs/planning-engine.md section 7, with the same number.

describe("worked examples", () => {
  it("Example 1 — reference case from the spec: 120 minutes, A=60 B=40 C=30 → A and B", () => {
    const out = generateDailyPlan(input(120, [task("A", 60, { priority: "HIGH" }), task("B", 40), task("C", 30, { priority: "LOW" })]));
    expect(planned(out)).toEqual(["A", "B"]);
    expect(scores(out)).toEqual({ A: 33.125, B: 30 });
    expect(out.usedMin).toBe(100);
    expect(excluded(out)).toEqual({ C: "NO_CAPACITY" });
  });

  it("Example 2 — skip what does not fit, keep going", () => {
    const out = generateDailyPlan(input(60, [task("X", 50, { priority: "HIGH" }), task("Y", 30), task("Z", 10, { priority: "LOW" })]));
    expect(planned(out)).toEqual(["X", "Z"]);
    expect(out.usedMin).toBe(60);
    expect(excluded(out)).toEqual({ Y: "NO_CAPACITY" });
  });

  it("Example 3 — a blocked task is never scheduled, whatever its priority", () => {
    const tasks = [task("T1", 60, { priority: "CRITICAL" }), task("T2", 30), task("T0", 45, { priority: "LOW" })];
    const out = generateDailyPlan(input(120, tasks, { dependencies: [{ taskId: "T1", dependsOnTaskId: "T0" }] }));
    expect(planned(out)).toEqual(["T2", "T0"]);
    expect(scores(out)).toEqual({ T2: 30, T0: 28.875 });
    expect(out.usedMin).toBe(75);
    expect(excluded(out)).toEqual({ T1: "BLOCKED" });
    expect(out.tasks[1]?.terms.unblocks).toBe(0.2);
  });

  it("Example 3, the next day — the task is eligible once its prerequisite is done", () => {
    const tasks = [task("T1", 60, { priority: "CRITICAL" }), task("T0", 45, { priority: "LOW", status: "DONE" })];
    const out = generateDailyPlan(input(120, tasks, { dependencies: [{ taskId: "T1", dependsOnTaskId: "T0" }] }));
    expect(planned(out)).toEqual(["T1"]);
  });

  it("Example 4 — ties are broken by deadline, then creation time, then id", () => {
    const same = [
      task("t-b", 30, { createdAt: "2026-10-01T09:00:00.000Z" }),
      task("t-a", 30, { createdAt: "2026-10-01T09:00:00.000Z" }),
      task("t-c", 30, { createdAt: "2026-09-30T09:00:00.000Z" }),
    ];
    expect(planned(generateDailyPlan(input(30, same)))).toEqual(["t-c"]);
    expect(planned(generateDailyPlan(input(30, same.slice(0, 2))))).toEqual(["t-a"]);

    // Same score, but one belongs to a milestone that is due sooner.
    const milestones = [task("late", 30, { milestoneTargetDate: "2026-10-14" }), task("soon", 30, { milestoneTargetDate: "2026-10-09" })];
    expect(planned(generateDailyPlan(input(30, milestones)))).toEqual(["soon"]);
  });

  it("Example 5 — the goal running out of time beats the more important goal", () => {
    const goals = [goal({ id: "G1", title: "First" }), goal({ id: "G2", title: "Second", priority: "HIGH", deadline: "2026-10-25" })];
    let tasks = [task("a", 60, { goalId: "G1" }), task("b", 60, { goalId: "G2", priority: "HIGH" })];
    tasks = padTo(360, padTo(540, tasks, "G1"), "G2");
    const out = generateDailyPlan({ today: TODAY, dayCapacityMin: 60, goals, tasks, dependencies: [] });
    expect(out.tasks[0]).toMatchObject({ taskId: "a", score: 44, terms: { pressure: 0.9 } });
    expect(excluded(out)).toEqual({ b: "NO_CAPACITY" });

    // With room for both, the order still follows the scores: 44 then 29.25.
    const both = generateDailyPlan({ today: TODAY, dayCapacityMin: 120, goals, tasks, dependencies: [] });
    expect(scores(both)).toEqual({ a: 44, b: 29.25 });
    expect(planned(both)).toEqual(["a", "b"]);
  });

  it("Example 6 — overdue beats important", () => {
    const tasks = padTo(240, [task("P", 30, { priority: "LOW", deadline: "2026-10-05" }), task("Q", 30, { priority: "CRITICAL" })]);
    const out = generateDailyPlan({ ...input(30, []), tasks });
    expect(scores(out)).toEqual({ P: 59.375 });
    expect(excluded(out)).toEqual({ Q: "NO_CAPACITY" });
    // Its pressure comes from its own deadline, which the overdue phrase already states; low priority explains nothing.
    expect(out.tasks[0]?.reason).toBe("Its deadline has passed.");
  });

  it("Example 7 — at most five tasks, even with time to spare", () => {
    const eight = Array.from({ length: 8 }, (_, i) => task(`t${i + 1}`, 20, { deadline: `2026-10-${String(7 + i).padStart(2, "0")}` }));
    const out = generateDailyPlan(input(300, eight));
    expect(planned(out)).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    expect(out.usedMin).toBe(100);
    expect(excluded(out)).toEqual({ t6: "MAX_TASKS", t7: "MAX_TASKS", t8: "MAX_TASKS" });
    expect(planned(generateDailyPlan(input(300, eight, { maxTasks: 2 })))).toEqual(["t1", "t2"]);
  });

  it("Example 8 — a task longer than the day is flagged for splitting, and the rest of the day is still used", () => {
    const out = generateDailyPlan(input(45, [task("L", 90, { priority: "HIGH" }), task("S", 30)]));
    expect(planned(out)).toEqual(["S"]);
    expect(out.usedMin).toBe(30);
    expect(out.excluded.find((e) => e.taskId === "L")).toEqual({ taskId: "L", why: "LONGER_THAN_CAPACITY", needsSplit: true });
  });

  it("Example 9 — personal multipliers change the plan", () => {
    const tasks = [task("M", 35, { priority: "HIGH", category: "STUDY" }), task("R", 20, { category: "READING" })];
    const without = generateDailyPlan(input(60, tasks));
    expect(planned(without)).toEqual(["M", "R"]);
    expect(without.usedMin).toBe(55);

    const multipliers = [{ category: "STUDY", multiplier: 1.35 }, { category: "READING", multiplier: 1.1 }];
    const withThem = generateDailyPlan(input(60, tasks, { multipliers }));
    expect(planned(withThem)).toEqual(["M"]);
    expect(withThem.tasks[0]?.plannedMin).toBe(48);
    expect(excluded(withThem)).toEqual({ R: "NO_CAPACITY" });
    expect(withThem.tasks[0]?.reason).toContain("Planned 48 min: your study tasks usually take 1.35× the estimate.");
    expect(without.tasks[0]?.reason).not.toContain("Planned");
  });

  it("Example 10 — a task already started comes first", () => {
    const out = generateDailyPlan(input(30, [task("K", 30), task("J", 30, { status: "IN_PROGRESS" })]));
    expect(scores(out)).toEqual({ J: 35 });
    expect(out.tasks[0]?.reason).toContain("you already started it");
  });

  it("Example 11 — nothing to plan", () => {
    const zero = generateDailyPlan(input(0, [task("a", 30), task("b", 30)]));
    expect(zero.tasks).toEqual([]);
    expect(zero.usedMin).toBe(0);
    expect(zero.excluded.filter((e) => !e.taskId.startsWith("zz"))).toEqual([
      { taskId: "a", why: "LONGER_THAN_CAPACITY", needsSplit: false },
      { taskId: "b", why: "LONGER_THAN_CAPACITY", needsSplit: false },
    ]);

    const stuck = generateDailyPlan(
      input(120, [task("a", 30, { status: "DEFERRED", deferredUntil: "2026-10-09" }), task("b", 30), task("c", 30)], {
        dependencies: [{ taskId: "b", dependsOnTaskId: "a" }, { taskId: "c", dependsOnTaskId: "b" }],
      }),
    );
    expect(stuck.tasks).toEqual([]);
    expect(excluded(stuck)).toEqual({ a: "DEFERRED", b: "BLOCKED", c: "BLOCKED" });

    const empty = generateDailyPlan({ today: TODAY, dayCapacityMin: 120, goals: [], tasks: [], dependencies: [] });
    expect(empty).toMatchObject({ tasks: [], excluded: [], usedMin: 0, date: TODAY, plannerVersion: "v1" });
  });

  it("Example 12 — a deferred task returns on its date", () => {
    const out = generateDailyPlan(
      input(60, [task("D1", 30, { status: "DEFERRED", deferredUntil: "2026-10-09" }), task("D2", 30, { status: "DEFERRED", deferredUntil: TODAY })]),
    );
    expect(planned(out)).toEqual(["D2"]);
    expect(excluded(out)).toEqual({ D1: "DEFERRED" });
  });

  it("Example 13 — shuffling the input never changes the output", () => {
    const goals = [goal({ id: "G1" }), goal({ id: "G2", priority: "HIGH", deadline: "2026-10-25" })];
    const tasks = padTo(360, padTo(540, [
      task("a", 60, { goalId: "G1" }), task("b", 30, { goalId: "G2", priority: "HIGH" }), task("c", 20, { goalId: "G1" }),
      task("d", 20, { goalId: "G2" }), task("e", 45, { goalId: "G1", priority: "LOW" }),
    ], "G1"), "G2");
    const dependencies = [{ taskId: "c", dependsOnTaskId: "a" }, { taskId: "d", dependsOnTaskId: "b" }, { taskId: "e", dependsOnTaskId: "c" }];
    const base: PlannerInput = { today: TODAY, dayCapacityMin: 120, goals, tasks, dependencies };
    const expected = generateDailyPlan(base);
    const random = seeded(13);
    for (let i = 0; i < 50; i += 1) {
      const shuffled = { ...base, goals: random.shuffle(goals), tasks: random.shuffle(tasks), dependencies: random.shuffle(dependencies) };
      expect(generateDailyPlan(shuffled)).toEqual(expected);
    }
  });
});

describe("other rules", () => {
  it("ignores finished tasks entirely", () => {
    const out = generateDailyPlan(input(120, [task("done", 30, { status: "DONE" }), task("dropped", 30, { status: "DROPPED" }), task("open", 30)]));
    expect(planned(out)).toEqual(["open"]);
    expect(excluded(out)).toEqual({});
  });

  it("does not plan tasks from a goal that is not active", () => {
    const goals = [goal(), goal({ id: "g2", status: "ARCHIVED" })];
    const out = generateDailyPlan({ ...input(120, [task("a", 30)]), goals, tasks: [...padTo(300, [task("a", 30)]), task("b", 30, { goalId: "g2" })] });
    expect(planned(out)).toEqual(["a"]);
    expect(excluded(out)).toEqual({ b: "GOAL_INACTIVE" });
  });

  it("does not plan again today a task the user already acted on today", () => {
    const out = generateDailyPlan(input(120, [task("a", 30, { priority: "HIGH" }), task("b", 30)], { handledTodayTaskIds: ["a"] }));
    expect(planned(out)).toEqual(["b"]);
    expect(excluded(out)).toEqual({ a: "HANDLED_TODAY" });
  });

  it("lets a dropped prerequisite stop blocking", () => {
    const out = generateDailyPlan(input(60, [task("a", 30, { status: "DROPPED" }), task("b", 30)], { dependencies: [{ taskId: "b", dependsOnTaskId: "a" }] }));
    expect(planned(out)).toEqual(["b"]);
  });

  it("raises a goal's tasks when the goal is at risk", () => {
    const goals = [goal({ id: "G1" }), goal({ id: "G2", health: "OFF_TRACK" })];
    const tasks = padTo(300, padTo(300, [task("calm", 30, { goalId: "G1" }), task("risky", 30, { goalId: "G2" })], "G1"), "G2");
    const out = generateDailyPlan({ today: TODAY, dayCapacityMin: 30, goals, tasks, dependencies: [] });
    expect(planned(out)).toEqual(["risky"]);
    expect(out.tasks[0]?.reason).toContain("is off track");
  });

  it("numbers the plan from zero in order", () => {
    const out = generateDailyPlan(input(120, [task("a", 30), task("b", 30, { priority: "HIGH" }), task("c", 30, { priority: "LOW" })]));
    expect(out.tasks.map((t) => [t.taskId, t.order])).toEqual([["b", 0], ["a", 1], ["c", 2]]);
  });
});

describe("reasons", () => {
  const reasonFor = (overrides = {}, extra: Partial<PlannerInput> = {}) =>
    generateDailyPlan(input(60, [task("t", 30, overrides)], extra)).tasks[0]?.reason;

  it("names deadline pressure in minutes a day", () => {
    expect(reasonFor()).toBe('"Portfolio" needs about 30 min a day to stay on schedule.');
  });

  it("names high and critical priority, and stays quiet about ordinary priority", () => {
    // Largest contribution first: pressure gives 17.5 points here, high priority 15.625, critical priority 18.75.
    expect(reasonFor({ priority: "HIGH" })).toBe('"Portfolio" needs about 30 min a day to stay on schedule, and it is high priority.');
    expect(reasonFor({ priority: "CRITICAL" })).toBe('It is critical priority, and "Portfolio" needs about 30 min a day to stay on schedule.');
    expect(reasonFor({ priority: "CRITICAL" })).toContain("It is critical priority");
    expect(reasonFor({ priority: "LOW" })).not.toContain("priority");
  });

  it("names a task deadline when that is what makes it pressing", () => {
    expect(reasonFor({ deadline: TODAY })).toContain("It is due today");
    expect(reasonFor({ deadline: "2026-10-07" })).toContain("It is due tomorrow");
    expect(reasonFor({ deadline: "2026-10-09" })).toContain("It is due in 3 days");
  });

  it("names what a task unblocks", () => {
    const out = generateDailyPlan(
      input(30, [task("first", 30), task("second", 30), task("third", 30)], {
        dependencies: [{ taskId: "second", dependsOnTaskId: "first" }, { taskId: "third", dependsOnTaskId: "second" }],
      }),
    );
    expect(out.tasks[0]?.reason).toContain("it unblocks 2 other tasks");
  });

  it("always gives a reason, even when no term stands out", () => {
    // A one-minute task in a goal with years of room: almost no pressure, ordinary priority.
    const out = generateDailyPlan({ today: TODAY, dayCapacityMin: 60, goals: [goal({ deadline: "2030-01-01", dailyCapacityMin: 960 })], tasks: [task("t", 1, { priority: "LOW" })], dependencies: [] });
    expect(out.tasks[0]?.reason).toMatch(/\.$/);
    expect(out.tasks[0]?.reason.length).toBeGreaterThan(10);
  });
});

describe("invalid input", () => {
  const code = (bad: PlannerInput) => {
    try {
      generateDailyPlan(bad);
    } catch (error) {
      return error instanceof PlannerInputError ? error.code : "OTHER";
    }
    return "NO_ERROR";
  };
  const base = input(60, [task("a", 30), task("b", 30)]);

  it("refuses a cycle, an unknown task, an unknown goal and impossible numbers", () => {
    expect(code({ ...base, dependencies: [{ taskId: "a", dependsOnTaskId: "b" }, { taskId: "b", dependsOnTaskId: "a" }] })).toBe("CYCLE");
    expect(code({ ...base, dependencies: [{ taskId: "a", dependsOnTaskId: "ghost" }] })).toBe("UNKNOWN_TASK");
    expect(code({ ...base, dependencies: [{ taskId: "a", dependsOnTaskId: "a" }] })).toBe("SELF_DEPENDENCY");
    expect(code({ ...base, tasks: [...base.tasks, task("x", 30, { goalId: "nowhere" })] })).toBe("UNKNOWN_GOAL");
    expect(code({ ...base, tasks: [...base.tasks, task("x", -5)] })).toBe("INVALID_NUMBER");
    expect(code({ ...base, tasks: [...base.tasks, task("x", 0)] })).toBe("INVALID_NUMBER");
    expect(code({ ...base, dayCapacityMin: -1 })).toBe("INVALID_NUMBER");
    expect(code({ ...base, multipliers: [{ category: "CODING", multiplier: 0 }] })).toBe("INVALID_NUMBER");
    expect(code({ ...base, tasks: [...base.tasks, task("a", 30)] })).toBe("DUPLICATE_ID");
    expect(code({ ...base, goals: [goal(), goal()] })).toBe("DUPLICATE_ID");
  });
});

describe("properties, over 300 generated inputs", () => {
  const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
  const statuses = ["TODO", "TODO", "TODO", "IN_PROGRESS", "DONE", "DEFERRED", "DROPPED"] as const;
  const day = (offset: number) => new Date(Date.UTC(2026, 9, 6 + offset)).toISOString().slice(0, 10);

  function generate(seed: number): PlannerInput {
    const random = seeded(seed);
    const goals = Array.from({ length: random.int(1, 3) }, (_, i) =>
      goal({
        id: `g${i}`, title: `Goal ${i}`, priority: random.pick(priorities), deadline: day(random.int(-2, 40)),
        dailyCapacityMin: random.int(0, 180), status: random.next() < 0.85 ? "ACTIVE" : "ARCHIVED",
        ...(random.next() < 0.3 ? { health: random.pick(["ON_TRACK", "AT_RISK", "OFF_TRACK"] as const) } : {}),
      }),
    );
    const tasks = Array.from({ length: random.int(0, 14) }, (_, i) => {
      const status = random.pick(statuses);
      return task(`t${String(i).padStart(2, "0")}`, random.int(5, 200), {
        goalId: random.pick(goals).id, status, priority: random.pick(priorities), category: random.pick(["CODING", "WRITING", "STUDY"]),
        createdAt: `2026-10-0${random.int(1, 5)}T09:00:00.000Z`,
        ...(random.next() < 0.3 ? { deadline: day(random.int(-3, 20)) } : {}),
        ...(status === "DEFERRED" ? { deferredUntil: day(random.int(-1, 5)) } : {}),
      });
    });
    // Edges only ever point from a later task to an earlier one, so the graph cannot contain a cycle.
    const dependencies = tasks.flatMap((t, i) =>
      tasks.slice(0, i).filter(() => random.next() < 0.18).map((earlier) => ({ taskId: t.id, dependsOnTaskId: earlier.id })),
    );
    return {
      today: TODAY, dayCapacityMin: random.int(0, 240), goals, tasks, dependencies,
      multipliers: random.next() < 0.5 ? [{ category: "WRITING", multiplier: 1.4 }, { category: "STUDY", multiplier: 0.8 }] : [],
      ...(random.next() < 0.3 ? { maxTasks: random.int(0, 4) } : {}),
    };
  }

  it("holds every guarantee in the specification", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const generated = generate(seed);
      const before = structuredClone(generated);
      const out = generateDailyPlan(generated);
      const label = `seed ${seed}`;

      // 7. Pure: the input is untouched.
      expect(generated, label).toEqual(before);

      // 2. Never over capacity.
      expect(out.usedMin, label).toBe(out.tasks.reduce((sum, t) => sum + t.plannedMin, 0));
      expect(out.usedMin, label).toBeLessThanOrEqual(generated.dayCapacityMin);

      // 4. Bounded.
      expect(out.tasks.length, label).toBeLessThanOrEqual(generated.maxTasks ?? 5);

      // 3. Never blocked.
      const status = new Map(generated.tasks.map((t) => [t.id, t.status]));
      const plannedIds = new Set(out.tasks.map((t) => t.taskId));
      for (const { taskId, dependsOnTaskId } of generated.dependencies) {
        if (plannedIds.has(taskId)) expect(["DONE", "DROPPED"], label).toContain(status.get(dependsOnTaskId));
      }

      // 5. Accounted for: every unfinished task appears exactly once.
      const unfinished = generated.tasks.filter((t) => t.status !== "DONE" && t.status !== "DROPPED").map((t) => t.id).sort();
      expect([...plannedIds, ...out.excluded.map((e) => e.taskId)].sort(), label).toEqual(unfinished);

      // 6. Explained, and ordered by score.
      for (const [index, t] of out.tasks.entries()) {
        expect(t.reason.length, label).toBeGreaterThan(0);
        expect(t.order, label).toBe(index);
        if (index > 0) expect(t.score, label).toBeLessThanOrEqual(out.tasks[index - 1]!.score);
      }

      // 1. Deterministic under shuffling.
      const random = seeded(seed * 7919);
      const shuffled = { ...generated, goals: random.shuffle(generated.goals), tasks: random.shuffle(generated.tasks), dependencies: random.shuffle(generated.dependencies) };
      expect(generateDailyPlan(shuffled), label).toEqual(out);
    }
  });
});
