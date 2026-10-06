import { err, ok, type Result } from "@nova/types";
import type { LLMClient, LLMError, StructuredRequest } from "./llm-client";

export type AIError =
  | LLMError
  /** The model answered twice and neither answer was usable. */
  | { kind: "INVALID_OUTPUT"; issues: string[] };

/** One structured line per model call. Prompt and reply text are never logged. */
export interface AICallLog {
  event: "llm_call";
  task: string;
  promptVersion: string;
  adapter: string;
  model: string;
  attempts: number;
  latencyMs: number;
  outcome: "ok" | AIError["kind"];
}

export interface AIDeps {
  llm: LLMClient;
  log?: (entry: AICallLog) => void;
  /** Millisecond clock, injectable so tests do not depend on real time. */
  now?: () => number;
}

interface ValidatedRequest<T> extends StructuredRequest<T> {
  /** Checks a schema cannot express (references resolve, no cycles, dates in range). Return problems found. */
  semantic?: (value: T) => string[];
}

const MAX_ATTEMPTS = 2;

/**
 * Asks the model for structured output and refuses to return anything unverified.
 *
 * Attempt 1 → schema check → semantic check. On failure, attempt 2 repeats the request with the
 * problems listed so the model can correct itself. A second failure is INVALID_OUTPUT.
 * Unreachable or refusing models are reported as they are and not retried here.
 */
export async function generateValidated<T>(request: ValidatedRequest<T>, deps: AIDeps): Promise<Result<T, AIError>> {
  const now = deps.now ?? Date.now;
  const started = now();
  let issues: string[] = [];
  let attempts = 0;

  const finish = (outcome: AICallLog["outcome"]) =>
    deps.log?.({
      event: "llm_call",
      task: request.task,
      promptVersion: request.promptVersion,
      adapter: deps.llm.name,
      model: deps.llm.model,
      attempts,
      latencyMs: now() - started,
      outcome,
    });

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const user =
      issues.length === 0
        ? request.user
        : `${request.user}\n\nYour previous reply was rejected for these reasons:\n${issues.map((i) => `- ${i}`).join("\n")}\nReply again with all of them fixed.`;

    const reply = await deps.llm.generate({ ...request, user });
    if (!reply.ok) {
      if (reply.error.kind !== "MALFORMED") {
        finish(reply.error.kind);
        return reply;
      }
      issues = [reply.error.message];
      continue;
    }

    const parsed = request.schema.safeParse(reply.value);
    if (!parsed.success) {
      issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
      continue;
    }

    issues = request.semantic?.(parsed.data) ?? [];
    if (issues.length === 0) {
      finish("ok");
      return ok(parsed.data);
    }
  }

  finish("INVALID_OUTPUT");
  return err({ kind: "INVALID_OUTPUT", issues });
}
