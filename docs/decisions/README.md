# Architecture decision records

One short file per significant decision, named `ADR-NNN-short-title.md`.

Each record has four parts: **Context** (what forced a choice), **Decision**, **Alternatives considered**, **Consequences**.

| ADR | Decision | Status |
|---|---|---|
| [001](ADR-001-monorepo-with-pure-packages.md) | pnpm monorepo with pure logic packages | accepted |
| [002](ADR-002-llm-proposes-software-decides.md) | The LLM proposes, deterministic code decides | accepted |
| [003](ADR-003-zod-as-single-source-of-types.md) | Zod schemas as the single source of types | accepted |
| [004](ADR-004-llm-backend-without-paid-key.md) | LLM back end without a paid API key | accepted in principle |
| [005](ADR-005-authentication.md) | Auth.js with signed-token sessions | accepted |
| [006](ADR-006-postgresql-without-docker.md) | PostgreSQL installed natively, not in Docker | accepted |
| [007](ADR-007-schema-additions-and-status-model.md) | Schema additions and the task status model | accepted |
| [008](ADR-008-staged-learning.md) | Learning is staged and gated by a backtest | accepted |
| [009](ADR-009-game-layer-derived-from-events.md) | Game layer derived from events, never an input to the planner | accepted |
