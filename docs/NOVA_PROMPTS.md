# NOVA — Sequential Build Prompts

Use these in order. Each prompt maps to one phase in [NOVA_PLAN.md](NOVA_PLAN.md) §8. Do not start a prompt until the previous phase's exit gate has passed.

**How to use**

1. Start a fresh session in the coding tool for each prompt.
2. Paste the **Session header** (below), then the phase prompt.
3. Optional: run the phase prompt through the **ChatGPT expander** (end of this file) first to get a more detailed version.
4. When the phase is built, run the **Close-out** and **Understanding check** prompts.

Tool labels: **[CC]** = Claude Code, **[AG]** = Antigravity.

---

## Session header (paste before every phase prompt)

```
You are working on NOVA, an adaptive goal-execution system (not an AI todo list).

Before doing anything, read: CLAUDE.md, docs/NOVA_PLAN.md, docs/PROGRESS.md, and docs/architecture.md if it exists.

Hard rules:
- The LLM interprets and suggests; deterministic code decides. The LLM never writes to the DB and never chooses the schedule.
- All LLM output is Zod-validated before use.
- packages/planner, packages/behaviour and packages/simulation are pure functions: no Next.js, Prisma, LLM SDK, Date.now() or randomness. Dates are passed in.
- TypeScript strict. No new dependency without a one-line justification. Do not touch files outside this phase's scope.

Process for this session:
1. First reply with a short plan only: architecture, data flow, files you will create or change, algorithm (if any), tests, failure cases. Then stop and wait for my approval.
2. After approval, implement in small commits on the branch I name.
3. Finish by running the tests and type-check and showing me the output.
```

---

## Phase 0 — Project setup **[CC]**

Branch: `chore/setup`

```
Phase 0: project setup. No application code in this phase.

Create a pnpm-workspace monorepo named "nova" with exactly the folder structure in docs/NOVA_PLAN.md section 6. Create the folders with placeholder index files only.

Deliver:
- Root package.json, pnpm-workspace.yaml, tsconfig.base.json (strict), .gitignore, .env.example, LICENSE (MIT).
- apps/web: a bare Next.js App Router app with TypeScript and Tailwind that renders one placeholder home page.
- packages/types, database, ai, planner, behaviour, simulation: each with its own package.json, tsconfig extending the base, and an empty src/index.ts.
- Vitest configured at the root so `pnpm test` runs tests in every package and in /tests.
- Scripts: dev, build, test, typecheck, lint.
- docs/product-spec.md (I will paste the spec), docs/NOVA_PLAN.md, docs/PROGRESS.md with the phase checklist, docs/decisions/ (empty).
- CLAUDE.md at the root (I will paste it).
- README.md with the title "NOVA — Adaptive Goal Execution Engine", the two-paragraph description from the plan, and the core-loop diagram. Mark everything else as "in progress".

Done when: `pnpm install`, `pnpm typecheck`, `pnpm test` and `pnpm dev` all succeed on a clean clone.
```

## Phase 1 — Architecture **[CC]**

Branch: `docs/architecture`

```
Phase 1: architecture. Do NOT write application code. Output is documentation only.

Read docs/product-spec.md and docs/NOVA_PLAN.md fully, then:

1. List every ambiguity or contradiction you find in the spec, with a recommended resolution for each.
2. Propose the system architecture: packages, their responsibilities, and the allowed dependency direction.
3. Propose the database schema for the 11 entities in NOVA_PLAN.md section 7.1 (fields, types, relations, indexes, cascade rules).
4. Define the API boundaries: every route, its input schema, output schema, and which package it calls.
5. Define the core domain types.
6. Define the planning engine interface and write the v1 algorithm in full: eligibility, adjusted duration, the scoring formula with named weights, tie-breaking, capacity filling, and how the `reason` string is produced.
7. Define the AI/LLM interfaces: LLMClient, each AI function's input and output schema, retry and failure behaviour, and prompt versioning. Recommend a provider and model, and justify it.
8. Define the behaviour-event model: the 9 event types, payload shape for each, and when each is emitted.
9. Define the friction model: the 7 reasons and the system response to each.
10. Define the testing strategy: what is unit-tested, integration-tested, end-to-end-tested, and how the LLM is faked.
11. Confirm or adjust the implementation order in NOVA_PLAN.md section 8.
12. List risks and architectural trade-offs.

Write the results to:
- docs/architecture.md (items 1–5, 7–12, with a diagram)
- docs/planning-engine.md (item 6, with at least 8 worked examples as input → expected output tables, including: 120 min capacity with A=60, B=40, C=30 → A+B)
- docs/decisions/ADR-001…: one short ADR per significant choice (monorepo, Zod, auth, LLM provider, pure planner)

Done when: the documents exist and I have approved them. Ask me every question you need answered before I approve.
```

