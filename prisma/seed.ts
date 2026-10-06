// Development seed: one user and the specification's example goal.
// Safe to run repeatedly: it replaces the demo user and everything they own.
import {
  addDependency,
  createDb,
  createGoal,
  createMilestone,
  createTask,
  createUser,
  deleteUser,
  getUserByEmail,
} from "@nova/database";
import type { CreateTaskInput } from "@nova/types";

export const DEMO_EMAIL = "demo@nova.local";

type SeedTask = CreateTaskInput & { key: string; after?: string[] };

const milestones: { title: string; targetDate: string; tasks: SeedTask[] }[] = [
  {
    title: "Prepare",
    targetDate: "2026-10-20",
    tasks: [
      { key: "cv-list", title: "List every project, job and course from the last two years", estimatedMin: 25, category: "PLANNING", energyDemand: "LOW", priority: "HIGH" },
      { key: "cv-draft", title: "Rewrite the CV experience section using that list", estimatedMin: 60, category: "WRITING", energyDemand: "HIGH", priority: "HIGH", after: ["cv-list"] },
      { key: "cv-review", title: "Send the CV to one person and ask for three criticisms", estimatedMin: 15, category: "COMMUNICATION", energyDemand: "LOW", after: ["cv-draft"] },
      { key: "linkedin", title: "Update the LinkedIn headline and summary to match the CV", estimatedMin: 30, category: "WRITING", after: ["cv-draft"] },
    ],
  },
  {
    title: "Build evidence",
    targetDate: "2026-11-05",
    tasks: [
      { key: "pick-projects", title: "Choose the three projects to showcase", estimatedMin: 20, category: "PLANNING", energyDemand: "LOW", priority: "HIGH" },
      { key: "readme-1", title: "Write the README for the strongest project", estimatedMin: 45, category: "WRITING", energyDemand: "HIGH", after: ["pick-projects"] },
      { key: "tests-1", title: "Add tests for the core module of the strongest project", estimatedMin: 90, category: "CODING", energyDemand: "HIGH", after: ["pick-projects"] },
      { key: "deploy-1", title: "Deploy the strongest project and add the link to its README", estimatedMin: 40, category: "CODING", after: ["readme-1", "tests-1"] },
      { key: "portfolio-page", title: "Add the three projects to the portfolio page", estimatedMin: 50, category: "CODING", after: ["deploy-1"] },
    ],
  },
  {
    title: "Find opportunities",
    targetDate: "2026-11-12",
    tasks: [
      { key: "company-list", title: "List fifteen companies offering software internships", estimatedMin: 45, category: "RESEARCH", priority: "HIGH" },
      { key: "deadlines", title: "Record each company's application deadline in one sheet", estimatedMin: 30, category: "ADMIN", energyDemand: "LOW", after: ["company-list"] },
      { key: "referrals", title: "Message three people who work at companies on the list", estimatedMin: 30, category: "COMMUNICATION", after: ["company-list", "linkedin"] },
    ],
  },
  {
    title: "Apply",
    targetDate: "2026-11-28",
    tasks: [
      { key: "cover-template", title: "Write a cover letter template with two paragraphs to customise", estimatedMin: 40, category: "WRITING", energyDemand: "HIGH", after: ["cv-review"] },
      { key: "apply-1", title: "Submit the first five applications", estimatedMin: 75, category: "ADMIN", priority: "HIGH", deadline: "2026-11-14", after: ["cover-template", "deadlines", "portfolio-page"] },
      { key: "apply-2", title: "Submit the next five applications", estimatedMin: 75, category: "ADMIN", after: ["apply-1"] },
      { key: "apply-3", title: "Submit the final five applications", estimatedMin: 75, category: "ADMIN", after: ["apply-2"] },
    ],
  },
  {
    title: "Interview",
    targetDate: "2026-12-15",
    tasks: [
      { key: "stories", title: "Write five short stories about past projects for behavioural questions", estimatedMin: 50, category: "WRITING" },
      { key: "ds-review", title: "Review arrays, hash maps and trees with one worked example each", estimatedMin: 60, category: "STUDY", energyDemand: "HIGH" },
      { key: "practice-1", title: "Solve five easy coding problems under a timer", estimatedMin: 60, category: "PRACTICE", energyDemand: "HIGH", after: ["ds-review"] },
      { key: "practice-2", title: "Solve five medium coding problems under a timer", estimatedMin: 90, category: "PRACTICE", energyDemand: "HIGH", after: ["practice-1"] },
      { key: "mock", title: "Do one mock interview with a friend and note three things to fix", estimatedMin: 60, category: "PRACTICE", after: ["stories", "practice-1"] },
    ],
  },
];

export async function seed(connectionString: string) {
  const db = createDb(connectionString);
  try {
    const existing = await getUserByEmail(db, DEMO_EMAIL);
    if (existing) await deleteUser(db, existing.id);

    const user = await createUser(db, { email: DEMO_EMAIL, name: "Demo", timezone: "Europe/London" });
    const goal = await createGoal(db, user.id, {
      title: "Get a software engineering internship",
      desiredOutcome: "An accepted internship offer",
      deadline: "2026-12-15",
      priority: "HIGH",
      dailyCapacityMin: 90,
      sourceText: "I want to get a software engineering internship by December.",
    });

    const idByKey = new Map<string, string>();
    const pending: { key: string; after: string[] }[] = [];

    for (const m of milestones) {
      const milestone = await createMilestone(db, user.id, goal.id, { title: m.title, targetDate: m.targetDate });
      if (!milestone) throw new Error(`seed: could not create milestone ${m.title}`);
      for (const { key, after = [], ...input } of m.tasks) {
        const task = await createTask(db, user.id, milestone.id, { ...input, origin: "AI" });
        if (!task) throw new Error(`seed: could not create task ${key}`);
        idByKey.set(key, task.id);
        pending.push({ key, after });
      }
    }

    let dependencies = 0;
    for (const { key, after } of pending) {
      for (const prerequisite of after) {
        const result = await addDependency(db, user.id, {
          taskId: idByKey.get(key) as string,
          dependsOnTaskId: idByKey.get(prerequisite) as string,
        });
        if (!result.ok) throw new Error(`seed: ${key} → ${prerequisite}: ${result.error}`);
        dependencies += 1;
      }
    }

    return { userId: user.id, goalId: goal.id, milestones: milestones.length, tasks: idByKey.size, dependencies };
  } finally {
    await db.$disconnect();
  }
}

// Run directly (pnpm db:seed), not when imported by tests.
if (process.argv[1]?.endsWith("seed.ts")) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const summary = await seed(url);
  console.log(`Seeded ${DEMO_EMAIL}:`, summary);
}
