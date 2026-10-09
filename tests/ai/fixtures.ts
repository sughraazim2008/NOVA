import { FakeLLMClient, type GoalToDecompose } from "@nova/ai";
import type { DraftTask, GoalDraft } from "@nova/types";

export const TODAY = "2026-10-06";

export const parsedGoal = {
  title: "Build a portfolio",
  desiredOutcome: "A public site showing my best work",
  deadline: "2026-10-31",
  priority: "MEDIUM",
  constraints: null,
  availableMinPerDay: 60,
} as const;

export const goal: GoalToDecompose = { ...parsedGoal, dailyCapacityMin: 60 };

export const milestonesReply = {
  milestones: [
    { title: "Design", targetDate: "2026-10-12" },
    { title: "Development", targetDate: "2026-10-22" },
    { title: "Deployment", targetDate: "2026-10-30" },
  ],
};

const task = (key: string, title: string, estimatedMin: number, dependsOn: string[] = []) => ({
  key,
  title,
  description: null,
  estimatedMin,
  priority: "MEDIUM",
  category: "CODING",
  energyDemand: "MEDIUM",
  dependsOn,
});

/** All tasks for all three milestones, as the model returns them in one reply. */
export const tasksReply = {
  tasks: [
    task("m1-t1", "Work on portfolio", 60),
    task("m1-t2", "Sketch the home page layout on paper", 25, ["m1-t1"]),
    task("m2-t1", "Set up the site skeleton with one page", 60, ["m1-t2"]),
    task("m2-t2", "Build the home page from the sketch", 90, ["m2-t1"]),
    task("m3-t1", "Deploy the site and open the public link", 40, ["m2-t2"]),
    task("m3-t2", "Ask two people to try the site", 15, ["m3-t1"]),
  ],
};

const pass = (key: string) => ({
  key, specificity: 4, actionability: 4, canStartNow: 4, fitsOneSession: 5, verdict: "PASS", reason: "", rewrittenTitle: null, parts: null,
});

export const realityReply = {
  results: [
    { ...pass("m1-t1"), specificity: 1, actionability: 2, verdict: "REWRITE", reason: "Names an area of work, not an action.", rewrittenTitle: "Choose the three projects to showcase" },
    pass("m1-t2"), pass("m2-t1"), pass("m2-t2"), pass("m3-t1"), pass("m3-t2"),
  ],
};

/** A model scripted to answer the whole pipeline correctly. */
export const happyLLM = () =>
  new FakeLLMClient()
    .on("goal-parser", parsedGoal)
    .on("goal-decomposer", milestonesReply)
    .on("task-generator", tasksReply)
    .on("task-reality-check", realityReply);

export const draftTask = (key: string, overrides: Partial<DraftTask> = {}): DraftTask => ({
  key,
  milestoneKey: "m1",
  title: `Write the ${key} section of the report`,
  description: null,
  estimatedMin: 30,
  priority: "MEDIUM",
  category: "WRITING",
  energyDemand: "MEDIUM",
  deadline: null,
  dependsOn: [],
  source: "AI",
  realityCheck: null,
  ...overrides,
});

export const draft = (tasks: DraftTask[], overrides: Partial<GoalDraft["goal"]> = {}): GoalDraft => ({
  goal: {
    title: "Build a portfolio", description: null, desiredOutcome: null, deadline: "2026-10-31", priority: "MEDIUM",
    dailyCapacityMin: 60, constraints: null, sourceText: null, ...overrides,
  },
  milestones: [{ key: "m1", title: "Design", targetDate: null }],
  tasks,
  notes: [],
});