## Phase 2 — Database + domain model **[CC]**

Branch: `feature/domain-model`

```
Phase 2: database and domain model, exactly as approved in docs/architecture.md.

Build:
- prisma/schema.prisma with the 11 entities: User, Goal, Milestone, Task, TaskDependency, DailyPlan, DailyTask, BehaviourEvent, FrictionEvent, ExecutionEstimate, GoalProjection. Enums for goal status, task status, priority, task category, energy demand, behaviour event type (9 values), friction reason (7 values), goal health status.
- Constraints: foreign keys with explicit cascade rules, unique (userId, date) on DailyPlan, unique (taskId, dependsOnTaskId) on TaskDependency, no self-dependency, indexes on the columns the planner queries.
- First migration and a local Postgres setup (docker-compose.yml) documented in the README.
- packages/types: one Zod schema and inferred type per entity, plus the input schemas (CreateGoalInput, CreateTaskInput, …). These are the only types other packages import.
- packages/database: Prisma client singleton and typed query functions (goals, milestones, tasks, dependencies, plans, events). Nothing outside this package imports Prisma.
- A seed script that creates one user, the "software engineering internship by December" goal, 5 milestones and about 20 tasks with realistic dependencies.

Tests:
- Zod schemas accept valid input and reject invalid input (bad dates, negative durations, empty titles).
- Query functions against a test database: create/read/update/delete, cascade deletes, the unique constraints, and rejection of a dependency cycle at write time.

Done when: `pnpm prisma migrate dev`, `pnpm db:seed`, `pnpm test` and `pnpm typecheck` all pass.
```

## Phase 3a — Auth + goal API **[CC]**

Branch: `feature/goals`

```
Phase 3a: authentication and the goal-system API. No AI in this phase.

Build:
- Authentication with the approach chosen in the ADR. Every query is scoped to the signed-in user; add a single helper that returns the current user or throws.
- Route handlers under apps/web/app/api for goals, milestones, tasks and task dependencies: create, read, list, update, delete. Each handler is thin: parse with the Zod input schema → call packages/database → return a typed response. Consistent error shape for validation errors, not-found and unauthorised.
- Adding a dependency that would create a cycle is rejected with a clear error.
- Emit nothing to BehaviourEvent yet, but leave one clearly named hook function where TASK_CREATED will be recorded in Phase 8.

Tests: integration tests for each route: happy path, validation failure, access to another user's data is refused, cycle rejection.

Done when: I can drive the whole goal → milestone → task → dependency lifecycle with curl or the test suite.
```

## Phase 3b — Goal UI **[AG]**

```
Phase 3b: goal-system UI on top of the existing API. Only edit apps/web/app/**/page.tsx, apps/web/components/** and apps/web/styles/**. Do not change API routes or packages; if the API is missing something, tell me instead.

Build:
- Sign-in page and an app shell with navigation: Dashboard, Goals, Today.
- /goals: list of goals with deadline, priority and a progress bar.
- Create/edit goal form: title, description, deadline, priority, available minutes per day, optional constraints.
- Goal detail page: milestones in order, tasks under each, add/edit/delete, set dependencies between tasks, status changes.
- /dashboard: active goals with progress (completed task minutes ÷ total task minutes).
- Shared primitives in components/ui (button, input, card, dialog).

UX rules: calm, low-density, one primary action per screen, clear empty states.

Done when: a new user can sign in and build a goal with milestones, tasks and dependencies entirely through the UI, verified in the browser.
```

## Phase 4a — AI pipeline: parse + decompose **[CC]**

Branch: `feature/ai-decomposition`

```
Phase 4a: the AI structured-output pipeline in packages/ai. Nothing in this package touches the database.

Build:
- llm-client.ts: the LLMClient interface from docs/architecture.md, one real adapter for the chosen provider using its structured-output feature, and a FakeLLMClient for tests. Each call logs prompt version, latency, and validation pass/fail.
- goal-parser.ts: natural-language sentence → ParsedGoal { title, desiredOutcome, deadline, priority, constraints, availableMinutesPerDay, missingInformation[] }. Relative dates ("by December") are resolved against a `today` argument, not the system clock.
- goal-decomposer.ts: ParsedGoal → ordered milestones (3–7).
- task-generator.ts: milestone → tasks with title, description, estimatedMin, priority, category, energyDemand, deadline, and dependencies expressed as references to other generated tasks.
- Validation: every response is parsed with Zod. On failure, retry once with the validation error included; on second failure return a typed error. Also validate semantically: dependencies reference existing tasks, no cycles, durations within bounds, deadlines not after the goal deadline.
- Prompts live in versioned files, not inline strings.

Tests (all with FakeLLMClient): valid fixture passes; malformed JSON triggers one retry; second failure returns the typed error; dangling dependency rejected; cycle rejected; out-of-range duration rejected; relative date resolved correctly from an injected `today`.

Done when: a script `pnpm ai:demo "I want to get a software engineering internship by December"` prints a validated decomposition, and all tests pass without network access.
```

