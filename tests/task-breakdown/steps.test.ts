import { FakeLLMClient, breakIntoSteps, fallbackReplacement, fallbackSteps, replaceStep } from "@nova/ai";
import { completeStep, replaceCurrentStep, sessionMinutes, skipStep, stepsExhausted, summarise, toSteps, type SessionProgress } from "@nova/behaviour";
import { MicroActionSchema, StartStepsSchema } from "@nova/types";
import { describe, expect, it } from "vitest";

const steps = [
  { instruction: "Open your dissertation document.", estimatedMin: 2, doneLabel: "I'm there" },
  { instruction: "Find the introduction section.", estimatedMin: 3, doneLabel: "Found it" },
  { instruction: "Write three terrible sentences about what the dissertation is for.", estimatedMin: 5, doneLabel: "Written" },
];
const input = { goalTitle: "Finish dissertation", milestoneTitle: "Draft", task: { title: "Write dissertation introduction", description: null, estimatedMin: 60 } };

describe("breakIntoSteps", () => {
  it("returns the model's micro-actions and gives it the task in context", async () => {
    const llm = new FakeLLMClient().on("task-breaker", { steps });
    const result = await breakIntoSteps({ ...input, earlierFriction: ["Too overwhelming"] }, { llm });
    expect(result).toEqual({ ok: true, value: steps });
    const prompt = llm.calls[0]?.user ?? "";
    expect(prompt).toContain("Task: Write dissertation introduction");
    expect(prompt).toContain("Goal: Finish dissertation");
    expect(prompt).toContain("Stage: Draft");
    expect(prompt).toContain("- Too overwhelming");
    expect(llm.calls[0]?.promptVersion).toBe("task-breaker@1");
  });

  it("insists that the first action takes two minutes at most", async () => {
    const slowStart = { steps: [{ ...steps[0], estimatedMin: 5 }, ...steps.slice(1)] };
    const llm = new FakeLLMClient().on("task-breaker", slowStart, { steps });
    expect((await breakIntoSteps(input, { llm })).ok).toBe(true);
    expect(llm.calls[1]?.user).toContain("first action must take 1 or 2 minutes");
  });

  it.each([
    ["fewer than three actions", { steps: steps.slice(0, 2) }],
    ["an action longer than five minutes", { steps: [...steps.slice(0, 2), { ...steps[2], estimatedMin: 30 }] }],
    ["an action with no instruction", { steps: [...steps.slice(0, 2), { ...steps[2], instruction: " " }] }],
    ["a button label that is a paragraph", { steps: [...steps.slice(0, 2), { ...steps[2], doneLabel: "x".repeat(31) }] }],
    ["something that is not a list of steps", { plan: "just start" }],
  ])("rejects %s", async (_name, bad) => {
    const llm = new FakeLLMClient().on("task-breaker", bad);
    const result = await breakIntoSteps(input, { llm });
    expect(!result.ok && result.error.kind).toBe("INVALID_OUTPUT");
    expect(llm.calls).toHaveLength(2);
  });

  it("reports an unreachable model without retrying", async () => {
    const llm = new FakeLLMClient().on("task-breaker", { error: { kind: "UNAVAILABLE", message: "down" } });
    expect(await breakIntoSteps(input, { llm })).toEqual({ ok: false, error: { kind: "UNAVAILABLE", message: "down" } });
  });
});

describe("fallbackSteps", () => {
  it("is a valid session whose first action is trivially short and names the task", () => {
    const fallback = fallbackSteps({ title: "Write dissertation introduction" });
    expect(StartStepsSchema.safeParse(toSteps(fallback)).success).toBe(true);
    expect(fallback[0]?.estimatedMin).toBeLessThanOrEqual(2);
    expect(fallback[0]?.instruction).toContain("Write dissertation introduction");
    expect(fallback.length).toBeGreaterThanOrEqual(3);
  });

  it("stays valid for the longest title a task can have", () => {
    expect(StartStepsSchema.safeParse(toSteps(fallbackSteps({ title: "x".repeat(200) }))).success).toBe(true);
  });
});

