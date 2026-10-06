# NOVA — Architecture

Status: **proposed in Phase 1, awaiting approval.** No application code exists yet. Decisions are recorded individually in [decisions/](decisions/). The planner's algorithm is in [planning-engine.md](planning-engine.md).

Questions that need the developer's answer before approval are collected in §13.

---

## 1. Ambiguities in the specification and how they are resolved

| # | Ambiguity | Resolution |
|---|---|---|
| 1 | Three different phase numberings | The 13-step pipeline, Phases 0–12, plus extension Phases 13–19 |
| 2 | 6 friction reasons in one place, 7 in another | 7 (includes "Not enough time") |
| 3 | 7 behaviour events in one place, 9 in another | 9 execution events, plus 2 system events (§8) |
| 4 | Schema shown in both `packages/database/schema.ts` and `prisma/schema.prisma` | Prisma schema at `prisma/schema.prisma`; `packages/database` exports the client and queries only |
| 5 | "Available time" appears on the goal, and capacity is also a property of the day | The user has a daily budget; each goal has an intended daily amount. Day capacity = the smaller of the user's budget and the sum over active goals ([planning-engine.md §3](planning-engine.md)) |
| 6 | "Skipped" is listed as a task state and as an event | A task's **status** is long-lived (`TODO`, `IN_PROGRESS`, `DONE`, `DEFERRED`, `DROPPED`). What happened to it **on a given day** is the daily outcome (`PENDING`, `COMPLETED`, `PARTIAL`, `SKIPPED`, `POSTPONED`, `MISSED`). Skipping today does not change what the task is |
| 7 | "Missed", "postponed" and "abandoned" are not defined | **Postponed**: the user chose to move it. **Skipped**: the user chose not to do it today, no new date. **Missed**: planned, untouched, day ended. **Abandoned**: started and left unfinished at day end, or postponed 3 or more times |
| 8 | No response defined for "Distracted" and "I don't want to do it" | Distracted → shorter session, restart from a 2-minute step. Don't want to → relevance check (keep / defer / drop), smallest possible start if kept |
| 9 | Where NOVA START session state is stored | A twelfth table, `StartSession` (§4). The original eleven had nowhere to hold the generated steps |
| 10 | "Historical behaviour" is an input to the planner from the start, but no history exists until Phase 8 | The planner input has the field from Phase 5; it is empty until Phase 9 fills it |
| 11 | "Goal progress" is in the MVP list, "goal health" is not | Progress (share of task minutes done) ships in Phase 3. Health (projection and risk) is Phase 10 |
| 12 | Plan shown as clock times (18:00–18:35) in one example, as a list elsewhere | v1 produces an ordered list with minutes. Clock placement comes with the execution model and calendar |
| 13 | "LLM API" with no provider, and no budget for one | No paid key. One client interface, free and local back ends (§7, ADR-004) |
| 14 | Mobile app, calendar, email, voice, social, agents and ML are excluded by the PDF but wanted by the developer | Included as Phases 13–19 after the core loop works; team collaboration and multi-agent setups stay out (NOVA_PLAN §5) |

---

## 2. System overview

```
                         ┌────────────────────────────────────────────────┐
   Browser / PWA  ─────► │ apps/web                                       │
   (later: native app)   │   app/**/page.tsx, components/   UI            │
                         │   app/api/**                     route handlers│
                         │   server/services/**             orchestration │
                         └───────┬───────────┬───────────┬───────────┬────┘
                                 │           │           │           │
                                 ▼           ▼           ▼           ▼
                          packages/ai   packages/    packages/    packages/
                          (LLM, I/O)    planner      behaviour    simulation
                                 │      (pure)       (pure)       (pure)
                                 │           │           │           │
                                 │           └─────┬─────┴───────────┘
                                 ▼                 ▼
                          LLM back end       packages/types  ◄──── packages/database ──► PostgreSQL
                          (free / local)     (schemas, no logic)        (Prisma)
```

### Packages

| Package | Responsibility | May import | Does I/O |
|---|---|---|---|
| `@nova/types` | Zod schemas and the types inferred from them. No logic | nothing internal | no |
| `@nova/database` | Prisma client, typed query functions, transactions | `types` | database |
| `@nova/ai` | `LLMClient`, prompts, structured-output pipelines, validation and retry | `types` | LLM |
| `@nova/planner` | Dependency graph, capacity, scoring, scheduling, replanning rules, goal risk | `types` | **no** |
| `@nova/behaviour` | Event definitions, friction rules, pattern detection, execution model | `types` | **no** |
| `@nova/simulation` | Projection, what-if, scope reduction, rescue triage | `types`, `planner` | **no** |
| `apps/web` | UI, HTTP API, and the services that connect everything | all of the above | yes |