## Phase 4b — Task Reality Check + confirm-before-save **[CC] then [AG]**

```
Phase 4b: Task Reality Check and the review flow.

[CC] Build:
- packages/ai/task-reality-check.ts. Two stages:
  1. Deterministic checks (no LLM): duration within a single-session limit, title starts with a concrete verb, title is not on a vague-phrase list ("work on", "look into", "improve"…), dependencies resolvable.
  2. LLM check for tasks that pass stage 1: scores for specificity, actionability, can-start-immediately, completable-in-one-session, plus a rewritten task (or a split into several) when any score is below threshold.
  Output per task: PASS | REWRITTEN | SPLIT, with before/after and the reason. Example that must work: "Work on portfolio" → rejected as too vague → "Choose the 3 projects you want to showcase".
- API: POST /api/goals/decompose returns a draft (nothing saved). POST /api/goals/confirm takes the user-edited draft, validates it again, and saves goal + milestones + tasks + dependencies in one transaction.

[AG] Build:
- "Describe your goal" entry screen → loading state → review screen showing milestones and tasks, with Reality Check rewrites visibly marked (before → after). User can edit, delete or accept each item, then confirm.

Tests: stage-1 rules as unit tests; stage-2 with fake LLM fixtures; confirm endpoint rejects a tampered draft; transaction rolls back fully on error.

Done when: typing one sentence produces a reviewed, confirmed, saved goal with concrete tasks.
```

## Phase 5a — Planner: dependencies, capacity, priority **[CC]**

Branch: `feature/planning-engine`

```
Phase 5a: the first three modules of packages/planner. Pure functions only; implement exactly what docs/planning-engine.md specifies. Write the tests first.

Build:
- dependency-resolver.ts: build the graph; detectCycle; topologicalOrder; getUnblockedTasks(tasks, deps); countDownstream(taskId) (how many tasks this one unblocks).
- capacity.ts: capacityForDate(user, goals, date) → minutes; remainingCapacityUntil(deadline, today, dailyCapacity) → minutes.
- prioritiser.ts: scoreTask(task, context) → { score, terms } where terms is the per-factor breakdown (deadline pressure, priority, overdue, unblocks, goal risk placeholder = 0). Weights are named constants in weights.ts.

Tests (tests/planner):
- Resolver: linear chain, diamond, disconnected graph, cycle throws a typed error, task with a DONE dependency is unblocked, task with a SKIPPED dependency follows the documented rule.
- Capacity: zero capacity, deadline today, deadline in the past.
- Prioritiser: nearer deadline scores higher with everything else equal; higher priority scores higher; overdue beats not-overdue; a task that unblocks 5 beats one that unblocks 0; identical inputs give identical scores.

Done when: tests pass and the package has no imports outside packages/types.
```

## Phase 5b — Planner: scheduler + persistence **[CC]**

```
Phase 5b: the scheduler and its wiring.

Build:
- scheduler.ts: generateDailyPlan(input: PlannerInput): PlannerOutput as specified. Eligibility → adjusted duration (multiplier 1.0 for now, but read it from input.estimates so Phase 9 needs no signature change) → score → deterministic ordering with tie-breakers → capacity fill with maxTasks cap → reason string per task → excluded list with why.
- An application service (outside the pure package) that loads data, calls generateDailyPlan, and saves DailyPlan + DailyTask. Regenerating for the same date replaces the plan but keeps tasks already completed today.
- API: GET /api/plan/today (create if missing), POST /api/plan/today/regenerate.
- A structured log line per planner run.

Tests (tests/planner):
- Reference case: 120 min, A=60, B=40, C=30 (descending score) → A+B, C excluded for capacity.
- Blocked task is never scheduled even with the highest score.
- A lower-scored task that fits is taken after a higher-scored one that does not.
- maxTasks cap respected. Zero capacity → empty plan with reasons. No eligible tasks → empty plan.
- Determinism: shuffle the input array 50 times → identical output.
- Two goals competing for one day's capacity: the goal with higher deadline pressure gets its task first.
- Every worked example in docs/planning-engine.md is a test.

Done when: all tests pass and GET /api/plan/today returns a plan for the seeded user.
```

## Phase 6 — Today page **[AG] (+ small [CC] API work)**

Branch: `feature/today`

