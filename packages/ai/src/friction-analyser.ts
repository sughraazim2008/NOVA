import { TaskTitleSchema, type Result } from "@nova/types";
import { z } from "zod";
import { TASK_REWRITER_SYSTEM, TASK_REWRITER_VERSION, taskRewriterUser } from "./prompts/friction-analyser";
import { generateValidated, type AIDeps, type AIError } from "./structured";

const RewriteSchema = z.object({ title: TaskTitleSchema, description: z.string().trim().min(1).max(600) });
export type TaskRewrite = z.infer<typeof RewriteSchema>;

export interface RewriteTaskInput {
  goalTitle: string;
  task: { title: string; description: string | null; estimatedMin: number };
  note?: string | null;
}

/** A clearer version of a task the user said they did not understand. A proposal: the caller decides what to save. */
export function rewriteTask(input: RewriteTaskInput, deps: AIDeps): Promise<Result<TaskRewrite, AIError>> {
  return generateValidated(
    {
      task: "task-rewriter",
      promptVersion: TASK_REWRITER_VERSION,
      system: TASK_REWRITER_SYSTEM,
      user: taskRewriterUser({ goalTitle: input.goalTitle, ...input.task, note: input.note?.trim() || null }),
      schema: RewriteSchema,
      semantic: (rewrite) => (rewrite.title.trim().toLowerCase() === input.task.title.trim().toLowerCase() ? ["the title must change; it is the part they found unclear"] : []),
    },
    deps,
  );
}