`simulation` may call `planner` because a projection is "run the planner forward day by day". No other sideways imports are allowed. The lint rule from Phase 0 enforces the pure column.

### Layers inside `apps/web`

```
route handler      parse request with Zod → get current user → call one service → shape response
      │            (no business logic, no direct database or LLM calls)
      ▼
service            load data → call pure functions / AI functions → persist + emit events in one transaction
      │            (apps/web/server/services/*.ts — the only place where packages are combined)
      ▼
packages           database, ai, planner, behaviour, simulation
```

Services are the seam that makes the system testable: pure logic is tested with plain data, services are tested against a test database with a fake LLM, and routes are tested for validation and access control.

### The request that defines the architecture

`GET /api/plan/today`:

1. Route: authenticate, resolve the user's "today" from their timezone.
2. Service: load active goals, unfinished tasks, dependencies, multipliers; compute capacity.
3. `planner.generateDailyPlan(input)` — pure.
4. Service: save `DailyPlan` and `DailyTask` rows in one transaction; log inputs hash and reasons.
5. Route: return the plan.

The LLM is not involved at any step.

### Conventions

- **Time**: timestamps stored in UTC. The user's timezone turns "now" into a calendar date at the service layer; pure packages only ever see ISO dates and a `now` timestamp passed in.
- **Durations**: whole minutes.
- **Ids**: `cuid` strings.
- **Results**: functions that can fail for expected reasons return `Result<T, E>` (`{ ok: true, value } | { ok: false, error }`) rather than throwing. Throwing is reserved for bugs and invalid input.
- **Errors over HTTP**: `{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": ... } }` with codes `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_FAILED` 422, `CONFLICT` 409, `AI_UNAVAILABLE` 503, `INTERNAL` 500.

---

## 3. Core domain types

Defined once in `@nova/types` as Zod schemas; TypeScript types are inferred, never hand-written twice.

| Type | Values |
|---|---|
| `Priority` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `GoalStatus` | `ACTIVE`, `COMPLETED`, `ARCHIVED` |
| `MilestoneStatus` | `PENDING`, `ACTIVE`, `DONE` |
| `TaskStatus` | `TODO`, `IN_PROGRESS`, `DONE`, `DEFERRED`, `DROPPED` |
| `TaskCategory` | `WRITING`, `READING`, `STUDY`, `PRACTICE`, `CODING`, `RESEARCH`, `ADMIN`, `COMMUNICATION`, `PLANNING`, `OTHER` |
| `EnergyDemand` | `LOW`, `MEDIUM`, `HIGH` |
| `TaskOrigin` | `USER`, `AI`, `SPLIT`, `BLOCKER` |
| `DailyOutcome` | `PENDING`, `COMPLETED`, `PARTIAL`, `SKIPPED`, `POSTPONED`, `MISSED` |
| `EventType` | the 9 execution events and 2 system events in §8 |
| `FrictionReason` | `TOO_OVERWHELMING`, `DONT_KNOW_HOW_TO_START`, `LOW_ENERGY`, `DISTRACTED`, `DONT_UNDERSTAND`, `DONT_WANT_TO`, `NOT_ENOUGH_TIME` |
| `HealthStatus` | `ON_TRACK`, `AT_RISK`, `OFF_TRACK` |
| `ReplanActionType` | `SHRINK`, `SPLIT`, `REWRITE`, `MICRO_ACTIONS`, `RETIME`, `REPRIORITISE`, `DEFER`, `DROP_SUGGESTED` |
| `RescueClass` | `KEEP`, `DELETE`, `DEFER`, `TODAY` |

`TaskCategory` is a fixed list so that patterns can be counted. The AI must pick from it; `OTHER` is always valid.

---

## 4. Database schema

PostgreSQL through Prisma. Twelve tables. Every table has `id` (cuid), and `createdAt` / `updatedAt` where rows change.

### User

| Field | Type | Notes |
|---|---|---|
| email | string, unique | |
| name | string? | |
| timezone | string | IANA name, default `"UTC"` |
| defaultDailyCapacityMin | int | default 120, 0–960 |
| lastActiveAt | datetime? | drives Rescue Mode |

