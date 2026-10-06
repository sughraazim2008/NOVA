import { createLLMClientFromEnv, type AICallLog, type AIDeps, type LLMClient } from "@nova/ai";

let override: LLMClient | null | undefined;

/** The configured model, or null when NOVA is running in sample mode. */
export function getLLM(): LLMClient | null {
  return override !== undefined ? override : createLLMClientFromEnv(process.env);
}

/** For tests: substitute a scripted model (or null for sample mode). Pass undefined to restore. */
export function setLLMForTests(llm: LLMClient | null | undefined): void {
  override = llm;
}

const log = (entry: AICallLog) => console.log(JSON.stringify({ level: "info", ...entry }));

export const aiDeps = (llm: LLMClient): AIDeps => ({ llm, log });
