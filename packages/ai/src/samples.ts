import { GoalDraftSchema, type DecomposeRequest, type DraftTask, type GoalDraft, type IsoDate } from "@nova/types";
import { addDays, daysBetween } from "./dates";
import { budgetNote } from "./draft";
import { applyRealityResults, type RealityResult } from "./task-reality-check";

// Sample mode: what NOVA shows when no language model is configured.
//
// These plans were written by hand, not generated. They exist so the review-and-confirm flow
// can be used and demonstrated without a model, and every draft built from them says so.
// They still pass through the real Task Reality Check code, with hand-written verdicts
// standing in for the model's.

type SampleTask = [ref: string, title: string, minutes: number, category: DraftTask["category"], energy: DraftTask["energyDemand"], dependsOn?: string[], priority?: DraftTask["priority"]];

interface Sample {
  sentence: string;
  title: string;
  desiredOutcome: string;
  priority: GoalDraft["goal"]["priority"];
  daysToDeadline: number;
  milestones: { title: string; tasks: SampleTask[] }[];
  /** Hand-written stand-ins for the model's reality-check verdicts. */
  verdicts: Pick<RealityResult, "key" | "verdict" | "reason" | "rewrittenTitle" | "parts">[];
}

const SAMPLES: Sample[] = [
  {
    sentence: "I want to get a software engineering internship by December.",
    title: "Get a software engineering internship",
    desiredOutcome: "An accepted internship offer",
    priority: "HIGH",
    daysToDeadline: 70,
    milestones: [
      {
        title: "Prepare",
        tasks: [
          ["t1", "List every project, job and course from the last two years", 25, "PLANNING", "LOW", [], "HIGH"],
          ["t2", "Work on CV", 60, "WRITING", "HIGH", ["t1"], "HIGH"],
          ["t3", "Send the CV to one person and ask for three criticisms", 15, "COMMUNICATION", "LOW", ["t2"]],
          ["t4", "Update the LinkedIn headline and summary to match the CV", 30, "WRITING", "MEDIUM", ["t2"]],
        ],
      },
      {
        title: "Build evidence",
        tasks: [
          ["t1", "Choose the three projects to showcase", 20, "PLANNING", "LOW", [], "HIGH"],
          ["t2", "Write the README for the strongest project", 45, "WRITING", "HIGH", ["t1"]],
          ["t3", "Polish and deploy the strongest project", 180, "CODING", "HIGH", ["t1"]],
          ["t4", "Add the three projects to the portfolio page", 50, "CODING", "MEDIUM", ["t2", "t3"]],
        ],
      },
      {
        title: "Find opportunities",
        tasks: [
          ["t1", "List fifteen companies offering software internships", 45, "RESEARCH", "MEDIUM", [], "HIGH"],
          ["t2", "Record each company's application deadline in one sheet", 30, "ADMIN", "LOW", ["t1"]],
          ["t3", "Message three people who work at companies on the list", 30, "COMMUNICATION", "MEDIUM", ["t1", "m1-t4"]],
        ],
      },
      {
        title: "Apply",
        tasks: [
          ["t1", "Write a cover letter template with two paragraphs to customise", 40, "WRITING", "HIGH", ["m1-t3"]],
          ["t2", "Submit the first five applications", 75, "ADMIN", "MEDIUM", ["t1", "m3-t2", "m2-t4"], "HIGH"],
          ["t3", "Submit the next five applications", 75, "ADMIN", "MEDIUM", ["t2"]],
          ["t4", "Submit the final five applications", 75, "ADMIN", "MEDIUM", ["t3"]],
        ],
      },
      {
        title: "Interview",
        tasks: [
          ["t1", "Write five short stories about past projects for behavioural questions", 50, "WRITING", "MEDIUM"],
          ["t2", "Review arrays, hash maps and trees with one worked example each", 60, "STUDY", "HIGH"],
          ["t3", "Solve five easy coding problems under a timer", 60, "PRACTICE", "HIGH", ["t2"]],
          ["t4", "Solve five medium coding problems under a timer", 90, "PRACTICE", "HIGH", ["t3"]],
          ["t5", "Do one mock interview with a friend and note three things to fix", 60, "PRACTICE", "MEDIUM", ["t1", "t3"]],
        ],
      },
    ],
    verdicts: [
      { key: "m1-t2", verdict: "REWRITE", reason: "Does not say what to change or when it is finished.", rewrittenTitle: "Rewrite the CV experience section using the list of projects", parts: null },
      {
        key: "m2-t3",
        verdict: "SPLIT",
        reason: "Three hours is several sittings and at least two different jobs.",
        rewrittenTitle: null,
        parts: [
          { title: "Add tests for the core module of the strongest project", estimatedMin: 90 },
          { title: "Fix the two roughest edges a visitor would notice", estimatedMin: 50 },
          { title: "Deploy the project and add the link to its README", estimatedMin: 40 },
        ],
      },
    ],
  },
  {
    sentence: "Build a portfolio website by the end of next month.",
    title: "Build a portfolio website",
    desiredOutcome: "A public site showing my best projects",
    priority: "MEDIUM",
    daysToDeadline: 45,
    milestones: [
      {
        title: "Design",
        tasks: [
          ["t1", "Work on portfolio", 60, "PLANNING", "MEDIUM", [], "HIGH"],
          ["t2", "Collect five portfolio sites you like and note one idea from each", 30, "RESEARCH", "LOW"],
          ["t3", "Sketch the home page layout on paper", 25, "PLANNING", "MEDIUM", ["t1", "t2"]],
        ],
      },
      {
        title: "Development",
        tasks: [
          ["t1", "Set up the site skeleton with one page that loads", 60, "CODING", "MEDIUM", ["m1-t3"], "HIGH"],
          ["t2", "Build the home page from the sketch", 90, "CODING", "HIGH", ["t1"]],
          ["t3", "Build one project page as a reusable template", 75, "CODING", "HIGH", ["t1"]],
        ],
      },
      {
        title: "Content",
        tasks: [
          ["t1", "Write a three-sentence introduction about yourself", 20, "WRITING", "MEDIUM"],
          ["t2", "Write the description for each of the three projects", 60, "WRITING", "HIGH", ["m1-t1"]],
          ["t3", "Take or choose one screenshot per project", 30, "ADMIN", "LOW", ["m1-t1"]],
          ["t4", "Add the text and screenshots to the project pages", 45, "CODING", "LOW", ["t2", "t3", "m2-t3"]],
        ],
      },
      {
        title: "Deployment",
        tasks: [
          ["t1", "Deploy the site and open the public link on your phone", 40, "CODING", "MEDIUM", ["m2-t2", "m3-t4"], "HIGH"],
          ["t2", "Ask two people to try the site and report anything confusing", 15, "COMMUNICATION", "LOW", ["t1"]],
          ["t3", "Fix the issues they found", 45, "CODING", "MEDIUM", ["t2"]],
        ],
      },
    ],
    verdicts: [
      { key: "m1-t1", verdict: "REWRITE", reason: "Names an area of work, not an action.", rewrittenTitle: "Choose the three projects to showcase", parts: null },
    ],
  },
];