```
Phase 6: the Today page.

[CC] Add POST /api/tasks/:id/complete, /skip, /postpone. Each updates Task and DailyTask outcome and calls the (still empty) behaviour hook.

[AG] Build apps/web/app/today:
- Today's plan as a short ordered list: title, planned minutes, goal it belongs to, and the planner's reason (collapsed by default, one tap to reveal).
- The first unfinished task is visually primary with a large START button (it will link to /start/[taskId] in Phase 7).
- Complete / skip / postpone actions with optimistic updates.
- Capacity summary: "85 of 120 minutes planned".
- Empty states: no goals yet; nothing eligible today; all done.
- No overdue list anywhere on this page.

Done when: verified in the browser — the plan renders for the seeded user, actions persist across reload, and the page is usable at phone width.
```

## Phase 7a — NOVA START backend **[CC]**

Branch: `feature/nova-start`

```
Phase 7a: NOVA START backend.

Build:
- packages/ai/task-breaker.ts: (task, context, llm) → 3–7 micro-actions, each { instruction, estimatedMin (1–5), doneLabel }. The first action must be trivially easy and physical ("Open your dissertation document"). Context includes the goal, the milestone, and any earlier friction on this task. Zod-validated, retried once, with a deterministic fallback sequence if the LLM fails (open the material → find the section → write one rough sentence).
- A "stuck" variant: given the current step and an optional note, return a smaller or clearer replacement step.
- Start session state: startedAt, current step index, steps completed/skipped, stuck count, endedAt, outcome (COMPLETED | PARTIAL | ABANDONED). Store it without adding a new table if the approved schema allows (e.g. in event payloads); otherwise propose the schema change first.
- API: POST /api/start/:taskId (create session, return steps), POST /api/start/:sessionId/step { action: done | stuck | skip, note? }, POST /api/start/:sessionId/finish { outcome }. Finish records actual duration on the task.

Tests (tests/task-breakdown): fixture validation; first step ≤ 2 minutes; fallback used when the LLM fails twice; stuck returns a step shorter than the one it replaces; session state transitions; finishing computes actual duration from injected timestamps.

Done when: the full session can be driven through the API with the fake LLM.
```

## Phase 7b — NOVA START experience **[AG]**

```
Phase 7b: the NOVA START screen. This is the signature UX — spend real care here. UI files only.

Build apps/web/app/start/[taskId]:
- Full-screen, distraction-free. One micro-action at a time: "Step 1 — 2 min", the instruction in large type, one primary button with the step's doneLabel ("I'm there", "Done").
- Secondary, quiet actions: "I'm stuck" (optional one-line note → replacement step slides in) and "Skip".
- Subtle progress indicator; no visible countdown pressure.
- After the last generated step: "Keep going" (continue working, timer keeps running) or "Finish".
- Completion screen: time spent vs estimate, stated neutrally, then back to Today.
- Leaving mid-session asks one question: finish as partial, or abandon.

Done when: verified in the browser from Today → START → steps → stuck → finish → back to Today with the task marked complete.
```

### GATE A — Working Loop

```
Gate A review. Do not add features.

1. Starting from an empty database, walk the full loop and report each step's result: sign in → type a goal sentence → review decomposition → confirm → open Today → START the first task → complete it → Today updates.
2. List every bug, rough edge and missing error state you find, ordered by severity.
3. Fix the blocking ones only, each in its own commit, with a test where possible.
4. Update README (what works now) and docs/PROGRESS.md.
```

---

## Phase 8 — Behaviour tracking **[CC] (+ small [AG] UI)**

Branch: `feature/behaviour-model`

```
Phase 8: behaviour and friction tracking.

[CC] Build:
- packages/behaviour/events.ts: typed constructors and payload schemas for the 9 events: TASK_CREATED, TASK_STARTED, TASK_COMPLETED, TASK_SKIPPED, TASK_POSTPONED, TASK_ABANDONED, FRICTION_REPORTED, ESTIMATE_OVERRUN, ESTIMATE_UNDERRUN. Each payload carries the context needed later: estimatedMin, actualMin, task category, size bucket, local hour, day of week, postponement count, start count.
- Fill in the behaviour hooks left in Phases 3, 6 and 7 so every state change emits exactly one event, in the same transaction as the state change.
- ESTIMATE_OVERRUN / UNDERRUN emitted on completion when actual differs from estimate by more than a documented threshold.
- A nightly-safe, idempotent "end of day" function: tasks planned but untouched are marked missed; a task postponed 3+ times or started and left is marked abandoned (rules documented and unit-tested).
- packages/behaviour/friction.ts: the 7 reasons, shouldAskFriction(taskHistory) → boolean (true when not started by end of day, or postponed twice), and recording of a FrictionEvent linked to the task.
- API: POST /api/tasks/:id/friction { reason, note? }; GET /api/behaviour/summary (counts by event type, by category, est-vs-actual table).

[AG] Build: the "What's stopping you?" sheet with the 7 options, shown on skip, on postpone, and from "I'm stuck" in NOVA START. One tap, optional note, never blocks the user.

Tests: one event per transition, no duplicates on retry; overrun/underrun thresholds; missed vs postponed vs abandoned are distinguished; shouldAskFriction cases; end-of-day function is idempotent.

Done when: after using the app for a simulated week (seed script), /api/behaviour/summary shows believable, correct numbers.
```

