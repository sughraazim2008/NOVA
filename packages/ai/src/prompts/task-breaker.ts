export const TASK_BREAKER_VERSION = "task-breaker@1";

export const TASK_BREAKER_SYSTEM = `A person is about to start a task they have been finding hard to begin. You turn the task into the first few physical actions, so that starting needs no thought at all.

Write between 3 and 6 micro-actions, in order.

Each micro-action has:
- instruction: one plain sentence telling the person exactly what to do with their hands or eyes right now. Specific to this task. No motivation, no advice, no "try to".
- estimatedMin: whole minutes, from 1 to 5.
- doneLabel: two or three words for the button they press when it is done, in their voice: "I'm there", "It's open", "Written", "Done".

Rules:
- The first action must be almost embarrassingly easy and take 1 or 2 minutes: open the document, get the book off the shelf, open the website. It gets the person physically in place and nothing more.
- Each following action is a little more real than the last, and none takes more than 5 minutes.
- By the last action the person should be genuinely doing the task, not preparing for it. Lower the bar on quality to get them moving: "write three rough sentences" is better than "write the introduction".
- Do not try to cover the whole task. These are the first ten to fifteen minutes only. After them the person carries on by themselves.
- If earlier difficulties with this task are listed, shape the actions around them.`;

interface TaskBreakerInput {
  goalTitle: string;
  milestoneTitle: string | null;
  taskTitle: string;
  taskDescription: string | null;
  estimatedMin: number;
  /** What got in the way before, most recent first. Empty until friction is recorded (Phase 8). */
  earlierFriction: string[];
}

export const taskBreakerUser = (input: TaskBreakerInput) => `Goal: ${input.goalTitle}
${input.milestoneTitle ? `Stage: ${input.milestoneTitle}\n` : ""}Task: ${input.taskTitle}
${input.taskDescription ? `Detail: ${input.taskDescription}\n` : ""}Planned time for the whole task: ${input.estimatedMin} minutes
${input.earlierFriction.length ? `\nEarlier difficulties with this task:\n${input.earlierFriction.map((f) => `- ${f}`).join("\n")}\n` : ""}`;

export const STEP_REPLACER_VERSION = "step-replacer@1";

export const STEP_REPLACER_SYSTEM = `A person working through a task one small action at a time has said they are stuck on the current action. Replace it with ONE action that is clearly smaller or clearer, so they can move.

- If they said what is in the way, answer that directly: remove the obstacle or step around it.
- Otherwise halve the action: the smallest visible piece of it.
- instruction: one plain sentence saying exactly what to do right now. No sympathy, no advice.
- estimatedMin: whole minutes from 1 to 5, and less than the action it replaces whenever that one was more than 1.
- doneLabel: two or three words for the button they press when it is done.`;

interface StepReplacerInput {
  taskTitle: string;
  instruction: string;
  estimatedMin: number;
  note: string | null;
}

export const stepReplacerUser = (input: StepReplacerInput) => `Task: ${input.taskTitle}
Current action (${input.estimatedMin} min): ${input.instruction}
What they said is in the way: ${input.note ?? "nothing said"}`;
