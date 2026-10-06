import { FakeLLMClient, applyRealityResults, budgetNote, findCycle, realityCheck, ruleProblems, validateDraft, type RealityResult } from "@nova/ai";
import { describe, expect, it } from "vitest";
import { TODAY, draft, draftTask } from "./fixtures";

const result = (key: string, overrides: Partial<RealityResult> = {}): RealityResult => ({
  key, specificity: 4, actionability: 4, canStartNow: 4, fitsOneSession: 4, verdict: "PASS", reason: "", rewrittenTitle: null, parts: null, ...overrides,
});

describe("ruleProblems (stage 1, no model)", () => {
  it.each([
    "Choose the three projects to showcase",
    "Review arrays, hash maps and trees with one worked example each",
    "Research five companies and note each application deadline",
    "Open the dissertation document",
  ])("accepts a concrete task: %s", (title) => {
    expect(ruleProblems({ title, estimatedMin: 30 })).toEqual([]);
  });

  it.each([
    ["Work on portfolio", "work on"],
    ["Look into internships", "look into"],
    ["Improve CV", "improve"],
    ["Get better at interviews", "get better at"],
    ["  WORK ON the dissertation  ", "work on"],
  ])("flags the vague opener in %s", (title, opener) => {
    expect(ruleProblems({ title, estimatedMin: 30 }).join(" ")).toContain(`"${opener}"`);
  });

  it("does not mistake a word that merely begins like a vague opener", () => {
    expect(ruleProblems({ title: "Improvement notes: write them up", estimatedMin: 30 })).toEqual([]);
  });

  it("flags a title too short to act on", () => {
    expect(ruleProblems({ title: "Portfolio", estimatedMin: 30 })).toEqual(["too short to say what to do"]);
  });

  it("flags a task longer than one sitting, and not one exactly at the limit", () => {
    expect(ruleProblems({ title: "Write the whole dissertation chapter", estimatedMin: 91 })).toHaveLength(1);
    expect(ruleProblems({ title: "Write the whole dissertation chapter", estimatedMin: 90 })).toEqual([]);
  });
});

describe("applyRealityResults", () => {
  it("leaves a passing task alone", () => {
    const [task] = applyRealityResults([draftTask("a")], [result("a")]);
    expect(task?.realityCheck).toEqual({ verdict: "PASS", reason: "", original: null });
  });

  it("rewrites the specification's example and keeps the original for the review screen", () => {
    const vague = draftTask("a", { title: "Work on portfolio" });
    const [task] = applyRealityResults([vague], [result("a", { verdict: "REWRITE", reason: "Too vague.", rewrittenTitle: "Choose the three projects to showcase" })]);
    expect(task?.title).toBe("Choose the three projects to showcase");
    expect(task?.realityCheck).toEqual({ verdict: "REWRITTEN", reason: "Too vague.", original: "Work on portfolio" });
  });

  it("splits a task into a chain and re-points whatever depended on it", () => {
    const tasks = [
      draftTask("a"),
      draftTask("b", { title: "Build and deploy the site", estimatedMin: 240, dependsOn: ["a"], priority: "HIGH" }),
      draftTask("c", { dependsOn: ["b"] }),
    ];
    const parts = [{ title: "Set up the site skeleton", estimatedMin: 60 }, { title: "Add the three project pages", estimatedMin: 90 }, { title: "Deploy the site", estimatedMin: 45 }];
    const out = applyRealityResults(tasks, [result("a"), result("b", { verdict: "SPLIT", reason: "Several sittings.", parts }), result("c")]);

    expect(out.map((t) => [t.key, t.estimatedMin, t.dependsOn])).toEqual([
      ["a", 30, []],
      ["b-a", 60, ["a"]],
      ["b-b", 90, ["b-a"]],
      ["b-c", 45, ["b-b"]],
      ["c", 30, ["b-c"]],
    ]);
    expect(out[1]).toMatchObject({ priority: "HIGH", milestoneKey: "m1", realityCheck: { verdict: "SPLIT", original: "Build and deploy the site" } });
    expect(validateDraft(draft(out), TODAY)).toEqual([]);
  });

  it("flags a task the model passed but a rule objects to", () => {
    const [task] = applyRealityResults([draftTask("a", { title: "Work on portfolio" })], [result("a")]);
    expect(task?.realityCheck?.verdict).toBe("FLAGGED");
    expect(task?.realityCheck?.reason).toContain("Starts with");
    expect(task?.title).toBe("Work on portfolio");
  });

  it("flags a task the model passed despite a low score", () => {
    const [task] = applyRealityResults([draftTask("a")], [result("a", { canStartNow: 2, reason: "Needs the CV first." })]);
    expect(task?.realityCheck).toEqual({ verdict: "FLAGGED", reason: "Needs the CV first.", original: null });
  });

  it("falls back to the rules for a task with no result", () => {
    const out = applyRealityResults([draftTask("a"), draftTask("b", { title: "Improve CV" })], []);
    expect(out.map((t) => t.realityCheck?.verdict)).toEqual(["PASS", "FLAGGED"]);
  });

  it("ignores a REWRITE with nothing to rewrite to, and a SPLIT with fewer than two parts", () => {
    const out = applyRealityResults(
      [draftTask("a"), draftTask("b")],
      [result("a", { verdict: "REWRITE", rewrittenTitle: null }), result("b", { verdict: "SPLIT", parts: [{ title: "Only one part here", estimatedMin: 20 }] })],
    );
    expect(out.map((t) => [t.key, t.realityCheck?.verdict])).toEqual([["a", "PASS"], ["b", "PASS"]]);
  });

  it("does not mutate its input", () => {
    const tasks = [draftTask("a", { title: "Work on portfolio" })];
    const before = structuredClone(tasks);
    applyRealityResults(tasks, [result("a", { verdict: "REWRITE", rewrittenTitle: "Choose the three projects to showcase" })]);
    expect(tasks).toEqual(before);
  });
});