### Goal

| Field | Type | Notes |
|---|---|---|
| userId | → User | cascade delete |
| title | string | 1–200 characters |
| description | string? | |
| desiredOutcome | string? | |
| deadline | date | |
| priority | Priority | default MEDIUM |
| dailyCapacityMin | int | 5–960 |
| constraints | string? | free text |
| status | GoalStatus | default ACTIVE |
| sourceText | string? | the sentence the user originally typed |

Index: `(userId, status)`.

### Milestone

| Field | Type | Notes |
|---|---|---|
| goalId | → Goal | cascade delete |
| title | string | |
| order | int | unique with `goalId` |
| targetDate | date? | |
| status | MilestoneStatus | |

### Task

| Field | Type | Notes |
|---|---|---|
| milestoneId | → Milestone | cascade delete |
| goalId | → Goal | stored as well as derived, so the planner's main query needs no join |
| parentTaskId | → Task? | set when a task was split; `SetNull` on delete |
| title | string | 1–200 |
| description | string? | |
| estimatedMin | int | 1–480 |
| actualMin | int? | accumulated across sessions |
| priority | Priority | |
| category | TaskCategory | |
| energyDemand | EnergyDemand | |
| deadline | date? | |
| status | TaskStatus | default TODO |
| deferredUntil | date? | required when status is DEFERRED |
| origin | TaskOrigin | |
| startCount | int | default 0 |
| postponeCount | int | default 0 |
| completedAt | datetime? | |

Indexes: `(goalId, status)`, `(milestoneId)`.

### TaskDependency

| Field | Type | Notes |
|---|---|---|
| taskId | → Task | cascade delete |
| dependsOnTaskId | → Task | cascade delete |

Primary key `(taskId, dependsOnTaskId)`. A database check forbids `taskId = dependsOnTaskId`. Both tasks must belong to the same user, and adding the edge must not create a cycle; both are checked in the query function inside the same transaction as the insert, because PostgreSQL cannot express them as constraints.

### DailyPlan

| Field | Type | Notes |
|---|---|---|
| userId | → User | cascade delete |
| date | date | unique with `userId` |
| capacityMin | int | |
| usedMin | int | |
| plannerVersion | string | |
| generatedAt | datetime | |

### DailyTask

| Field | Type | Notes |
|---|---|---|
| dailyPlanId | → DailyPlan | cascade delete |
| taskId | → Task | cascade delete |
| order | int | |
| plannedMin | int | |
| score | float | |
| reason | string | |
| outcome | DailyOutcome | default PENDING |

Unique `(dailyPlanId, taskId)`.

### StartSession

| Field | Type | Notes |
|---|---|---|
| userId | → User | cascade delete |
| taskId | → Task | cascade delete |
| steps | JSON | validated array of `{ instruction, estimatedMin, doneLabel, state }` |
| currentStep | int | |
| stuckCount | int | |
| startedAt | datetime | |
| endedAt | datetime? | |
| outcome | `COMPLETED` / `PARTIAL` / `ABANDONED`? | null while open |

### BehaviourEvent

Append-only. Never updated, never deleted except with the user.

| Field | Type | Notes |
|---|---|---|
| userId | → User | cascade delete |
| taskId | → Task? | `SetNull` on delete, so history survives |
| goalId | → Goal? | `SetNull` on delete |
| type | EventType | |
| occurredAt | datetime | |
| payload | JSON | validated per type (§8) |

Indexes: `(userId, occurredAt)`, `(userId, type)`, `(taskId)`.

### FrictionEvent

| Field | Type | Notes |
|---|---|---|
| userId | → User | cascade delete |
| taskId | → Task | cascade delete |
| reason | FrictionReason | |
| note | string? | |
| occurredAt | datetime | |
| appliedAction | ReplanActionType? | what NOVA did in response |
| startedAfter | boolean? | did the user start the task within 24 hours — the bandit's reward (Phase 14) |

### ExecutionEstimate

| Field | Type | Notes |
|---|---|---|
| userId | → User | cascade delete |
| dimension | `CATEGORY` / `SIZE_BUCKET` / `HOUR_BAND` | |
| key | string | e.g. `"WRITING"`, `"OVER_60"`, `"20-24"` |
| multiplier | float | actual ÷ estimated, clamped 0.7–2.0 |
| completionRate | float | 0–1 |
| sampleSize | int | |

