# ADR-002 — The LLM proposes, deterministic code decides

Status: accepted (2026-10-06)

## Context
An application that asks a model "what should I do today?" cannot be tested, cannot explain itself, and gives different answers to the same question.

## Decision
The LLM is limited to language work: parsing a goal, proposing milestones and tasks, rewriting unclear tasks, generating micro-actions. Its output is schema-validated, semantically checked, and confirmed by the user before it is saved. Scheduling, replanning, projection and simulation are deterministic functions. The LLM never writes to the database and never selects or orders tasks.

Learned models (Phase 14) follow the same rule: they supply predictions as inputs; the planner decides.

## Alternatives considered
- LLM produces the schedule, code validates it: still non-deterministic and unexplainable.
- No LLM at all: loses natural-language goal entry and dynamic task breakdown, which are central to the product.

## Consequences
- Every plan can be reproduced and explained from its inputs.
- The planner must be written and tested by hand; it is the largest piece of original work in the project.
- AI failure degrades features (no decomposition) but never corrupts state.