const normalise = (text: string) => text.toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();

/** The sentences sample mode recognises, for showing as clickable examples. */
export const SAMPLE_SENTENCES = SAMPLES.map((sample) => sample.sentence);

export const SAMPLE_NOTE = "Sample plan: no AI model is connected, so this is a pre-written example rather than a plan generated from your words.";

/** A hand-written draft for a recognised sentence, dated relative to `today`; null for anything else. */
export function sampleDraft(request: DecomposeRequest, context: { today: IsoDate; defaultDailyCapacityMin: number }): GoalDraft | null {
  const sample = SAMPLES.find((candidate) => normalise(candidate.sentence) === normalise(request.text));
  if (!sample) return null;

  const { today } = context;
  const deadline = request.deadline ?? addDays(today, sample.daysToDeadline);
  const span = Math.max(1, daysBetween(today, deadline));

  const milestones = sample.milestones.map((milestone, index) => ({
    key: `m${index + 1}`,
    title: milestone.title,
    targetDate: addDays(today, Math.round((span * (index + 1)) / sample.milestones.length)),
  }));

  const rawTasks: DraftTask[] = sample.milestones.flatMap((milestone, index) =>
    milestone.tasks.map(([ref, title, estimatedMin, category, energyDemand, dependsOn = [], priority = "MEDIUM"]) => ({
      key: `m${index + 1}-${ref}`,
      milestoneKey: `m${index + 1}`,
      title,
      description: null,
      estimatedMin,
      priority,
      category,
      energyDemand,
      deadline: null,
      dependsOn: dependsOn.map((key) => (key.includes("-") ? key : `m${index + 1}-${key}`)),
      source: "AI" as const,
      realityCheck: null,
    })),
  );

  const verdicts: RealityResult[] = sample.verdicts.map((verdict) => ({ specificity: 2, actionability: 2, canStartNow: 3, fitsOneSession: 3, ...verdict }));

  const draft: GoalDraft = {
    goal: {
      title: sample.title,
      description: null,
      desiredOutcome: sample.desiredOutcome,
      deadline,
      priority: sample.priority,
      dailyCapacityMin: request.dailyCapacityMin ?? context.defaultDailyCapacityMin,
      constraints: null,
      sourceText: request.text,
    },
    milestones,
    tasks: applyRealityResults(rawTasks, verdicts),
    notes: [SAMPLE_NOTE],
  };
  const budget = budgetNote(draft, today);
  if (budget) draft.notes.push(budget);
  return GoalDraftSchema.parse(draft);
}