Unique `(userId, dimension, key)`.

### GoalProjection

| Field | Type | Notes |
|---|---|---|
| goalId | → Goal | cascade delete |
| computedAt | datetime | |
| projectedDate | date | |
| status | HealthStatus | |
| requiredMinPerDay | int | |
| remainingMin | int | |
| explanation | string | |

Index `(goalId, computedAt)`. History is kept so the trend can be shown.

### Not in the schema

- No Auth.js tables: sessions are signed tokens (ADR-005).
- No separate tables for learning data: the two system events and `FrictionEvent.appliedAction / startedAfter` carry it.
- Soft delete only where the product needs it: a task is `DROPPED`, a goal is `ARCHIVED`. A user-requested delete is a real delete.

---

## 5. API boundaries

All routes are under `/api`, require a signed-in user unless marked, and only ever touch that user's data. Input and output schemas live in `@nova/types`.

| Method and path | Purpose | Service → packages | Phase |
|---|---|---|---|
| `*/auth/*` | Sign in, sign out, session | Auth.js | 3 |
| `GET /goals` · `POST /goals` | List, create | goals → database | 3 |
| `GET` · `PATCH` · `DELETE /goals/:id` | Read with milestones and tasks, update, delete | goals → database | 3 |
| `POST /goals/:id/milestones` · `PATCH` · `DELETE /milestones/:id` | Milestones | goals → database | 3 |
| `POST /milestones/:id/tasks` · `GET` · `PATCH` · `DELETE /tasks/:id` | Tasks | tasks → database | 3 |
| `POST` · `DELETE /tasks/:id/dependencies` | Add or remove a dependency (rejects cycles) | tasks → planner (cycle check), database | 3 |
| `POST /goals/decompose` | Sentence → draft goal, milestones, tasks. **Saves nothing** | decomposition → ai | 4 |
| `POST /goals/confirm` | Validate the edited draft again and save it in one transaction | decomposition → database, behaviour | 4 |
| `GET /plan/today` | Today's plan, generated if missing | planning → database, planner | 5 |
| `POST /plan/today/regenerate` | Rebuild, keeping what was completed today | planning → database, planner | 5 |
| `POST /tasks/:id/complete` · `/skip` · `/postpone` | Record what happened to a task | execution → database, behaviour | 6 |
| `POST /start/:taskId` | Open a start session, return micro-actions | start → ai, database | 7 |
| `POST /start/sessions/:id/step` | `done` / `stuck` / `skip` on the current step | start → ai, database | 7 |
| `POST /start/sessions/:id/finish` | Close the session, record actual minutes | start → database, behaviour | 7 |
| `POST /start/sessions/:id/blocker` | Report a blocker, get a proposed sub-graph | start → ai, planner | 9 |
| `POST /tasks/:id/friction` | Record a friction reason | friction → database, behaviour | 8 |
| `GET /behaviour/summary` | Counts and estimate-versus-actual | behaviour → database, behaviour | 8 |
| `POST /plan/replan` | Run the replanner, return proposed actions; `apply` commits them | replanning → planner, ai, database | 9 |
| `GET /goals/:id/health` | Projection, status, explanation | health → simulation | 10 |
| `POST /goals/:id/simulate` | What-if scenario, nothing saved | simulation → simulation | 11 |
| `GET /goals/:id/scope-options` · `POST …/apply` | Scope-reduction candidates; apply the chosen one | simulation → simulation, database | 11 |
| `GET /rescue` · `POST /rescue/apply` | Triage proposal; apply the confirmed version | rescue → simulation, database | 11 |
| `GET /health` (public) | Liveness | — | 12 |

Rules that hold for every route:

- A request for another user's record returns `NOT_FOUND`, never `FORBIDDEN`, so ids cannot be probed.
- Anything the AI produced reaches the database only through a `confirm` or `apply` route that validates it again. The client is never trusted to send back an unmodified draft.
- AI routes are rate-limited per user.
- The API is the only way in. The web UI uses it like any other client, which is what lets the PWA and a native app reuse it unchanged.

---

## 6. Planning engine interface

Specified in full in [planning-engine.md](planning-engine.md). Summary of the public surface of `@nova/planner`:

