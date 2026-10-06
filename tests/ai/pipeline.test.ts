import { FakeLLMClient, SAMPLE_NOTE, SAMPLE_SENTENCES, decomposeGoalText, sampleDraft, validateDraft } from "@nova/ai";
import { GoalDraftSchema } from "@nova/types";
import { describe, expect, it } from "vitest";
import { TODAY, happyLLM, milestonesReply, parsedGoal, realityReply, tasksReplies } from "./fixtures";

const context = { today: TODAY, defaultDailyCapacityMin: 120 };
const request = { text: "Build a portfolio by October 31, an hour a day." };

describe("decomposeGoalText", () => {
  it("turns a sentence into a validated draft", async () => {
    const llm = happyLLM();
    const result = await decomposeGoalText(request, context, { llm });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const draft = result.value;

    expect(draft.goal).toMatchObject({ title: "Build a portfolio", deadline: "2026-10-31", dailyCapacityMin: 60, sourceText: request.text });
    expect(draft.milestones.map((m) => m.key)).toEqual(["m1", "m2", "m3"]);
    expect(draft.tasks.map((t) => t.key)).toEqual(["m1-t1", "m1-t2", "m2-t1", "m2-t2", "m3-t1", "m3-t2"]);
    expect(draft.tasks.find((t) => t.key === "m2-t1")?.dependsOn).toEqual(["m1-t2"]);
    expect(validateDraft(draft, TODAY)).toEqual([]);
    expect(GoalDraftSchema.safeParse(draft).success).toBe(true);

    // parse, decompose, one call per milestone, one reality check
    expect(llm.calls.map((c) => c.task)).toEqual(["goal-parser", "goal-decomposer", "task-generator", "task-generator", "task-generator", "task-reality-check"]);
  });

  it('rewrites "Work on portfolio" into a concrete action, as the specification requires', async () => {
    const result = await decomposeGoalText(request, context, { llm: happyLLM() });
    const first = result.ok ? result.value.tasks[0] : undefined;
    expect(first?.title).toBe("Choose the three projects to showcase");
    expect(first?.realityCheck).toMatchObject({ verdict: "REWRITTEN", original: "Work on portfolio" });
  });

  it("gives each milestone's prompt the tasks written before it", async () => {
    const llm = happyLLM();
    await decomposeGoalText(request, context, { llm });
    const [first, second, third] = llm.callsFor("task-generator").map((c) => c.user);
    expect(first).toContain("Earlier tasks (already written; you may depend on these by key):\nnone");
    expect(second).toContain("- m1-t2:");
    expect(third).toContain("- m2-t2:");
  });

  it("lets what the user typed in the form override what the model read", async () => {
    const result = await decomposeGoalText({ ...request, deadline: "2026-11-20", dailyCapacityMin: 45 }, context, { llm: happyLLM() });
    expect(result.ok && result.value.goal).toMatchObject({ deadline: "2026-11-20", dailyCapacityMin: 45 });
  });

  it("uses the user's usual capacity when the sentence gives none", async () => {
    const quiet = new FakeLLMClient()
      .on("goal-parser", { ...parsedGoal, availableMinPerDay: null })
      .on("goal-decomposer", milestonesReply)
      .on("task-generator", ...tasksReplies)
      .on("task-reality-check", realityReply);
    const result = await decomposeGoalText(request, context, { llm: quiet });
    expect(result.ok && result.value.goal.dailyCapacityMin).toBe(120);
  });

  it("asks for a deadline when neither the sentence nor the form has one", async () => {
    const llm = new FakeLLMClient().on("goal-parser", { ...parsedGoal, deadline: null });
    const result = await decomposeGoalText({ text: "Learn quantum mechanics" }, context, { llm });
    expect(result).toEqual({ ok: false, error: { kind: "NEEDS_DEADLINE", parsedTitle: "Build a portfolio" } });
    expect(llm.calls).toHaveLength(1);
  });

  it("still returns a draft, with a note, when only the reality check is unavailable", async () => {
    const llm = new FakeLLMClient()
      .on("goal-parser", parsedGoal)
      .on("goal-decomposer", milestonesReply)
      .on("task-generator", ...tasksReplies)
      .on("task-reality-check", { error: { kind: "UNAVAILABLE", message: "down" } });
    const result = await decomposeGoalText(request, context, { llm });
    if (!result.ok) throw new Error("expected a draft");
    expect(result.value.notes.join(" ")).toContain("could not run");
    expect(result.value.tasks[0]).toMatchObject({ title: "Work on portfolio", realityCheck: { verdict: "FLAGGED" } });
  });

  it("warns when the plan is more work than the time allows", async () => {
    const result = await decomposeGoalText({ ...request, dailyCapacityMin: 5 }, context, { llm: happyLLM() });
    expect(result.ok && result.value.notes.join(" ")).toContain("hours of work");
  });

  it.each(["goal-parser", "goal-decomposer", "task-generator"])("stops and reports when %s is unavailable", async (task) => {
    const llm = new FakeLLMClient();
    if (task !== "goal-parser") llm.on("goal-parser", parsedGoal);
    if (task === "task-generator") llm.on("goal-decomposer", milestonesReply);
    llm.on(task, { error: { kind: "UNAVAILABLE", message: "down" } });
    const result = await decomposeGoalText(request, context, { llm });
    expect(result).toEqual({ ok: false, error: { kind: "UNAVAILABLE", message: "down" } });
  });

  it("never returns a draft when the model keeps producing a dangling prerequisite", async () => {
    const bad = { tasks: tasksReplies[0]!.tasks.map((t, i) => (i === 0 ? { ...t, dependsOn: ["m7-t1"] } : t)) };
    const llm = new FakeLLMClient().on("goal-parser", parsedGoal).on("goal-decomposer", milestonesReply).on("task-generator", bad);
    const result = await decomposeGoalText(request, context, { llm });
    expect(!result.ok && result.error.kind).toBe("INVALID_OUTPUT");
  });
});

