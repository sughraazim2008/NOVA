# ADR-008 — Learning is staged and gated by a backtest

Status: accepted (2026-10-06)

## Context
The developer wants NOVA to learn each user's patterns, including with deep learning and a fine-tuned model. A single user produces a handful of task events per day.

## Decision
Four stages, each only adopted if it beats the one before on held-out history:

1. Smoothed statistics per category, size and hour (Phase 9).
2. A bandit that picks the response to each friction reason (Phase 14).
3. A simple completion predictor trained across users (Phase 14).
4. A deep sequence model — only with many users, and only if it beats stage 3.

Fine-tuning a small open model on logged corrections is a separate optional experiment for the Task Reality Check rewrite step. Fine-tuning does not personalise; personalisation comes from the execution model and from hints placed in prompts.

## Alternatives considered
- A neural network from the start: memorises noise at this data size and cannot explain its output.
- No learning beyond statistics: leaves the most interesting question (which intervention works for whom) unanswered.

## Consequences
- The data needed for every stage is logged from the core phases.
- Each model has a flag and a measured comparison in `docs/learning.md`; "it uses ML" is never claimed without a number.