```ts
generateDailyPlan(input: PlannerInput): PlannerOutput               // Phase 5
capacityForDate(args: CapacityArgs): number                         // Phase 5
buildGraph / detectCycle / topologicalOrder / countDownstream       // Phase 5
scoreTask(task, context): { score: number; terms: ScoreTerms }      // Phase 5
replan(input: ReplanInput): ReplanAction[]                          // Phase 9
goalRisk(projection, goal): HealthStatus                            // Phase 10
```

---

## 7. AI interfaces

### The client

```ts
interface LLMClient {
  generateStructured<T>(req: {
    task: string;                 // "goal-parser", "task-breaker", …  used for logs and replay keys
    promptVersion: string;        // "goal-parser@3"
    system: string;
    user: string;
    schema: ZodType<T>;
  }): Promise<Result<T, LLMError>>;
}

type LLMError =
  | { kind: "UNAVAILABLE"; message: string }       // network, timeout, rate limit
  | { kind: "INVALID_OUTPUT"; issues: string[] }   // failed the schema twice
  | { kind: "REFUSED"; message: string };
```

### Back ends (no paid key)

| Adapter | Used for | How |
|---|---|---|
| `fake` | All automated tests | Returns fixtures registered per `task`, including deliberately broken ones |
| `replay` | Demos and the public deployment's fallback | Returns recorded real responses keyed by task and input hash |
| `openai-compatible` | Real AI | One adapter that speaks the widely supported chat-completions format with a JSON schema for the output. Configured by `LLM_BASE_URL`, `LLM_MODEL` and an optional `LLM_API_KEY` |

The third adapter covers both options with no extra code: a **hosted free tier** (a base URL and a free key) and a **local model through Ollama** (`http://localhost:11434/v1`, no key). It is written with `fetch`; no provider SDK is added.

**Recommendation for this machine.** The development Mac has 8 GB of memory, which limits a local model to the smallest ones (around 3–4 billion parameters). Those run, but produce weaker decompositions and more malformed output. So: use a hosted free tier as the everyday real back end, keep Ollama as the offline option, and choose the exact provider and model at the start of Phase 4 by running the same ten goal sentences through each candidate and comparing. Free-tier terms change; they are checked then, not assumed now. See ADR-004, including the privacy note.

### Pipeline shared by every AI function

```
build prompt (versioned file) → LLMClient.generateStructured
   → Zod parse ── fail → one retry with the validation errors appended ── fail → INVALID_OUTPUT
   → semantic checks (references resolve, no cycles, values in range, dates not after the goal deadline)
   → Result<T, AIError>
```

Every call writes one structured log line: task, prompt version, adapter, model, latency, attempts, validation result. No prompt or response text is logged in production.

### Functions

All have the shape `(input, deps: { llm: LLMClient }) => Promise<Result<Output, AIError>>` and never touch the database.

| Function | Input | Output | Phase |
|---|---|---|---|
| `parseGoal` | sentence, `today` | `ParsedGoal { title, desiredOutcome, deadline, priority, constraints, availableMinPerDay, missingInformation[] }` | 4 |
| `decomposeGoal` | `ParsedGoal` | 3–7 ordered `DraftMilestone` | 4 |
| `generateTasks` | goal, milestone, user hints | `DraftTask[]` with temporary ids and dependencies between them | 4 |
| `realityCheck` | `DraftTask[]` | per task: `PASS` / `REWRITTEN` / `SPLIT`, scores, before and after | 4 |
| `breakIntoSteps` | task, goal, earlier friction | 3–7 `MicroAction { instruction, estimatedMin 1–5, doneLabel }` | 7 |
| `replaceStep` | current step, optional note | one smaller or clearer `MicroAction` | 7 |
| `analyseFriction` | task, reason, note | `RewrittenTask` or `SplitTasks` | 9 |
| `proposeBlockerGraph` | task, blocker description | `DraftTask[]` forming a small chain | 9 |
| `parseScenario` | "what if…" sentence | a validated `Scenario` object | 11 |

Deterministic fallbacks exist where a failure would otherwise stop the user: `breakIntoSteps` falls back to a fixed three-step opener (open the material → find the place → write one rough line); `realityCheck` falls back to its rule-based stage alone. Goal decomposition has no fallback: the user is told the AI is unavailable and can build the goal by hand.

---

## 8. Behaviour-event model

Events are facts about what happened, written in the same transaction as the state change that caused them. They are never edited.

### Execution events (the nine from the specification)

