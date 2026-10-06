import { FakeLLMClient, decomposeGoal, generateTasks, parseGoal } from "@nova/ai";
import { describe, expect, it } from "vitest";
import { TODAY, draftTask, goal, milestonesReply, parsedGoal, tasksReplies } from "./fixtures";

const milestones = milestonesReply.milestones.map((m, i) => ({ key: `m${i + 1}`, ...m }));

describe("parseGoal", () => {
  it("returns the structured goal and tells the model today's date", async () => {
    const llm = new FakeLLMClient().on("goal-parser", parsedGoal);
    const result = await parseGoal({ text: "Build a portfolio by October 31, an hour a day.", today: TODAY }, { llm });
    expect(result).toEqual({ ok: true, value: parsedGoal });
    expect(llm.calls[0]?.user).toContain(`Today's date: ${TODAY}`);
    expect(llm.calls[0]?.user).toContain("Build a portfolio by October 31");
    expect(llm.calls[0]?.promptVersion).toBe("goal-parser@1");
  });

  it("accepts a sentence with no deadline", async () => {
    const llm = new FakeLLMClient().on("goal-parser", { ...parsedGoal, deadline: null, availableMinPerDay: null });
    const result = await parseGoal({ text: "Learn quantum mechanics", today: TODAY }, { llm });
    expect(result.ok && result.value.deadline).toBeNull();
  });

  it("rejects a deadline before today and accepts the corrected one", async () => {
    // "by December" resolved to the December that has already passed, then to the coming one.
    const llm = new FakeLLMClient().on("goal-parser", { ...parsedGoal, deadline: "2025-12-31" }, { ...parsedGoal, deadline: "2026-12-31" });
    const result = await parseGoal({ text: "Get an internship by December", today: TODAY }, { llm });
    expect(result.ok && result.value.deadline).toBe("2026-12-31");
    expect(llm.calls[1]?.user).toContain("before today");
  });

  it.each([
    ["an empty title", { title: "" }],
    ["a date that is not a date", { deadline: "December" }],
    ["an unknown priority", { priority: "URGENT" }],
    ["impossible minutes per day", { availableMinPerDay: 2000 }],
  ])("fails with INVALID_OUTPUT when the model keeps returning %s", async (_name, override) => {
    const llm = new FakeLLMClient().on("goal-parser", { ...parsedGoal, ...override });
    const result = await parseGoal({ text: "Build a portfolio", today: TODAY }, { llm });
    expect(!result.ok && result.error.kind).toBe("INVALID_OUTPUT");
    expect(llm.calls).toHaveLength(2);
  });
});

describe("decomposeGoal", () => {
  it("returns ordered milestones with keys assigned by code", async () => {
    const llm = new FakeLLMClient().on("goal-decomposer", milestonesReply);
    const result = await decomposeGoal({ goal, today: TODAY }, { llm });
    expect(result.ok && result.value.map((m) => [m.key, m.title])).toEqual([["m1", "Design"], ["m2", "Development"], ["m3", "Deployment"]]);
    expect(llm.calls[0]?.user).toContain("Deadline: 2026-10-31");
  });

  const withDates = (...dates: (string | null)[]) => ({
    milestones: milestonesReply.milestones.map((m, i) => ({ ...m, targetDate: dates[i] ?? null })),
  });

  it.each([
    ["fewer than three milestones", { milestones: milestonesReply.milestones.slice(0, 2) }],
    ["a milestone after the goal deadline", withDates("2026-10-12", "2026-10-22", "2026-11-05")],
    ["a milestone before today", withDates("2026-10-01", "2026-10-22", "2026-10-30")],
    ["dates that go backwards", withDates("2026-10-20", "2026-10-12", "2026-10-30")],
    ["the same milestone twice", { milestones: [...milestonesReply.milestones.slice(0, 2), { title: "design", targetDate: null }] }],
  ])("rejects %s", async (_name, reply) => {
    const llm = new FakeLLMClient().on("goal-decomposer", reply);
    const result = await decomposeGoal({ goal, today: TODAY }, { llm });
    expect(!result.ok && result.error.kind).toBe("INVALID_OUTPUT");
  });
});

describe("generateTasks", () => {
  const earlier = [draftTask("m1-t1"), draftTask("m1-t2")];
  const input = { goal, milestones, milestoneIndex: 1, earlierTasks: earlier };

  it("turns refs into keys and keeps dependencies on earlier milestones", async () => {
    const llm = new FakeLLMClient().on("task-generator", tasksReplies[1]);
    const result = await generateTasks(input, { llm });
    expect(result.ok && result.value.map((t) => [t.key, t.milestoneKey, t.dependsOn])).toEqual([
      ["m2-t1", "m2", ["m1-t2"]],
      ["m2-t2", "m2", ["m2-t1"]],
    ]);
    expect(result.ok && result.value.every((t) => t.source === "AI" && t.realityCheck === null)).toBe(true);
  });

  it("shows the model the earlier tasks and marks which milestone to write", async () => {
    const llm = new FakeLLMClient().on("task-generator", tasksReplies[1]);
    await generateTasks({ ...input, hints: ["keep writing tasks under 20 minutes"] }, { llm });
    const prompt = llm.calls[0]?.user ?? "";
    expect(prompt).toContain("- m1-t2:");
    expect(prompt).toContain("2. Development   ← write tasks for this one");
    expect(prompt).toContain("keep writing tasks under 20 minutes");
  });

  const reply = (...tasks: object[]) => ({ tasks: tasks.map((t, i) => ({ ...tasksReplies[1]!.tasks[0], ref: `t${i + 1}`, dependsOn: [], ...t })) });

  it.each([
    ["a prerequisite that does not exist", reply({ dependsOn: ["m9-t9"] }, {})],
    ["a task that depends on itself", reply({ dependsOn: ["t1"] }, {})],
    ["tasks that wait on each other", reply({ dependsOn: ["t2"] }, { dependsOn: ["t1"] })],
    ["a duplicate ref", reply({}, { ref: "t1" })],
    ["a duration over eight hours", reply({ estimatedMin: 600 }, {})],
    ["a category outside the list", reply({ category: "GARDENING" }, {})],
    ["only one task", reply({})],
  ])("rejects %s", async (_name, bad) => {
    const llm = new FakeLLMClient().on("task-generator", bad);
    const result = await generateTasks(input, { llm });
    expect(!result.ok && result.error.kind).toBe("INVALID_OUTPUT");
    expect(llm.calls).toHaveLength(2);
  });

  it("recovers when the second reply fixes a dangling prerequisite", async () => {
    const llm = new FakeLLMClient().on("task-generator", reply({ dependsOn: ["m9-t9"] }, {}), tasksReplies[1]);
    expect((await generateTasks(input, { llm })).ok).toBe(true);
    expect(llm.calls[1]?.user).toContain("m9-t9");
  });
});
