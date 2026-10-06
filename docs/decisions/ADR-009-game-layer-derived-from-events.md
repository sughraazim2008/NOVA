# ADR-009 — Game layer derived from events, never an input to the planner

Status: accepted (2026-10-06)

## Context
The developer wants game-like features so that people with ADHD actually open and use NOVA. Conventional gamification (streaks, daily targets, leaderboards) punishes exactly the lapses NOVA is built to recover from, and points can distort what people choose to do.

## Decision
A layer called Momentum, specified in `docs/game-layer.md`. Its state (sparks, level, momentum, badges, boss bars) is computed by pure functions from the behaviour event history. Nothing is stored but a user preference. Rewards favour starting over finishing, nothing is ever lost, there is no comparison between users, and the planner neither imports nor receives any of it.

## Alternatives considered
- Stored counters updated on each action: simpler reads, but rule changes need data migrations and counters drift from history.
- Classic streaks: strong for some users, harmful after the first break for this audience.
- Letting points influence the plan: turns the planner into a game to be gamed.

## Consequences
- No schema cost beyond one field; rules can be retuned and recomputed.
- Recomputing from history costs time as events grow; a cache can be added without changing the model.
- Its value must be shown by measurement (app opens, time to first step, tasks started), or it is simplified.
