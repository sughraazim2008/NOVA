# ADR-004 — LLM back end without a paid API key

Status: accepted in principle (2026-10-06); provider and model chosen at the start of Phase 4

## Context
The developer will not pay for an API key. The development Mac is an M1 with 8 GB of memory. The deployed app must still show real AI behaviour to visitors.

## Decision
All model access goes through the `LLMClient` interface with three adapters:

1. `fake` — fixtures, for every automated test.
2. `replay` — recorded real responses, for demos and as the deployed fallback.
3. `openai-compatible` — one `fetch`-based adapter for the common chat-completions format with JSON-schema output. Pointed at a hosted free tier (base URL plus free key) or at Ollama on the local machine (no key).

Default for real use is a hosted free tier; the local model is the offline option. The specific provider and model are chosen in Phase 4 by running a fixed set of goal sentences through each candidate (`pnpm ai:eval`) and comparing validation pass rate and task quality.

## Alternatives considered
- Paid API: best quality, ruled out by cost.
- Local model only: 8 GB limits it to the smallest models, with noticeably weaker output, and a local model cannot serve a deployed site.
- A provider SDK per provider: more dependencies and lock-in for no benefit.
- Bring-your-own-key for visitors: kept as a possible later setting.

## Consequences
- Output quality will be below paid models. Validation, retry, the Task Reality Check and user review exist to absorb that.
- Free tiers have rate limits and their terms change; the app must handle `UNAVAILABLE` gracefully and fall back to replay in demo mode.
- **Privacy:** some free tiers may use submitted text to improve their models. The UI says where goal text is sent; behaviour data is never sent.
- Fine-tuning a small open model later (Phase 14, part D) becomes possible because the local path exists.
