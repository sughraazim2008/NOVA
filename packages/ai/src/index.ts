// @nova/ai — LLM client and structured-output pipelines. The only package that talks to a model.
// Nothing here touches the database: every function returns data for a person to review.
export type { LLMClient, LLMError, StructuredRequest } from "./llm-client";
export { FakeLLMClient } from "./adapters/fake";
export { OpenAICompatibleClient, parseJson, type OpenAICompatibleOptions } from "./adapters/openai-compatible";
export { createLLMClientFromEnv } from "./create-client";
export { generateValidated, type AICallLog, type AIDeps, type AIError } from "./structured";
export { parseGoal } from "./goal-parser";
export { decomposeGoal, type GoalToDecompose } from "./goal-decomposer";
export { generateTasks, type GenerateTasksInput } from "./task-generator";
export { applyRealityResults, realityCheck, ruleProblems, SESSION_LIMIT_MIN, type RealityResult } from "./task-reality-check";
export { budgetNote, findCycle, validateDraft } from "./draft";
export { decomposeGoalText, type DecomposeContext, type DecomposeError } from "./pipeline";
export { SAMPLE_NOTE, SAMPLE_SENTENCES, sampleDraft } from "./samples";
export { addDays, daysBetween } from "./dates";