## Phase 9a — Replanner + adaptive task collapse **[CC]**

Branch: `feature/replanning`

```
Phase 9a: adaptive replanning. Pure logic in packages/planner/replanner.ts; LLM help only through packages/ai, only for rewriting text.

Build:
- replan(input): for each missed, skipped or postponed task: (1) still relevant? (goal active, not superseded, deadline not made meaningless) (2) why was it missed — latest friction reason, or inferred from events if none (3) choose an action from the friction → response table in NOVA_PLAN.md section 7.4 (4) output a list of ReplanAction: SHRINK, SPLIT, REWRITE, RETIME, REPRIORITISE, DEFER, DROP_SUGGESTED — each with a reason. Never output "move to tomorrow" as a bare action.
- SHRINK follows 60 → 30 → 15 → 5-minute starter. SPLIT creates child tasks that sum to the parent. REWRITE and "don't know how to start" call packages/ai (friction-analyser.ts / task-breaker.ts) and validate the result.
- An application service that applies ReplanActions to the task graph in one transaction and then regenerates the plan. Actions that delete or drop work are suggestions the user confirms.
- Adaptive task collapse: POST /api/start/:sessionId/blocker { description } → AI proposes a blocker sub-graph (e.g. Update CV → find latest experience → add project → update skills → export PDF) → validated → inserted as tasks the original depends on → original task returns to the plan when they are done.
- The Today page shows a short "what changed and why" note after a replan ([AG] for the UI).

Tests (tests/replanning): one test per friction reason proving a different action; a task missed 3 times does not simply reappear unchanged; split children sum to the parent and inherit dependencies correctly; blocker sub-graph blocks then unblocks the original; irrelevant task is suggested for drop, not rescheduled; replan is deterministic.

Done when: marking a 60-minute task "too overwhelming" produces a visibly smaller task in the next plan, with the reason shown.
```

## Phase 9b — Patterns + personal execution model into the planner **[CC]**

```
Phase 9b: make the planner learn.

Build:
- packages/behaviour/patterns.ts: from the event stream compute, per user: completion rate and mean actual÷estimated ratio by task category, by size bucket (<20, 20–60, >60 min), and by hour band. Minimum sample size before a pattern counts; documented.
- packages/behaviour/execution-model.ts: turn patterns into ExecutionEstimate rows: duration multiplier per category (clamped, e.g. 0.7–2.0, smoothed toward 1.0 at low sample sizes), preferred maximum task size, low-completion hour bands, most common friction reasons.
- Recompute after each completed task or once per day; persist.
- Planner integration: adjusted duration uses the category multiplier; tasks larger than the user's preferred maximum are flagged for SPLIT before scheduling; high-energy tasks get a score penalty when the available time falls in a low-completion band. Reasons mention the adjustment ("Planned 47 min: your maths tasks usually take 1.35× the estimate").
- If a category is repeatedly postponed, future generated tasks in that category are requested smaller and more concrete (pass this as context to task-generator).

Tests: ratios computed correctly from a fixture event stream; multiplier clamps and smoothing; below-minimum sample leaves the multiplier at 1.0; planner output changes when estimates are supplied and is unchanged when they are empty; determinism.

Done when: the seeded simulated history yields different multipliers per category and the Today plan reflects them.
```

### GATE B — MVP

```
Gate B review. Do not add features.

Script the flagship demo as a repeatable seed + walkthrough (docs/demo.md):
1. Create the goal. Show the generated plan.
2. Deliberately fail three tasks with three different friction reasons.
3. Show the behavioural data collected.
4. Show the rebuilt plan and, for each change, the reason.

Then: list defects by severity, fix blockers with tests, check every item of the 13-point MVP list in docs/product-spec.md and report pass/fail for each, update README and docs/PROGRESS.md.
```

---

## Phase 10 — Goal health **[CC] (+ [AG] dashboard)**

Branch: `feature/goal-health`

