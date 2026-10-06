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
  fetch?: typeof fetch;
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

    let response: Response;
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
