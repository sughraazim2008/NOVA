export const TASK_GENERATOR_VERSION = "task-generator@1";

export const TASK_GENERATOR_SYSTEM = `You write the tasks for one milestone of a person's goal.

A good task is something the person could start within two minutes of reading it, in one sitting, without having to decide what it means.

Rules:
- Produce between 2 and 8 tasks, in a sensible working order.
- title: one concrete action starting with a verb, naming what is produced or decided. "Choose the three projects to showcase" is good. "Work on portfolio", "Research", "Improve CV" are not: they do not say what to do.
- description: one sentence of extra detail only if the title needs it; otherwise null.
- estimatedMin: honest minutes for an ordinary person, between 10 and 90. If something would take longer, write it as several tasks.
- priority: LOW, MEDIUM, HIGH or CRITICAL. Most tasks are MEDIUM. HIGH is for tasks other work waits on.
- category: exactly one of WRITING, READING, STUDY, PRACTICE, CODING, RESEARCH, ADMIN, COMMUNICATION, PLANNING, OTHER.
- energyDemand: LOW for routine or mechanical work, HIGH for hard thinking or creating from nothing, otherwise MEDIUM.
- ref: "t1", "t2", … in order.
- dependsOn: refs of tasks in this milestone, or keys of the earlier tasks listed for you, that must be finished before this one can start. Only real prerequisites; most tasks have none or one. A task never depends on a later one.

Do not repeat work already covered by the earlier tasks. Do not write tasks that belong to a later milestone.`;

interface TaskGeneratorInput {
  goalTitle: string;
  desiredOutcome: string | null;
  constraints: string | null;
  dailyCapacityMin: number;
  milestones: { title: string }[];
  milestoneIndex: number;
  earlierTasks: { key: string; title: string }[];
  /** Short hints from the user's execution history, e.g. "keep writing tasks under 20 minutes". Empty before Phase 9. */
  hints: string[];
}

export const taskGeneratorUser = (input: TaskGeneratorInput) => `Goal: ${input.goalTitle}
Desired outcome: ${input.desiredOutcome ?? "not stated"}
Constraints: ${input.constraints ?? "none stated"}
Time available: ${input.dailyCapacityMin} minutes per day

All milestones, in order:
${input.milestones.map((m, i) => `${i + 1}. ${m.title}${i === input.milestoneIndex ? "   ← write tasks for this one" : ""}`).join("\n")}

Earlier tasks (already written; you may depend on these by key):
${input.earlierTasks.length === 0 ? "none" : input.earlierTasks.map((t) => `- ${t.key}: ${t.title}`).join("\n")}
${input.hints.length === 0 ? "" : `\nAbout this person:\n${input.hints.map((h) => `- ${h}`).join("\n")}\n`}`;