```
Phase 10: goal health and projection. Pure functions in packages/simulation/projections.ts and packages/planner/goal-risk.ts.

Build:
- projectGoal(goal, tasks, deps, estimates, capacity, today) → { projectedDate, requiredMinPerDay, remainingMin (adjusted by multipliers), criticalPathMin, status, explanation }.
  - Remaining work uses personal multipliers. Daily throughput uses historical minutes actually completed per day, not stated capacity, once enough history exists.
  - The dependency critical path sets a lower bound on the finish date.
  - Status: ON_TRACK / AT_RISK / OFF_TRACK from the margin between projected date and deadline (thresholds documented).
  - explanation is specific: "At your recent pace of 48 min/day, 31 hours of work remain; the deadline needs 74 min/day."
- Persist a GoalProjection after each replan; keep history so the trend can be shown.
- Feed goal risk into the prioritiser (replace the placeholder term from Phase 5a).
- API: GET /api/goals/:id/health.

[AG] Dashboard: per goal — status, projected date vs deadline, the explanation sentence, small trend indicator. No alarmist styling.

Tests (tests/goal-risk): on-track, at-risk and off-track fixtures; critical path longer than naive division; zero history falls back to stated capacity; completed goal; deadline already passed; risk term changes planner ordering between two goals.

Done when: the seeded goal shows a projection and explanation that you can verify by hand.
```

## Phase 11a — Rescue Mode **[CC] + [AG]**

Branch: `feature/rescue-mode`

```
Phase 11a: Rescue Mode.

[CC] Build packages/simulation/rescue.ts (pure):
- needsRescue(lastActivityAt, today, thresholdDays = 3).
- triage(outstandingTasks, goals, projections, capacity, today) → each task classified KEEP / DELETE / DEFER / TODAY with a reason. Rules: TODAY = at most 3 small, unblocked, highest-value tasks; DELETE = tasks of archived goals, superseded tasks, tasks whose purpose has passed; DEFER = low deadline pressure or blocked; KEEP = the rest. Documented and deterministic.
- API: GET /api/rescue (proposal only), POST /api/rescue/apply (user-confirmed, possibly edited, applied in one transaction, then regenerate the plan). DELETE is always a soft status change.

[AG] Build the Rescue screen under /review: "You're back. Let's figure out what still matters." Show counts (active goals, outstanding tasks), then the four groups with the ability to move items between groups, then one button to accept. It replaces Today on first visit after inactivity. Never show the phrase "overdue".

Tests (tests/simulation): threshold boundary; TODAY never exceeds 3 or capacity; blocked tasks never land in TODAY; archived-goal tasks go to DELETE; applying twice is idempotent.

Done when: with a seed of 27 outstanding tasks and 5 days of inactivity, the flow ends in a 3-task recovery plan.
```

## Phase 11b — What-if simulator + scope reduction **[CC] + [AG]**

Branch: `feature/goal-simulation`

```
Phase 11b: what-if simulation and scope reduction. Pure functions; they reuse projectGoal and never write to the database.

[CC] Build:
- packages/simulation/what-if.ts: simulate(goalState, scenario) where scenario is one of: SKIP_DAYS(n), CHANGE_CAPACITY(minutesPerDay), REMOVE_TASKS(ids), REMOVE_MILESTONE(id), MOVE_DEADLINE(date). Returns baseline and scenario projections side by side: projected date, required min/day, the difference in each, status.
- packages/simulation/scope-reduction.ts: when a goal is AT_RISK or OFF_TRACK, generate up to 3 candidate reductions that bring it back on track, preferring to cut lowest-priority work with the fewest dependants; each candidate lists exactly what is cut and the resulting projection. It compares options; it never applies one automatically.
- API: POST /api/goals/:id/simulate, GET /api/goals/:id/scope-options, POST /api/goals/:id/scope-options/apply (user-chosen).
- Optional natural-language entry: packages/ai maps "what if I don't work on this for 7 days?" to a validated scenario object; the simulation itself stays deterministic.

[AG] Build under /review: scenario picker, a before/after comparison (e.g. Current: Oct 29 → Skip 7 days: Nov 8, +42 min/day), and the scope alternatives as selectable cards.

Tests (tests/simulation): SKIP_DAYS shifts the projection by the expected amount and raises required min/day; removing tasks on the critical path shortens it, off it does not; candidates never cut a task something kept depends on; simulate does not mutate its input; determinism.

Done when: the PDF's example reproduces in shape — skipping 7 days pushes the date out, and a reduced-scope alternative pulls it back.
```

## Phase 12 — Polish, testing, deployment **[CC] + [AG]**

Branch: `chore/release`

