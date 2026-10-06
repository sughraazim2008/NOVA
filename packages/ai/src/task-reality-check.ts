import { TaskTitleSchema, type DraftTask, type GoalDraft } from "@nova/types";
import { z } from "zod";
import { REALITY_CHECK_SYSTEM, REALITY_CHECK_VERSION, realityCheckUser } from "./prompts/task-reality-check";
import { generateValidated, type AIDeps } from "./structured";

/** Longest task NOVA treats as one sitting. Anything longer should be split. */
export const SESSION_LIMIT_MIN = 90;

/** Openers that name an area of work instead of an action. */
const VAGUE_OPENERS = [
  "work on", "look into", "think about", "improve", "get better at", "continue", "do some", "try to",
  "make progress", "focus on", "deal with", "figure out", "explore", "learn about", "be more", "sort out", "catch up on",
];

/**
 * Stage 1: rules that need no model. Returns the problems found with a task, in plain words.
 * Deliberately narrow: it should never flag a good task, even if that means missing some bad ones.
 */
export function ruleProblems(task: Pick<DraftTask, "title" | "estimatedMin">): string[] {
  const problems: string[] = [];
  const title = task.title.trim().toLowerCase();
  const words = title.split(/\s+/).filter(Boolean);

  const opener = VAGUE_OPENERS.find((phrase) => title === phrase || title.startsWith(`${phrase} `));
  if (opener) problems.push(`starts with "${opener}", which names an area of work, not an action`);
  if (words.length < 3) problems.push("too short to say what to do");
  if (task.estimatedMin > SESSION_LIMIT_MIN) problems.push(`${task.estimatedMin} minutes is longer than one sitting (${SESSION_LIMIT_MIN})`);
  return problems;
}

const score = z.number().int().min(1).max(5);

const ResultSchema = z.object({
  key: z.string(),
  specificity: score,
  actionability: score,
  canStartNow: score,
  fitsOneSession: score,
  verdict: z.enum(["PASS", "REWRITE", "SPLIT"]),
  reason: z.string().max(300),
  rewrittenTitle: TaskTitleSchema.nullable(),
  parts: z.array(z.object({ title: TaskTitleSchema, estimatedMin: z.number().int().min(5).max(SESSION_LIMIT_MIN) })).max(4).nullable(),
});
export type RealityResult = z.infer<typeof ResultSchema>;

const OutputSchema = z.object({ results: z.array(ResultSchema) });

const PASS_THRESHOLD = 3;
const BATCH_SIZE = 25;

/**
 * Applies model verdicts and rule findings to a draft. Pure: no model, no I/O.
 *
 * - PASS with no rule problem → left alone.
 * - PASS that a rule or a low score disagrees with → FLAGGED for the reviewer.
 * - REWRITE → title replaced, original kept for the before/after view.
 * - SPLIT → replaced by its parts, chained in order; anything that depended on the original
 *   now depends on the last part.
 * A task with no result is judged by the rules alone.
 */
export function applyRealityResults(tasks: DraftTask[], results: RealityResult[]): DraftTask[] {
  const byKey = new Map(results.map((result) => [result.key, result]));
  const taken = new Set(tasks.map((task) => task.key));
  const lastPartOf = new Map<string, string>();
  const output: DraftTask[] = [];

  for (const task of tasks) {
    const result = byKey.get(task.key);
    const problems = ruleProblems(task);

    if (result?.verdict === "SPLIT" && result.parts && result.parts.length >= 2) {
      let previous: string | null = null;
      for (const [index, part] of result.parts.entries()) {
        let key = `${task.key}-${String.fromCharCode(97 + index)}`.slice(0, 40);
        while (taken.has(key)) key = `${key.slice(0, 38)}-x`;
        taken.add(key);
        output.push({
          ...task,
          key,
          title: part.title,
          description: index === 0 ? task.description : null,
          estimatedMin: part.estimatedMin,
          dependsOn: previous ? [previous] : task.dependsOn,
          realityCheck: { verdict: "SPLIT", reason: result.reason, original: task.title },
        });
        previous = key;
      }
      if (previous) lastPartOf.set(task.key, previous);
      continue;
    }

    if (result?.verdict === "REWRITE" && result.rewrittenTitle && result.rewrittenTitle !== task.title) {
      output.push({
        ...task,
        title: result.rewrittenTitle,
        realityCheck: { verdict: "REWRITTEN", reason: result.reason, original: task.title },
      });
      continue;
    }

    const lowScore =
      result && Math.min(result.specificity, result.actionability, result.canStartNow, result.fitsOneSession) < PASS_THRESHOLD;
    const reason = problems[0] ?? (lowScore ? result.reason || "may be hard to start as written" : null);
    output.push({
      ...task,
      realityCheck: reason ? { verdict: "FLAGGED", reason: capitalise(reason), original: null } : { verdict: "PASS", reason: "", original: null },
    });
  }

  // Re-point prerequisites at the last part of any task that was split.
  return output.map((task) => ({
    ...task,
    dependsOn: [...new Set(task.dependsOn.map((key) => lastPartOf.get(key) ?? key))],
  }));
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Task Reality Check. Stage 1 runs the rules; stage 2 asks the model to score every task and
 * rewrite or split the weak ones. If the model cannot be used, the rules alone decide and
 * `degraded` is true so the reviewer can be told.
 */
export async function realityCheck(
  draft: Pick<GoalDraft, "goal" | "tasks">,
  deps: AIDeps,
): Promise<{ tasks: DraftTask[]; degraded: boolean }> {
  const results: RealityResult[] = [];
  let degraded = false;

  for (let start = 0; start < draft.tasks.length; start += BATCH_SIZE) {
    const batch = draft.tasks.slice(start, start + BATCH_SIZE);
    const keys = new Set(batch.map((task) => task.key));
    const reply = await generateValidated(
      {
        task: "task-reality-check",
        promptVersion: REALITY_CHECK_VERSION,
        system: REALITY_CHECK_SYSTEM,
        user: realityCheckUser(
          draft.goal.title,
          batch.map((task) => ({ ...task, ruleProblems: ruleProblems(task) })),
        ),
        schema: OutputSchema,
        semantic: ({ results: batchResults }) => {
          const issues: string[] = [];
          const seen = new Set<string>();
          for (const result of batchResults) {
            if (!keys.has(result.key)) issues.push(`"${result.key}" is not one of the task keys`);
            if (seen.has(result.key)) issues.push(`"${result.key}" has more than one result`);
            seen.add(result.key);
            if (result.verdict === "REWRITE" && !result.rewrittenTitle) issues.push(`"${result.key}" is REWRITE but has no rewrittenTitle`);
            if (result.verdict === "SPLIT" && (result.parts?.length ?? 0) < 2) issues.push(`"${result.key}" is SPLIT but has fewer than 2 parts`);
          }
          for (const key of keys) if (!seen.has(key)) issues.push(`no result for "${key}"`);
          return issues;
        },
      },
      deps,
    );
    if (reply.ok) results.push(...reply.value.results);
    else degraded = true;
  }

  return { tasks: applyRealityResults(draft.tasks, results), degraded };
}
