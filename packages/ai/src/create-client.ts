import { OpenAICompatibleClient } from "./adapters/openai-compatible";
import type { LLMClient } from "./llm-client";

type Env = Record<string, string | undefined>;

/**
 * Builds the model client from configuration, or returns null when no model is configured.
 *
 *   LLM_PROVIDER=openai-compatible
 *   LLM_BASE_URL=…   e.g. http://localhost:11434/v1 for Ollama, or a hosted provider's compatible endpoint
 *   LLM_MODEL=…
 *   LLM_API_KEY=…    optional; not needed for a local model
 *   LLM_JSON_MODE=schema | object   optional; "object" for providers without JSON-schema support
 */
export function createLLMClientFromEnv(env: Env): LLMClient | null {
  if (env.LLM_PROVIDER !== "openai-compatible") return null;
  if (!env.LLM_BASE_URL || !env.LLM_MODEL) return null;
  return new OpenAICompatibleClient({
    baseUrl: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    ...(env.LLM_API_KEY ? { apiKey: env.LLM_API_KEY } : {}),
    jsonMode: env.LLM_JSON_MODE === "object" ? "object" : "schema",
  });
}