```
Phase 12: hardening and release. No new features.

[CC]
- One Playwright end-to-end test of the whole loop with the fake LLM: goal sentence → confirm → Today → START → complete → fail a task with friction → replan → changed plan.
- Coverage report for packages/planner, behaviour and simulation; fill meaningful gaps.
- Error handling pass: LLM down, validation failure, empty plan, DB error — each has a defined user-visible outcome.
- Observability: structured logs for LLM calls and planner runs; a simple /api/health.
- Security pass: every route is user-scoped, inputs validated, secrets only in env, rate limit on AI routes.
- CI: typecheck, lint, test on every push.
- Deploy (web + managed Postgres), production env documented in .env.example.
- README final: the "Adaptive Goal Execution Engine" opening, the architecture diagram, the LLM/planner separation explained, how the planner scores tasks, how to run locally, the demo script, screenshots. docs/architecture.md and docs/planning-engine.md brought up to date.

[AG]
- Visual consistency pass, loading and error states, keyboard navigation, phone layout, accessibility basics (labels, contrast, focus).
- Browser test of every flow; file issues instead of changing backend code.

Done when: CI is green, the deployed URL runs the full demo, and docs/PROGRESS.md is fully ticked.
```

---

## Extension phases (after Gate B; see NOVA_PLAN.md §5)

Each of these uses the same session header, close-out and understanding check as the core phases.

### Phase 13 — Installable web app (PWA) **[AG] + [CC]**

Branch: `feature/pwa`

```
Phase 13: make NOVA installable on a phone. No native code.

[CC] Web app manifest, icons, a service worker that caches the app shell and the last fetched Today plan (read-only offline; actions queue and sync when back online, with conflicts resolved server-side by timestamp). Web push: subscription storage, a send function behind the notification channel interface, one notification type ("Your plan for today is ready"). Justify any service-worker library before adding it.

[AG] Every screen usable at 360px width with thumb-reachable primary actions; an "Install NOVA" prompt; an offline banner; NOVA START full-screen in standalone mode.

Tests: queued offline actions replay exactly once; a stale offline action never overwrites a newer server state.

Done when: installed on a real phone from the deployed URL, Today opens with the network off, and a push notification arrives.
```

### Phase 14 — Learning layer **[CC]**

Branch: `feature/learning`

```
Phase 14: learned models that feed the planner as inputs. The planner stays deterministic given those inputs. Nothing is switched on unless it beats the Phase 9 statistics on held-out data.

Part A — backtest harness (build first). Replay the logged event stream day by day; at each point, predict from past data only; score against what actually happened. Metrics: duration error (mean absolute error in minutes), start/completion prediction (log loss and calibration), intervention success rate. Baseline = Phase 9 multipliers and completion rates.

Part B — intervention bandit. For each friction reason, choose among the allowed responses (shrink, split, rewrite, retime, micro-actions) with Thompson sampling over "task was started within 24 hours of the intervention". Per-user counts with a shared prior. Seeded random source injected, so runs are reproducible. Lives in packages/behaviour; the replanner receives the chosen action as input.

Part C — completion predictor. Logistic regression (then gradient-boosted trees if it helps) predicting P(task started today) from: category, adjusted minutes, hour band, day of week, postponement count, days to deadline, recent streak. Trained across users, with a per-user offset. Output enters the prioritiser as one more named, weighted term and appears in the reason string.

Part D — optional local fine-tune. Export logged pairs (AI-proposed task → user-confirmed task) as a training file; document a LoRA fine-tune of a small open model for the Task Reality Check rewrite step; compare against the un-tuned model on a held-out set. Ship only if better.

A deep sequence model is explicitly deferred until Part C plateaus and there is data from many users.

Tests: no future data leaks into any prediction (unit-tested on the harness); bandit converges on a simulated user with a known best action; predictor is calibrated on synthetic data; planner output is identical when the learned terms are disabled.

Done when: docs/learning.md reports baseline vs each model on the backtest, and each model is enabled or disabled by a flag accordingly.
```

### Phase 15 — Calendar **[CC]**

Branch: `feature/calendar`

```
Phase 15: calendar-aware capacity.

Build: a CapacitySource that reads busy intervals from a calendar (start with read-only free/busy; request the narrowest permission available) and subtracts them from the day's working window to give capacity minutes. Tokens encrypted at rest; disconnect deletes them. A private, revocable calendar-feed URL (ICS) exposing today's plan. The pure capacity function takes busy intervals as plain data; fetching lives outside the pure package.

Tests: overlapping and all-day events; events crossing midnight; timezone and daylight-saving boundaries; calendar unreachable falls back to stated capacity and says so in the plan.

Done when: adding a two-hour event to the calendar shrinks tomorrow's plan, with the reason shown.
```

### Phase 16 — Notifications, email and background replanning **[CC]**

Branch: `feature/notifications`

