import type { Result } from "@nova/types";
import type { ZodType } from "zod";

export interface StructuredRequest<T> {
  /** Which pipeline step is asking, e.g. "goal-parser". Used for logs and test fixtures. */
  task: string;
  /** Version of the prompt text, e.g. "goal-parser@1". Bump it whenever the wording changes. */
  promptVersion: string;
  system: string;
  user: string;
  /** Shape the reply must have. Adapters pass it to the model where the provider supports that. */
  schema: ZodType<T>;
}

export type LLMError =
  /** Network failure, timeout, rate limit, or no provider configured. Worth retrying later. */
  | { kind: "UNAVAILABLE"; message: string }
  /** The model answered, but not with JSON. */
  | { kind: "MALFORMED"; message: string }
  | { kind: "REFUSED"; message: string };

/**
 * The single doorway to a language model.
 *
 * An adapter's job ends at "here is the JSON the model produced". Checking that JSON against
 * the schema, retrying and semantic validation all happen in generateValidated, so they behave
 * identically whichever model is behind the adapter.
 */
export interface LLMClient {
  readonly name: string;
  readonly model: string;
  generate<T>(request: StructuredRequest<T>): Promise<Result<unknown, LLMError>>;
}
