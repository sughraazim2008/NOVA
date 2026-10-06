import { err, ok, type Result } from "@nova/types";
import type { LLMClient, LLMError, StructuredRequest } from "../llm-client";

type Reply = unknown | { error: LLMError } | ((request: StructuredRequest<unknown>) => unknown);

const isError = (reply: unknown): reply is { error: LLMError } =>
  typeof reply === "object" && reply !== null && "error" in reply && Object.keys(reply).length === 1;

/**
 * A scripted model for tests. Queue the replies each task should give, in order; when a queue
 * has one reply left it keeps giving that one. Every request is recorded in `calls`.
 */
export class FakeLLMClient implements LLMClient {
  readonly name = "fake";
  readonly model = "fake";
  readonly calls: StructuredRequest<unknown>[] = [];
  private readonly queues = new Map<string, Reply[]>();

  /** Replies for one task. A function reply is called with the request and its result returned. */
  on(task: string, ...replies: Reply[]): this {
    this.queues.set(task, [...(this.queues.get(task) ?? []), ...replies]);
    return this;
  }

  callsFor(task: string) {
    return this.calls.filter((call) => call.task === task);
  }

  async generate<T>(request: StructuredRequest<T>): Promise<Result<unknown, LLMError>> {
    this.calls.push(request as StructuredRequest<unknown>);
    const queue = this.queues.get(request.task);
    if (!queue || queue.length === 0) {
      return err({ kind: "UNAVAILABLE", message: `FakeLLMClient has no reply queued for "${request.task}"` });
    }
    const reply = queue.length > 1 ? queue.shift() : queue[0];
    if (isError(reply)) return err(reply.error);
    return ok(typeof reply === "function" ? reply(request as StructuredRequest<unknown>) : reply);
  }
}