```
Phase 16: NOVA reaches out, and prepares work in the background, but never acts without confirmation.

Build: a NotificationChannel interface with push (from Phase 13) and email implementations; user preferences per channel and quiet hours. Emails: daily plan, and a "you're back" message after inactivity that links to Rescue Mode (no guilt wording, no task counts). A scheduled nightly job per user: run end-of-day, run the replanner, compute projections, and store the result as a PROPOSAL the user accepts, edits or dismisses on next open. The job is idempotent and never deletes or drops work on its own. Outgoing email only; never read the user's inbox.

Tests: job run twice produces one proposal; quiet hours respected; unsubscribe honoured; a dismissed proposal changes nothing.

Done when: a simulated missed day produces one email and one pending proposal the next morning.
```

### Phase 17 — Voice **[AG]**

Branch: `feature/voice`

```
Phase 17: voice as an input and output option, using the browser's built-in speech recognition and speech synthesis only. No new service, no audio stored.

Build: a microphone button on the goal entry field and the friction note; transcribed text lands in the same field and goes through the same validation as typed text. In NOVA START, an optional "read steps aloud" toggle and voice commands "done", "stuck", "skip". Graceful fallback where the browser lacks support.

Done when: verified in the browser — a goal can be created and a NOVA START session completed without typing.
```

### Phase 18 — Share link **[CC] + [AG]**

Branch: `feature/share`

```
Phase 18: accountability sharing, read-only.

Build: per-goal share link with an unguessable token, revocable, optional expiry. The public page shows goal title, progress, health status and projected date only: no task text unless the owner opts in, no behaviour or friction data ever. Rate-limited, not indexed by search engines.

Tests: revoked and expired links return not-found; the public response never contains private fields (assert on the full response shape); another user's goal cannot be shared.

Done when: a link opened in a private window shows progress, and stops working when revoked.
```

### Phase 19 — Native mobile app **[CC] + [AG]**

Branch: `feature/mobile`

```
Phase 19: native app, only after the PWA has shown what a native app must add.

First write docs/decisions/ADR-mobile.md: what the PWA cannot do that justifies this, and the framework choice (React Native with Expo is the default because it reuses TypeScript and the @nova/types, planner, behaviour and simulation packages unchanged).

Build apps/mobile: sign-in against the existing API with the token flow, Today, NOVA START, friction sheet, Rescue Mode, native notifications. No business logic in the app: it calls the API and may run the pure packages for instant previews.

Done when: the Gate A loop runs end to end on a phone simulator against the deployed API.
```

---

## Reusable prompts

### Close-out (run at the end of every phase)

```
Phase close-out. Do not add features.
1. Run typecheck, lint and all tests; show the output. Fix failures.
2. Compare what was built against this phase's "Done when" and its requirement IDs in docs/NOVA_PLAN.md section 3. Report each as met / partly met / not met.
3. List anything you added that was not asked for, and any dependency you introduced with its justification.
4. Check the purity rule: show the import list of packages/planner, behaviour and simulation.
5. Update docs/PROGRESS.md and any docs this phase made stale. Add an ADR if a significant decision was made.
6. Propose the commit message(s). Do not merge.
```

### Understanding check (run before merging every phase)

```
I need to be able to defend this phase in an interview. Without changing any code:
1. Explain what was built in this phase in plain language, in under 300 words.
2. Trace one concrete example through the code, naming each file and function it passes through.
3. Explain the two most important design decisions and what the alternatives were.
4. Ask me 5 questions that test whether I understand it, one at a time, and tell me whether each answer is right.
```

### Bug fix

```
Bug: <what happened> / Expected: <what should happen> / Steps: <how to reproduce>.
First write a failing test that reproduces it. Then find the root cause and explain it before changing anything. Fix only the cause, keep the diff minimal, and show the test passing.
```

### ChatGPT expander (turn any phase prompt above into a longer, more detailed one)

```
You are helping me write an implementation prompt for an AI coding tool. I am building NOVA, an adaptive goal-execution system. I will paste (1) my master plan and (2) one phase prompt.

Rewrite the phase prompt into a more detailed version that:
- keeps every requirement and constraint in the original, and adds none that contradict the master plan;
- stays strictly inside this phase's scope — nothing from later phases;
- names exact file paths from the project structure in the plan;
- specifies function signatures and input/output types where the original only names them;
- lists test cases as concrete input → expected output pairs;
- lists edge cases and failure cases the implementation must handle;
- ends with a checklist of acceptance criteria.

Keep these rules verbatim in the output: the LLM never writes to the database or decides the schedule; all LLM output is schema-validated; planner, behaviour and simulation packages are pure and deterministic; the tool must present its plan and wait for my approval before writing code.

If anything in the phase prompt is ambiguous, list your questions first instead of guessing.

MASTER PLAN:
<paste NOVA_PLAN.md>

PHASE PROMPT:
<paste one phase prompt>
```