| Event | Emitted when | Payload beyond the common fields |
|---|---|---|
| `TASK_CREATED` | A task is saved | `origin` |
| `TASK_STARTED` | A start session opens, or the user marks a task in progress | `startCount`, `viaNovaStart` |
| `TASK_COMPLETED` | A task becomes `DONE` | `actualMin`, `ratio` (actual ÷ estimated), `sessions` |
| `TASK_SKIPPED` | The user skips it for today | `plannedMin` |
| `TASK_POSTPONED` | The user moves it to a later date | `postponeCount`, `toDate` |
| `TASK_ABANDONED` | End-of-day finds it started and unfinished, or it reaches 3 postponements | `cause`: `LEFT_UNFINISHED` / `REPEATED_POSTPONE` |
| `FRICTION_REPORTED` | The user answers "What's stopping you?" | `reason`, `hasNote` |
| `ESTIMATE_OVERRUN` | Completed with `ratio ≥ 1.25` | `estimatedMin`, `actualMin`, `ratio` |
| `ESTIMATE_UNDERRUN` | Completed with `ratio ≤ 0.75` | `estimatedMin`, `actualMin`, `ratio` |

A task that is planned, untouched, and still there when the day ends gets the daily outcome `MISSED`. That is recorded on `DailyTask`, and the replanner reads it from there; it is not a tenth event because nothing happened.

### System events (added for the learning layer)

| Event | Emitted when | Payload |
|---|---|---|
| `DECOMPOSITION_CONFIRMED` | The user confirms an AI draft | counts of tasks accepted unchanged, edited, deleted, added; the before and after text of edited tasks |
| `REPLAN_APPLIED` | Replan actions are committed | list of `{ taskId, action, frictionReason }` |

### Common payload fields

Every event about a task carries a snapshot, so later analysis does not depend on the task still existing or being unchanged: `estimatedMin`, `category`, `energyDemand`, `sizeBucket` (`UNDER_20`, `20_TO_60`, `OVER_60`), `localHour`, `dayOfWeek`, `postponeCount`, `startCount`.

### From events to behaviour

```
events ──► patterns.ts ──► execution-model.ts ──► ExecutionEstimate rows ──► planner input
           (rates and ratios   (smoothing, clamping,
            per dimension)      minimum sample size)
```

`patterns.ts` and `execution-model.ts` are pure functions over an array of events. Recomputing from the full event history always gives the same result, so the stored estimates are a cache and can be rebuilt at any time.

### Privacy

Behaviour data is the most personal thing NOVA holds. It is never included in a share link, never sent to the LLM except as short derived hints ("keep writing tasks under 20 minutes"), and deleting an account deletes all of it.

---

## 9. Friction model

Asked when: the user skips or postpones; a task is `MISSED` (asked on next open); or "I'm stuck" in NOVA START. One tap, optional note, always dismissible.

| Reason | Replan action | What the user sees next |
|---|---|---|
| `TOO_OVERWHELMING` | `SHRINK`: 60 → 30 → 15 → a 5-minute starter, remainder kept as a follow-on task | A smaller task |
| `DONT_KNOW_HOW_TO_START` | `MICRO_ACTIONS`: more, smaller first steps | NOVA START opens with easier steps |
| `LOW_ENERGY` | `RETIME`: defer the demanding task, offer a low-demand one instead | A lighter task today |
| `NOT_ENOUGH_TIME` | `SPLIT` into parts that fit, or reduce scope | Two or more shorter tasks |
| `DONT_UNDERSTAND` | `REWRITE` through the AI, validated | The same task, stated clearly |
| `DISTRACTED` | `SHRINK` the session, restart from a 2-minute step | A short restart |
| `DONT_WANT_TO` | Relevance check → `DEFER` or `DROP_SUGGESTED`; if kept, smallest start | A question, not a nag |

The same reason on the same task twice escalates (shrink again, then split, then ask whether it still matters). Nothing is ever dropped without the user confirming.

In Phase 14 a bandit may choose between the allowed actions for a reason, learning from `startedAfter`. Until then the table above is the rule.

---

## 10. Testing strategy