describe("sample mode", () => {
  it.each(SAMPLE_SENTENCES)("has a valid hand-written plan for: %s", (sentence) => {
    const draft = sampleDraft({ text: sentence }, context);
    if (!draft) throw new Error("expected a sample");
    expect(validateDraft(draft, TODAY)).toEqual([]);
    expect(draft.notes[0]).toBe(SAMPLE_NOTE);
    expect(draft.goal.deadline > TODAY).toBe(true);
    expect(draft.milestones.every((m) => m.targetDate !== null && m.targetDate <= draft.goal.deadline)).toBe(true);
    expect(draft.tasks.some((t) => t.realityCheck?.verdict === "REWRITTEN")).toBe(true);
  });

  it("ignores case, punctuation and spacing when recognising a sentence", () => {
    expect(sampleDraft({ text: "  i want to get a software engineering internship by december  " }, context)).not.toBeNull();
  });

  it("shows a split task as a chain in the internship sample", () => {
    const draft = sampleDraft({ text: SAMPLE_SENTENCES[0]! }, context);
    const parts = draft?.tasks.filter((t) => t.realityCheck?.verdict === "SPLIT") ?? [];
    expect(parts.map((t) => t.key)).toEqual(["m2-t3-a", "m2-t3-b", "m2-t3-c"]);
    expect(draft?.tasks.find((t) => t.key === "m2-t4")?.dependsOn).toEqual(["m2-t2", "m2-t3-c"]);
  });

  it("uses the deadline and minutes the user gave", () => {
    const draft = sampleDraft({ text: SAMPLE_SENTENCES[1]!, deadline: "2026-12-01", dailyCapacityMin: 30 }, context);
    expect(draft?.goal).toMatchObject({ deadline: "2026-12-01", dailyCapacityMin: 30 });
  });

  it("returns nothing for a sentence it does not know", () => {
    expect(sampleDraft({ text: "Learn to juggle five balls by spring" }, context)).toBeNull();
  });
});
