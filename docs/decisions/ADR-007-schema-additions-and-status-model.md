# ADR-007 — Schema additions and the task status model

Status: proposed

## Context
The specification lists about eleven entities, nine events, and treats "skipped" as both a state and an event. Designing the flows exposed three gaps.

## Decision
1. **Status versus daily outcome.** `Task.status` is long-lived: `TODO`, `IN_PROGRESS`, `DONE`, `DEFERRED`, `DROPPED`. `DailyTask.outcome` records one day: `PENDING`, `COMPLETED`, `PARTIAL`, `SKIPPED`, `POSTPONED`, `MISSED`.
2. **`StartSession` table.** Holds the generated micro-actions and progress of a NOVA START session.
3. **Two system events**, `DECOMPOSITION_CONFIRMED` and `REPLAN_APPLIED`, and two fields on `FrictionEvent` (`appliedAction`, `startedAfter`), so the learning layer has data from day one.
4. **`category`, `energyDemand`, `origin`, `parentTaskId`, `deferredUntil`** on `Task`.

## Alternatives considered
- Session state inside event payloads: awkward to read back, and events are meant to be facts, not working state.
- Separate tables for learning data: more tables for what is naturally an event.
- Free-text task categories: cannot be counted reliably.

## Consequences
- Twelve tables instead of eleven.
- Skipping a task today never changes what the task is, which keeps the planner's eligibility rule simple.
