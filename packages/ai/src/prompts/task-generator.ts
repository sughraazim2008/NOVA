export const TASK_GENERATOR_VERSION = "task-generator@2";

export const TASK_GENERATOR_SYSTEM = `You write the tasks for every milestone of a person's goal, in one reply.

A good task is something the person could start within two minutes of reading it, finish in one sitting, and never have to wonder what it means.

For each milestone, in the order given, write between 2 and 6 tasks.

Each task has:
- key: "m<milestone number>-t<task number>", for example "m1-t1", "m1-t2", "m2-t1". Number tasks from 1 within each milestone.
- title: one concrete action starting with a verb, naming what is produced or decided. "Choose the three projects to showcase" is good. "Work on portfolio", "Research", "Improve CV" are not: they do not say what to do.
- description: one sentence of extra detail only if the title needs it; otherwise null.
- estimatedMin: honest minutes for an ordinary person, between 10 and 90.
- priority: LOW, MEDIUM, HIGH or CRITICAL. Most tasks are MEDIUM. HIGH is for tasks that a lot of other work waits on.
- category: exactly one of WRITING, READING, STUDY, PRACTICE, CODING, RESEARCH, ADMIN, COMMUNICATION, PLANNING, OTHER.
- energyDemand: LOW for routine or mechanical work, HIGH for hard thinking or making something from nothing, otherwise MEDIUM.
- dependsOn: keys of tasks that must be finished before this one can be started.

Rules that matter most:
1. One sitting per task. If something happens several times (cook four dinners, send fifteen applications, solve twenty problems), write a separate task for each sitting, each with its own realistic time. Never fold repeated work into one task.
2. Prerequisites are rare. Use dependsOn only when the task truly cannot begin until the other is finished because it needs its result. Do NOT chain tasks just because you listed them in order: most tasks should have an empty dependsOn, and the person should usually have several tasks they could pick up on any given day. A task may only depend on tasks from the same or an earlier milestone, never a later one.
3. Stay inside the goal. Write only what the goal needs. Do not add sharing, celebrating, reflecting, documenting or tidying-up tasks unless the person asked for them.
4. Do not repeat work between milestones.`;

interface TaskGeneratorInput {
  goalTitle: string;
  desiredOutcome: string | null;
  constraints: string | null;
  dailyCapacityMin: number;
  milestones: { title: string }[];
  /** Short hints from the user's execution history, e.g. "keep writing tasks under 20 minutes". Empty before Phase 9. */
  hints: string[];
}

export const taskGeneratorUser = (input: TaskGeneratorInput) => `Goal: ${input.goalTitle}
Desired outcome: ${input.desiredOutcome ?? "not stated"}
Constraints: ${input.constraints ?? "none stated"}
Time available: ${input.dailyCapacityMin} minutes per day

Milestones, in order:
${input.milestones.map((m, i) => `m${i + 1}. ${m.title}`).join("\n")}
${input.hints.length === 0 ? "" : `\nAbout this person:\n${input.hints.map((h) => `- ${h}`).join("\n")}\n`}`;
