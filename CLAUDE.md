# NOVA Development Rules

## Product

NOVA is an adaptive goal-execution system.

Its core loop is:

Goal → Decomposition → Planning → Initiation → User behaviour → Friction detection → Replanning

NOVA is not a generic AI todo list. It optimises the survival of the user's goals under real-world behaviour, not the task list.

## Architecture

Use Next.js + TypeScript. Use PostgreSQL (via Prisma) for persistence.

Separate AI reasoning from deterministic application logic.

Package dependency direction: `apps/web → ai, planner, behaviour, simulation, database → types`.
`packages/planner`, `packages/behaviour` and `packages/simulation` are pure: no Next.js, Prisma, LLM SDK, clock or randomness. Dates are passed in.

## AI

The LLM may:
- interpret natural language
- decompose goals
- generate structured tasks
- analyse reported friction
- generate micro-actions

The LLM must NOT:
- directly modify database state
- directly determine final schedules
- bypass validation
- make deterministic planning decisions

All LLM output must be schema validated (Zod). AI-generated goals and tasks are confirmed by the user before saving.

## Planning

Planning decisions must be deterministic and testable. Consider:
- deadlines
- dependencies
- task duration
- available capacity
- priority
- historical execution data

Every selected task carries a human-readable reason.

## Behaviour

Record meaningful execution events. Distinguish:
- task failure
- task postponement
- task abandonment
- reported friction

## UX

Minimise cognitive load. Do not overwhelm the user with information.
Today's plan should prioritise a small number of meaningful actions.
NOVA START should always make the next action obvious.
Never show a wall of overdue tasks.

## Engineering

Use TypeScript strict mode.
Prefer small reusable functions.
Write tests for planning logic.
Do not introduce dependencies without justification.
Do not make large architectural changes without explaining them.
Do not rewrite unrelated files.

Before implementing a major feature, explain:
1. Architecture
2. Data flow
3. Files affected
4. Algorithm
5. Tests required
6. Potential failure cases

Then wait for approval.

## Workflow

One feature branch per phase; never commit AI-generated changes straight to `main`.
Build order and exit gates: `docs/NOVA_PLAN.md`. Current status: `docs/PROGRESS.md`.
Frontend files (`apps/web/app/**/page.tsx`, `apps/web/components/**`, `apps/web/styles/**`) are owned by the UI tool; everything else by Claude Code. Do not cross that line without being asked.

## Out of scope

Calendar/email integrations, mobile app, voice, social, teams, autonomous agents, complex ML.
