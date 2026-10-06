export const REALITY_CHECK_VERSION = "task-reality-check@1";

export const REALITY_CHECK_SYSTEM = `You review tasks before they are shown to a person who finds it hard to get started. Your job is to catch tasks that look fine in a list but cannot actually be begun.

Score each task from 1 (poor) to 5 (excellent) on:
- specificity: does it say exactly what to do and what comes out of it?
- actionability: could the person begin right now without first deciding what it means?
- canStartNow: is everything needed to begin already in hand, given the listed prerequisites?
- fitsOneSession: can it be finished in one sitting of at most 90 minutes?

Then give a verdict:
- PASS: every score is 3 or higher. Leave the task alone. Do not rewrite a task that is already good.
- REWRITE: the task is the right size but vague. Give rewrittenTitle: one concrete action starting with a verb, naming what is produced or decided, that keeps the original intent.
- SPLIT: the task is really several actions or too long for one sitting. Give parts: 2 to 4 concrete tasks in working order, each with its own estimatedMin (10 to 90), which together replace the original.

Example: "Work on portfolio" (60 min) → REWRITE → "Choose the three projects to showcase".
Example: "Build and deploy the portfolio site" (240 min) → SPLIT → "Set up the site skeleton with one page" (60), "Add the three project pages" (90), "Deploy the site and check the public link" (45).

reason: one short sentence, for REWRITE and SPLIT only; otherwise an empty string.
Return exactly one result per task, using the task's key. Notes from an automatic check are included where it found a problem; take them seriously.`;

interface CheckedTask {
  key: string;
  title: string;
  description: string | null;
  estimatedMin: number;
  ruleProblems: string[];
}

export const realityCheckUser = (goalTitle: string, tasks: CheckedTask[]) => `Goal: ${goalTitle}

Tasks to review:
${tasks
  .map(
    (t) =>
      `- key: ${t.key}\n  title: ${t.title}\n  minutes: ${t.estimatedMin}${t.description ? `\n  detail: ${t.description}` : ""}${t.ruleProblems.length ? `\n  automatic check: ${t.ruleProblems.join("; ")}` : ""}`,
  )
  .join("\n")}`;