| Level | What | How | Where |
|---|---|---|---|
| Unit (most of the tests) | Every function in `planner`, `behaviour`, `simulation`; schemas in `types`; AI pipelines | Plain data in, plain data out. AI functions use the `fake` client with good, malformed and semantically wrong fixtures | `tests/<area>/`, `packages/*/src/*.test.ts` |
| Property | The seven planner properties in [planning-engine.md §5](planning-engine.md) | Generated inputs from a seeded generator; shuffle-invariance | `tests/planner/` |
| Integration | Services and routes | Real PostgreSQL test database, `fake` LLM, each test in a rolled-back transaction or a fresh schema | `tests/integration/` |
| End to end | The whole loop once | Playwright, `fake` LLM, seeded database | `tests/e2e/` (Phase 12) |
| Backtest | Learned models versus the statistical baseline | Replay logged events day by day | Phase 14 |

Principles:

- No test touches the network or the real clock. `today`, `now` and any random seed are arguments.
- Each worked example in the planner document is a test with the same name.
- A bug gets a failing test before it gets a fix.
- The live LLM is never part of the automated suite. A separate manual script (`pnpm ai:eval`) runs a fixed set of goal sentences through the real back end and reports validation pass rate and reality-check outcomes; it is how providers and prompt versions are compared.

---

## 11. Implementation order

The order in NOVA_PLAN §8 stands. Three adjustments follow from this document:

1. **Phase 2** creates twelve tables, not eleven (`StartSession`), and uses the status model in §1 row 6.
2. **Phase 3** adds `apps/web/server/services/` and builds auth with signed-token sessions.
3. **Phase 4** begins with the provider comparison described in §7 before any prompt work.

Phases 5a and 5b (the pure planner) depend only on Phase 2 and can be built before Phases 3–4 if the developer wants the hardest part first.

---

## 12. Risks and trade-offs

| Risk or trade-off | Why it matters | Mitigation |
|---|---|---|
| Free and small models produce poor or malformed output | The first impression of NOVA is the decomposition | Schema-constrained output, one retry, semantic checks, Task Reality Check, user review before saving; provider comparison in Phase 4; replay mode for demos |
| Free tiers change or disappear | The deployed demo could stop working | One adapter with a configurable base URL; replay fallback; nothing else in the system knows the provider |
| Free tiers may use submitted text for training | Goals can be personal | Stated in the UI; local model option; never send behaviour data |
| Greedy scheduling is not optimal | Some days leave usable minutes | Accepted for explainability; documented; revisit only with evidence |
| Hand-set weights | "Why 35?" has no data behind it | Worked examples pin behaviour; weights in one file; Phase 14 can test alternatives against history |
| Little data per user | Patterns from 20 events are noise | Minimum sample sizes, smoothing towards 1.0, clamped multipliers; learned models gated by backtest |
| Twelve tables and JSON columns | JSON is not checked by the database | Each JSON shape has a Zod schema and is validated on write and read |
| Cycle and ownership checks live in code, not constraints | A bug could write a bad edge | Single query function for writing dependencies; planner re-checks and fails loudly |
| Two AI tools editing one repository | Conflicting rewrites | File ownership rule in CLAUDE.md; one branch per phase |
| Scope: nineteen phases | Twenty half-built features | Gates. Nothing after Phase 9 starts until Gate B's demo works |
| Timezones and day boundaries | "Today" is wrong for a traveller or at midnight | One function resolves the user's date; pure code only sees dates; tests for boundaries |
| 8 GB development machine | Docker, a database, a model and a dev server will not all fit | PostgreSQL installed natively or hosted free, not in Docker (ADR-006); hosted model by default |

---

## 13. Questions for the developer before approval

1. **Sign-in method.** GitHub, Google, or an emailed sign-in link? GitHub is the least setup for a portfolio project. (ADR-005 assumes GitHub.)
2. **Twelfth table and extra events.** `StartSession`, `DECOMPOSITION_CONFIRMED` and `REPLAN_APPLIED` go beyond the PDF's lists. Approve?
3. **Capacity rule.** Day capacity = the smaller of your overall daily budget and the sum of what you allotted to each active goal. Does that match how you think about your time?
4. **Planner weights.** Deadline pressure 35, priority 25, overdue 15, unblocks 10, risk 10, continuity 5. Example 5 shows the consequence: a goal running out of time beats a more important goal that has slack. Is that the behaviour you want?
5. **Database location.** PostgreSQL installed on the Mac with Homebrew (works offline) or a free hosted database (nothing to install, needs internet)? (ADR-006 assumes Homebrew.)
6. **Real AI back end.** Hosted free tier by default with a small local model as the offline option, given 8 GB of memory. Agree?
