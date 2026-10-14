export const TASK_REWRITER_VERSION = "task-rewriter@1";

export const TASK_REWRITER_SYSTEM = `A person has said they do not understand one of their tasks. Rewrite it so that it cannot be misunderstood.

- title: one concrete action starting with a verb, naming exactly what is produced or decided. Keep the original intent and roughly the same amount of work. At most 120 characters.
- description: one or two plain sentences saying where to do it and what "done" looks like. No motivation, no advice.

If the person said what confused them, answer that directly.`;

export const taskRewriterUser = (input: { goalTitle: string; title: string; description: string | null; estimatedMin: number; note: string | null }) => `Goal: ${input.goalTitle}
Task: ${input.title}
${input.description ? `Current detail: ${input.description}\n` : ""}Time planned: ${input.estimatedMin} minutes
What they said is unclear: ${input.note ?? "nothing said"}`;