describe("realityCheck (stage 2, with the model)", () => {
  const tasks = [draftTask("a", { title: "Work on portfolio" }), draftTask("b")];

  it("sends every task with the rule findings and applies the verdicts", async () => {
    const llm = new FakeLLMClient().on("task-reality-check", {
      results: [result("a", { verdict: "REWRITE", reason: "Vague.", rewrittenTitle: "Choose the three projects to showcase" }), result("b")],
    });
    const checked = await realityCheck(draft(tasks), { llm });
    expect(checked.degraded).toBe(false);
    expect(checked.tasks.map((t) => t.realityCheck?.verdict)).toEqual(["REWRITTEN", "PASS"]);
    expect(llm.calls[0]?.user).toContain('automatic check: starts with "work on"');
  });

  it("asks again when the model skips a task or invents one", async () => {
    const llm = new FakeLLMClient().on("task-reality-check", { results: [result("a"), result("zzz")] }, { results: [result("a"), result("b")] });
    const checked = await realityCheck(draft(tasks), { llm });
    expect(checked.degraded).toBe(false);
    expect(llm.calls[1]?.user).toContain('no result for "b"');
    expect(llm.calls[1]?.user).toContain('"zzz" is not one of the task keys');
  });

  it("falls back to the rules alone when the model is unavailable, and says so", async () => {
    const llm = new FakeLLMClient().on("task-reality-check", { error: { kind: "UNAVAILABLE", message: "down" } });
    const checked = await realityCheck(draft(tasks), { llm });
    expect(checked.degraded).toBe(true);
    expect(checked.tasks.map((t) => t.realityCheck?.verdict)).toEqual(["FLAGGED", "PASS"]);
  });

  it("reviews a long list in batches", async () => {
    const many = Array.from({ length: 30 }, (_, i) => draftTask(`t${i + 1}`));
    const llm = new FakeLLMClient().on("task-reality-check", (request: { user: string }) => ({
      results: many.filter((t) => request.user.includes(`key: ${t.key}\n`)).map((t) => result(t.key)),
    }));
    const checked = await realityCheck(draft(many), { llm });
    expect(llm.calls).toHaveLength(2);
    expect(checked.tasks).toHaveLength(30);
    expect(checked.degraded).toBe(false);
  });
});

describe("validateDraft", () => {
  it("accepts a sound draft", () => {
    expect(validateDraft(draft([draftTask("a"), draftTask("b", { dependsOn: ["a"] })]), TODAY)).toEqual([]);
  });

  it.each([
    ["a deadline in the past", draft([draftTask("a")], { deadline: "2026-10-01" }), "in the past"],
    ["a duplicate task key", draft([draftTask("a"), draftTask("a")]), "used twice"],
    ["a task in a milestone that does not exist", draft([draftTask("a", { milestoneKey: "m9" })]), "does not exist"],
    ["a prerequisite that does not exist", draft([draftTask("a", { dependsOn: ["ghost"] })]), '"ghost"'],
    ["a task that depends on itself", draft([draftTask("a", { dependsOn: ["a"] })]), "depends on itself"],
    ["the same prerequisite twice", draft([draftTask("a"), draftTask("b", { dependsOn: ["a", "a"] })]), "twice"],
    ["a task due after the goal", draft([draftTask("a", { deadline: "2026-11-30" })]), "after the goal deadline"],
    ["a loop", draft([draftTask("a", { dependsOn: ["c"] }), draftTask("b", { dependsOn: ["a"] }), draftTask("c", { dependsOn: ["b"] })]), "loop"],
  ])("reports %s", (_name, bad, expected) => {
    expect(validateDraft(bad, TODAY).join(" ")).toContain(expected);
  });

  it("reports a milestone dated after the goal", () => {
    const bad = { ...draft([draftTask("a")]), milestones: [{ key: "m1", title: "Design", targetDate: "2026-12-01" }] };
    expect(validateDraft(bad, TODAY).join(" ")).toContain("after the goal deadline");
  });
});

describe("findCycle", () => {
  it("returns null for a chain and for a diamond", () => {
    expect(findCycle([{ key: "a", dependsOn: [] }, { key: "b", dependsOn: ["a"] }, { key: "c", dependsOn: ["b"] }])).toBeNull();
    expect(findCycle([{ key: "a", dependsOn: [] }, { key: "b", dependsOn: ["a"] }, { key: "c", dependsOn: ["a"] }, { key: "d", dependsOn: ["b", "c"] }])).toBeNull();
  });

  it("names the tasks in a loop", () => {
    expect(findCycle([{ key: "a", dependsOn: ["b"] }, { key: "b", dependsOn: ["a"] }])).toEqual(["a", "b", "a"]);
  });
});

describe("budgetNote", () => {
  // 2026-10-06 to 2026-10-31 inclusive is 26 days; at 60 minutes a day that is 1560 minutes.
  it("says nothing when the work fits", () => {
    expect(budgetNote(draft([draftTask("a", { estimatedMin: 480 }), draftTask("b", { estimatedMin: 480 })]), TODAY)).toBeNull();
  });

  it("states both figures when it does not", () => {
    const tasks = Array.from({ length: 4 }, (_, i) => draftTask(`t${i}`, { estimatedMin: 480 }));
    expect(budgetNote(draft(tasks), TODAY)).toContain("about 32 hours of work");
    expect(budgetNote(draft(tasks), TODAY)).toContain("about 26 hours");
  });
});
