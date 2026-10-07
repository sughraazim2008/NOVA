import { err, ok, type Result } from "@nova/types";
import { z } from "zod";
import type { LLMClient, LLMError, StructuredRequest } from "../llm-client";

export interface OpenAICompatibleOptions {
  /** e.g. "http://localhost:11434/v1" for Ollama, or a hosted provider's compatible endpoint. */
  baseUrl: string;
  model: string;
  /** Not needed for a local model. */
  apiKey?: string;
  /**
   * "schema" sends the JSON schema and asks the provider to enforce it.
   * "object" only asks for JSON; use it for providers without schema support.
   */
  jsonMode?: "schema" | "object";
  timeoutMs?: number;
  /** How many times to wait and try again when the provider says "too many requests". Default 3. */
  rateLimitRetries?: number;
  /** Longest single wait for a rate limit to clear, in milliseconds. Default 30 seconds. */
  maxRateLimitWaitMs?: number;
  fetch?: typeof fetch;
  /** Injectable so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
}

/** How long the provider asked us to wait, from its Retry-After header (seconds), within sensible bounds. */
function retryDelayMs(response: Response, attempt: number, maxMs: number): number {
  const seconds = Number(response.headers.get("retry-after"));
  const asked = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 2000 * 2 ** attempt;
  return Math.min(maxMs, Math.ceil(asked) + 250);
}

const ResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable(), refusal: z.string().nullish() }) }))
    .min(1),
});

/**
 * Talks to any service that implements the widely copied chat-completions format: hosted
 * free tiers and local models alike. No provider SDK is involved, only fetch.
 */
export class OpenAICompatibleClient implements LLMClient {
  readonly name = "openai-compatible";
  readonly model: string;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.model = options.model;
  }

  async generate<T>(request: StructuredRequest<T>): Promise<Result<unknown, LLMError>> {
    const { baseUrl, apiKey, jsonMode = "schema", timeoutMs = 60_000 } = this.options;
    const jsonSchema = z.toJSONSchema(request.schema);
    const schemaText = JSON.stringify(jsonSchema);

    const body = {
      model: this.model,
      temperature: 0.2,
      messages: [
        // The schema is repeated in the prompt because some providers accept the parameter and ignore it.
        { role: "system", content: `${request.system}\n\nReply with one JSON object matching this JSON Schema, and nothing else:\n${schemaText}` },
        { role: "user", content: request.user },
      ],
      response_format:
        jsonMode === "schema"
          ? { type: "json_schema", json_schema: { name: request.task.replaceAll(/[^a-zA-Z0-9_-]/g, "_"), schema: jsonSchema } }
          : { type: "json_object" },
    };

    const { rateLimitRetries = 3, maxRateLimitWaitMs = 30_000 } = this.options;
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

    // Free tiers allow only so much per minute, and one decomposition is several calls in a row.
    // A "too many requests" answer is therefore expected: wait as long as the provider asks, then try again.
    let response: Response;
    for (let attempt = 0; ; attempt += 1) {
      try {
        response = await (this.options.fetch ?? fetch)(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        return err({ kind: "UNAVAILABLE", message: `Could not reach the model: ${cause instanceof Error ? cause.message : String(cause)}` });
      }
      if (response.status !== 429 || attempt >= rateLimitRetries) break;
      await sleep(retryDelayMs(response, attempt, maxRateLimitWaitMs));
    }

    if (!response.ok) {
      const reason = response.status === 429 ? "rate limit reached" : `HTTP ${response.status}`;
      return err({ kind: "UNAVAILABLE", message: `The model service answered with ${reason}` });
    }

    const parsed = ResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return err({ kind: "MALFORMED", message: "The model service sent an unexpected response" });

    const message = parsed.data.choices[0]?.message;
    if (message?.refusal) return err({ kind: "REFUSED", message: message.refusal });
    if (!message?.content) return err({ kind: "MALFORMED", message: "The model sent an empty reply" });

    return parseJson(message.content);
  }
}

/** Models sometimes wrap JSON in a code fence or a sentence; take the outermost object. */
export function parseJson(text: string): Result<unknown, LLMError> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return err({ kind: "MALFORMED", message: "The model did not reply with JSON" });
  try {
    return ok(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return err({ kind: "MALFORMED", message: "The model replied with invalid JSON" });
  }
}