describe("replaceStep", () => {
  const stuckOn = { taskTitle: "Write dissertation introduction", step: steps[2]!, note: "I don't know what the argument is" };

  it("returns one smaller action and passes on what the user said", async () => {
    const smaller = { instruction: "Write one sentence saying what question the dissertation asks.", estimatedMin: 2, doneLabel: "Written" };
    const llm = new FakeLLMClient().on("step-replacer", smaller);
    expect(await replaceStep(stuckOn, { llm })).toEqual({ ok: true, value: smaller });
    expect(llm.calls[0]?.user).toContain("I don't know what the argument is");
  });

  it("rejects a replacement that is no shorter than the action it replaces", async () => {
    const same = { instruction: "Write three sentences.", estimatedMin: 5, doneLabel: "Written" };
    const llm = new FakeLLMClient().on("step-replacer", same);
    const result = await replaceStep(stuckOn, { llm });
    expect(!result.ok && result.error.kind).toBe("INVALID_OUTPUT");
  });

  it("allows a one-minute replacement for a one-minute action", async () => {
    const tiny = { instruction: "Just open the laptop lid.", estimatedMin: 1, doneLabel: "Open" };
    const llm = new FakeLLMClient().on("step-replacer", tiny);
    expect((await replaceStep({ ...stuckOn, step: { instruction: "Open the document.", estimatedMin: 1 }, note: null }, { llm })).ok).toBe(true);
    expect(llm.calls[0]?.user).toContain("nothing said");
  });

  it("has a built-in replacement that is always valid and never longer", () => {
    for (const estimatedMin of [1, 2, 3, 4, 5]) {
      const replacement = fallbackReplacement({ instruction: "y".repeat(300), estimatedMin });
      expect(MicroActionSchema.safeParse(replacement).success).toBe(true);
      expect(replacement.estimatedMin).toBeLessThanOrEqual(estimatedMin);
      if (estimatedMin > 1) expect(replacement.estimatedMin).toBeLessThan(estimatedMin);
    }
  });
});

describe("session rules", () => {
  const fresh = (): SessionProgress => ({ steps: toSteps(steps), currentStep: 0, stuckCount: 0 });

  it("starts with every step pending", () => {
    expect(fresh().steps.map((s) => s.state)).toEqual(["PENDING", "PENDING", "PENDING"]);
    expect(stepsExhausted(fresh())).toBe(false);
  });

  it("moves forward on done and on skip, recording which it was", () => {
    const after = skipStep(completeStep(fresh()));
    expect(after.steps.map((s) => s.state)).toEqual(["DONE", "SKIPPED", "PENDING"]);
    expect(after.currentStep).toBe(2);
    expect(summarise(after)).toEqual({ done: 1, skipped: 1, replaced: 0, remaining: 1 });
  });

  it("is finished with its steps after the last one, and further actions change nothing", () => {
    const end = completeStep(completeStep(completeStep(fresh())));
    expect(stepsExhausted(end)).toBe(true);
    expect(completeStep(end)).toEqual(end);
    expect(skipStep(end)).toEqual(end);
    expect(replaceCurrentStep(end, steps[0]!)).toEqual(end);
  });

  it("on stuck, sets the current step aside, shows the replacement next and keeps the rest", () => {
    const replacement = { instruction: "Write one sentence.", estimatedMin: 2, doneLabel: "Written" };
    const after = replaceCurrentStep(completeStep(fresh()), replacement);
    expect(after.steps.map((s) => [s.instruction, s.state])).toEqual([
      [steps[0]!.instruction, "DONE"],
      [steps[1]!.instruction, "REPLACED"],
      ["Write one sentence.", "PENDING"],
      [steps[2]!.instruction, "PENDING"],
    ]);
    expect(after.currentStep).toBe(2);
    expect(after.stuckCount).toBe(1);
    expect(replaceCurrentStep(after, replacement).stuckCount).toBe(2);
  });

  it("never mutates what it is given", () => {
    const original = fresh();
    const copy = structuredClone(original);
    completeStep(original);
    skipStep(original);
    replaceCurrentStep(original, steps[0]!);
    expect(original).toEqual(copy);
  });

  it("measures a sitting in whole minutes, with a minimum of one", () => {
    expect(sessionMinutes("2026-10-13T18:00:00.000Z", "2026-10-13T18:55:00.000Z")).toBe(55);
    expect(sessionMinutes("2026-10-13T18:00:00.000Z", "2026-10-13T18:00:20.000Z")).toBe(1);
    expect(sessionMinutes("2026-10-13T18:00:00.000Z", "2026-10-13T18:12:40.000Z")).toBe(13);
    expect(sessionMinutes("2026-10-13T23:50:00.000Z", "2026-10-14T00:20:00.000Z")).toBe(30);
  });
});
