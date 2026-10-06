# NOVA — Master Build Plan

Source: `PROJECT NOVA.pdf` (55 pages). This file is the single source of truth for **what** gets built and **in what order**. The matching prompts live in [NOVA_PROMPTS.md](NOVA_PROMPTS.md). The repo rules file is [CLAUDE.md](../CLAUDE.md).

---

## 1. What NOVA is

**NOVA is an adaptive goal-execution system.** It is not an AI chatbot, an AI todo list, a calendar, or a task manager.

Four layers:

| Layer | Question it answers |
|---|---|
| Direction | What is the user trying to accomplish? |
| Planning | What should happen today? |
| Initiation | How does the user actually begin? |
| Recovery | What happens when reality breaks the plan? |

Core loop:

```
GOAL → AI DECOMPOSITION → MILESTONES → TASK GRAPH → PLANNING ENGINE → DAILY PLAN
     → NOVA START → USER ACTION → BEHAVIOUR → FRICTION DETECTION → REPLANNING → BETTER NEXT PLAN
```

Guiding sentence (protect this through every phase):

> NOVA does not optimise the user's task list. It optimises the survival of the user's goals under real-world behaviour.

### Non-negotiable architecture rules

1. **The LLM understands; the software decides.** `User → LLM → structured output → validation → deterministic planning engine → daily plan`.
2. The LLM **may**: interpret natural language, decompose goals, generate structured tasks, analyse reported friction, generate micro-actions.
3. The LLM **must not**: write to the database directly, decide the final schedule, bypass validation, or make planning decisions.
4. Every LLM output is schema-validated before it enters the application. The user confirms AI-generated goals/tasks before they are saved.
5. Planning, replanning, projection and simulation are **pure, deterministic, unit-tested functions**. Same input → same output. No `Date.now()` or randomness inside them; the clock is passed in.
6. Every planning decision carries a human-readable **reason** (the developer and the user must be able to see why a task was selected).

---

## 2. Locked decisions

The PDF fixes the first five. The rest were proposed where the PDF is silent and **confirmed by the developer on 2026-10-06**.

| Area | Decision | Source |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript strict | PDF |
| Database | PostgreSQL | PDF |
| ORM | Prisma | PDF |
| AI | LLM API with structured output | PDF |
| VCS | Git/GitHub, one feature branch per phase, nothing AI-generated straight onto `main` | PDF |
| Monorepo | pnpm workspaces (`apps/web`, `packages/*`) | confirmed |
| Validation | Zod (one schema = runtime validation + TS type) | confirmed |
| Tests | Vitest for packages; Playwright for one end-to-end loop test in Phase 12 | confirmed |
| Auth | Auth.js (NextAuth), JWT sessions so a mobile client can reuse them | confirmed |
| Styling | Tailwind CSS | confirmed |
| LLM provider | **No paid API key.** One `LLMClient` interface in `packages/ai` with four adapters: `fake` (tests), `replay` (recorded responses for demos), a hosted free tier (deployed app), and a local model via Ollama (offline development). See ADR-004 | confirmed |
| Clients | API-first backend. Web first, then installable web app (PWA), then optional native app reusing the pure packages | confirmed |
| Learning | Staged: statistics → bandit → simple predictor → deep model only if it beats the predictor. Models predict; the planner still decides | confirmed |

### Inconsistencies in the PDF and how this plan resolves them

- **Three different phase numberings** (Phase 0–7, M1–M8, and the 13-step PIPELINE). This plan uses the **PIPELINE (Phase 0–12)** because it is the most granular and comes last in the document.
- **Friction reasons**: one list has 6, the later spec has 7 (adds "Not enough time"). This plan uses all **7**.
- **Behaviour events**: one list has 7, the spec has 9 (adds `TASK_CREATED`, `ESTIMATE_UNDERRUN`). This plan uses all **9**.
- **Schema location**: the layout shows both `packages/database/schema.ts` and `prisma/schema.prisma`. Resolution: Prisma schema lives at `prisma/schema.prisma`; `packages/database` exports the Prisma client and typed query functions only.
- **"MVP" has two meanings.** The 7-day target is the loop up to NOVA START (Phases 0–7). The spec's 13-item MVP list also includes behaviour events, basic friction, adaptive replanning and goal progress (through Phase 9 plus a progress bar). This plan calls them **Gate A (Working Loop)** and **Gate B (MVP)**.
- **Friction responses not specified** for "Distracted" and "I don't want to do it". My proposed behaviours are marked *(assumption)* in §7.4.

---

## 3. Functional requirements

`Gate` column: **A** = Working Loop (end of Phase 7), **B** = MVP (end of Phase 9), **C** = Full vision (end of Phase 12).

### 3.1 Direction — Goal system

| ID | Requirement | Phase | Gate |
|---|---|---|---|
| FR-1.1 | User can sign up / sign in; all data is scoped to the user | 3 | A |
| FR-1.2 | Create a goal with title, description, deadline, priority, available time (minutes/day), optional constraints | 3 | A |
| FR-1.3 | Edit, archive and delete goals | 3 | A |
| FR-1.4 | Goals contain milestones; milestones contain tasks; full CRUD on each | 3 | A |
| FR-1.5 | Task fields: title, description, estimated duration, priority, dependencies, milestone, deadline, status | 3 | A |
| FR-1.6 | Goal dashboard listing active goals with progress (% of task minutes complete) | 3 (basic), 10 (health) | A / B |

### 3.2 AI decomposition

| ID | Requirement | Phase | Gate |
|---|---|---|---|
| FR-2.1 | Parse a natural-language goal ("Get an SWE internship by December") into goal, deadline, desired outcome, priority, constraints, available time | 4 | A |
| FR-2.2 | Decompose a goal into ordered milestones | 4 | A |
| FR-2.3 | Generate tasks per milestone with duration, priority, dependencies, deadline | 4 | A |
| FR-2.4 | All LLM output validated against Zod schemas; invalid output is retried once with the validation error, then fails cleanly | 4 | A |
| FR-2.5 | User reviews and confirms (or edits) the decomposition before anything is saved | 4 | A |
| FR-2.6 | **Task Reality Check**: each generated task is scored for specificity, actionability, duration, dependency needs, can-start-immediately, fits-in-one-session. Vague tasks ("Work on portfolio") are rejected and rewritten ("Choose the 3 projects to showcase") | 4 | A |

### 3.3 Planning engine

| ID | Requirement | Phase | Gate |
|---|---|---|---|
| FR-3.1 | Dependency resolver: build the task graph, detect cycles, return the set of currently unblocked tasks | 5 | A |
| FR-3.2 | Capacity calculation: available minutes for a given day | 5 | A |
| FR-3.3 | Prioritiser: deterministic score from deadline pressure, priority, overdue state, milestone progress, goal risk | 5 | A |
| FR-3.4 | Scheduler: produce today's plan within capacity, respecting dependencies. Reference test: 120 min available, A=60, B=40, C=30 → plan is A + B | 5 | A |
| FR-3.5 | Plan contains a small number of meaningful tasks (cap, default 5) and a `reason` per task | 5 | A |
| FR-3.6 | Daily plan is persisted (`DailyPlan`, `DailyTask`) and regenerated on demand | 5 | A |
| FR-3.7 | Planner uses historical execution data (personal duration multipliers, completion patterns) | 9 | B |

### 3.4 Today / daily dashboard

| ID | Requirement | Phase | Gate |
|---|---|---|---|
| FR-4.1 | Today page shows the plan, each task's duration and why it is there | 6 | A |
| FR-4.2 | Mark task complete / skip / postpone from Today | 6 | A |
| FR-4.3 | Minimal cognitive load: the next action is always obvious; no overdue-task wall | 6 | A |

### 3.5 NOVA START — initiation

| ID | Requirement | Phase | Gate |
|---|---|---|---|
| FR-5.1 | Pressing START on a task opens a start session | 7 | A |
| FR-5.2 | The task is broken **dynamically** (at start time, not at decomposition time) into micro-actions of ~2–5 minutes, shown one at a time | 7 | A |
| FR-5.3 | Per step: Done / I'm stuck / Skip | 7 | A |
| FR-5.4 | "I'm stuck" regenerates a smaller or clearer step | 7 | A |
| FR-5.5 | Completion flow records actual duration and returns to Today | 7 | A |
| FR-5.6 | **Adaptive task collapse**: when a step reveals a blocker ("my CV is outdated"), NOVA inserts a temporary blocker sub-graph (Update CV → …) and returns to the original task when it is done | 9 | B |

### 3.6 Behaviour and friction

| ID | Requirement | Phase | Gate |
|---|---|---|---|
| FR-6.1 | Record events: `TASK_CREATED`, `TASK_STARTED`, `TASK_COMPLETED`, `TASK_SKIPPED`, `TASK_POSTPONED`, `TASK_ABANDONED`, `FRICTION_REPORTED`, `ESTIMATE_OVERRUN`, `ESTIMATE_UNDERRUN` | 8 | B |
| FR-6.2 | Store per task: estimated vs actual duration, number of postponements, number of starts, completion status, reported friction, time/context | 8 | B |
| FR-6.3 | When a task is not started or is repeatedly postponed, ask "What's stopping you?" with 7 options: too overwhelming, don't know how to start, low energy, distracted, don't understand the task, don't want to do it, not enough time | 8 | B |
| FR-6.4 | Distinguish failure, postponement, abandonment and reported friction (they are different signals) | 8 | B |
| FR-6.5 | Pattern detection: by task category, task size bucket, and time of day (e.g. "tasks > 60 min rarely started", "after 20:00 completion drops") | 9 | B |
| FR-6.6 | **Personal execution model**: duration multipliers per category (e.g. maths × 1.35), preferred task size, typical working hours, common friction causes | 9 (basic), 10 (full) | B / C |

### 3.7 Adaptive replanning and recovery

| ID | Requirement | Phase | Gate |
|---|---|---|---|
| FR-7.1 | Missed task is never blindly moved to tomorrow. Replanner: detect → still relevant? → why missed? → recalculate → change size / timing / scope / priority | 9 | B |
| FR-7.2 | Each friction reason maps to a distinct system response (table in §7.4) | 9 | B |
| FR-7.3 | Replanning optimises goal survival, not adherence to the original schedule | 9 | B |
| FR-7.4 | **Goal health**: projected completion date per goal from remaining work, remaining time, historical execution, capacity, dependencies; status ON_TRACK / AT_RISK / OFF_TRACK with an explanation | 10 | C |
| FR-7.5 | **Scope reduction**: when a goal is unrealistic, generate alternative reduced-scope plans and compare them; never decide for the user | 11 | C |
| FR-7.6 | **Rescue Mode**: after N days inactive (default 3), show "You're back" instead of the backlog; classify outstanding tasks into KEEP / DELETE / DEFER / TODAY and produce a small recovery plan | 11 | C |
| FR-7.7 | **What-if simulator**: "what if I skip the next 7 days?" → current projection, projection after inactivity, extra minutes/day required, scope-reduction alternatives | 11 | C |

---

## 4. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | TypeScript strict mode everywhere; no `any` in `packages/planner`, `behaviour`, `simulation` |
| NFR-2 | `packages/planner`, `behaviour`, `simulation` have **no** imports from Next.js, Prisma, or the LLM SDK. Pure functions on plain types |
| NFR-3 | Unit tests for every planning, replanning, risk and simulation function; integration tests for API routes; one end-to-end test of the whole loop |
| NFR-4 | Database integrity: foreign keys, cascade rules, unique constraints, no dependency cycles |
| NFR-5 | Error handling: LLM failure, validation failure and empty plans all have a defined user-visible outcome |
| NFR-6 | Observability: structured log line for every LLM call (prompt version, latency, validation pass/fail) and every planner run (inputs hash, selected tasks, reasons) |
| NFR-7 | Documentation: `docs/architecture.md`, `docs/planning-engine.md`, one ADR per significant decision |
| NFR-8 | No new dependency without a written justification |
| NFR-9 | The developer can explain: the schema, the TS interfaces, the API flow, how the planner computes a schedule, how LLM output is validated, how events are recorded, how replanning works |

## 5. Extensions and what stays out

The PDF lists nine things not to build in the MVP. The developer wants every one that is practical. None of them starts before **Gate B**; the core loop has to work first. Phases are in §8.

| PDF "do not build" item | Verdict | How it is included | Phase |
|---|---|---|---|
| Mobile application | Yes | Installable web app (PWA) first; native app later, reusing `types`, `planner`, `behaviour`, `simulation` and the same API | 13, 19 |
| Complex ML | Yes, staged | Learning layer: intervention bandit, completion predictor, optional local fine-tune of a small model on logged corrections | 14 |
| Calendar integrations | Yes | Read busy time from a calendar to compute real daily capacity; export the daily plan as a calendar feed | 15 |
| Email integrations | Partly | Outgoing only: daily plan and "you're back" emails. Reading the user's inbox is excluded (restricted permissions need a provider security review) | 16 |
| Autonomous agents | Partly | A scheduled background run that replans and prepares suggestions. It only proposes; the user confirms. It never breaks the rule that the LLM does not decide | 16 |
| Voice assistant | Partly | Voice input for goals and friction notes, spoken steps in NOVA START, using the browser's built-in speech features (free, no service) | 17 |
| Social features | Partly | Read-only share link for one goal's progress, for an accountability partner | 18 |
| Team collaboration | No | Shared goals, roles and permissions are a different product and would rewrite the data model | — |
| Dozens of AI agents | No | Adds cost and unpredictability without serving the core loop | — |

Things to do **during the core phases** so the extensions are cheap later:

- Backend is a real HTTP API with token-capable sessions (Phase 3), not UI-only server actions.
- Daily capacity comes through one function with pluggable sources (Phase 5), so a calendar can feed it.
- Notifications go through one channel interface (Phase 8).
- Log what the AI proposed versus what the user confirmed (Phase 4), and which replanning action was applied and whether the task was then started (Phase 9). This is the training data for Phase 14.

---

## 6. Project structure

```
nova/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── dashboard/        # goal overview + health
│       │   ├── goals/            # goal CRUD, decomposition review
│       │   ├── today/            # daily plan
│       │   ├── start/            # NOVA START session
│       │   ├── review/           # rescue mode, what-if, friction review
│       │   └── api/              # route handlers (thin: validate → call package → persist)
│       ├── components/
│       │   ├── goals/
│       │   ├── planner/
│       │   ├── start/
│       │   ├── dashboard/
│       │   └── ui/               # shared primitives
│       └── styles/
├── packages/
│   ├── types/                    # domain types + Zod schemas (no logic)
│   │   ├── goal.ts
│   │   ├── milestone.ts
│   │   ├── task.ts
│   │   ├── plan.ts
│   │   └── behaviour.ts
│   ├── database/                 # Prisma client + typed queries (only package that touches the DB)
│   │   ├── client.ts
│   │   └── queries/
│   ├── ai/                       # only package that talks to the LLM
│   │   ├── llm-client.ts         # provider-agnostic interface + adapter
│   │   ├── goal-parser.ts
│   │   ├── goal-decomposer.ts
│   │   ├── task-generator.ts
│   │   ├── task-reality-check.ts
│   │   ├── task-breaker.ts       # micro-actions for NOVA START
│   │   └── friction-analyser.ts
│   ├── planner/                  # PURE. deterministic. heavily tested
│   │   ├── dependency-resolver.ts
│   │   ├── capacity.ts
│   │   ├── prioritiser.ts
│   │   ├── scheduler.ts
│   │   ├── replanner.ts
│   │   └── goal-risk.ts
│   ├── behaviour/                # PURE
│   │   ├── events.ts
│   │   ├── friction.ts
│   │   ├── patterns.ts
│   │   └── execution-model.ts
│   └── simulation/               # PURE
│       ├── projections.ts
│       ├── what-if.ts
│       ├── scope-reduction.ts
│       └── rescue.ts
├── tests/
│   ├── planner/
│   ├── replanning/
│   ├── task-breakdown/
│   ├── goal-risk/
│   ├── simulation/
│   └── e2e/
├── docs/
│   ├── product-spec.md           # the spec from the PDF, section 16
│   ├── architecture.md
│   ├── planning-engine.md
│   ├── PROGRESS.md               # phase checklist, updated at every close-out
│   └── decisions/                # ADR-001-*.md …
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── README.md
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
└── LICENSE
```

Dependency direction (enforce it): `apps/web → ai, planner, behaviour, simulation, database → types`. `planner`, `behaviour`, `simulation` depend on `types` only.

Additions to the PDF's layout: `ai/llm-client.ts`, `ai/task-reality-check.ts`, `simulation/rescue.ts`, `tests/e2e/`, `docs/PROGRESS.md`, `pnpm-workspace.yaml`.

---

## 7. Core design

### 7.1 Data model

> Superseded in detail by [architecture.md §4](architecture.md): twelve tables (adds `StartSession`) and a task status model of `TODO / IN_PROGRESS / DONE / DEFERRED / DROPPED` with a separate per-day outcome. The table below is the original outline.

| Entity | Key fields | Introduced |
|---|---|---|
| `User` | id, email, name, defaultDailyCapacityMin, timezone | Phase 2 |
| `Goal` | id, userId, title, description, desiredOutcome, deadline, priority, dailyCapacityMin, constraints, status (ACTIVE / COMPLETED / ARCHIVED) | Phase 2 |
| `Milestone` | id, goalId, title, order, targetDate, status | Phase 2 |
| `Task` | id, milestoneId, parentTaskId?, title, description, estimatedMin, priority, deadline?, status (TODO / IN_PROGRESS / DONE / SKIPPED / DEFERRED / DELETED), category, energyDemand, isBlockerFor? | Phase 2 |
| `TaskDependency` | taskId, dependsOnTaskId (unique pair, no self-reference) | Phase 2 |
| `DailyPlan` | id, userId, date (unique per user), capacityMin, generatedAt, plannerVersion | Phase 2 |
| `DailyTask` | id, dailyPlanId, taskId, order, plannedMin, reason, outcome | Phase 2 |
| `BehaviourEvent` | id, userId, taskId?, type (9 values), occurredAt, payload (JSON) | Phase 2 (used from 8) |
| `FrictionEvent` | id, userId, taskId, reason (7 values), note?, occurredAt, resolution | Phase 2 (used from 8) |
| `ExecutionEstimate` | id, userId, dimension (category / sizeBucket / hourBand), key, multiplier, completionRate, sampleSize | Phase 2 (used from 9) |
| `GoalProjection` | id, goalId, computedAt, projectedDate, status, requiredMinPerDay, explanation | Phase 2 (used from 10) |

`category` and `energyDemand` on `Task` are my additions; the PDF's pattern examples ("writing tasks frequently postponed", "move demanding work away from low-energy periods") cannot be computed without them.

### 7.2 Planning engine contract

```ts
// packages/planner — everything here is a pure function
interface PlannerInput {
  today: string;                    // ISO date, injected — never read the clock
  capacityMin: number;
  goals: PlannerGoal[];
  tasks: PlannerTask[];
  dependencies: { taskId: string; dependsOnTaskId: string }[];
  estimates?: ExecutionEstimate[];  // empty until Phase 9
  maxTasks?: number;                // default 5
}

interface PlannedTask { taskId: string; order: number; plannedMin: number; score: number; reason: string; }
interface PlannerOutput { date: string; capacityMin: number; usedMin: number; tasks: PlannedTask[]; excluded: { taskId: string; why: string }[]; }

function generateDailyPlan(input: PlannerInput): PlannerOutput;
```

Algorithm v1 (outline; the full specification with weights and worked examples is [planning-engine.md](planning-engine.md)):

1. **Eligible set** — status TODO or IN_PROGRESS, every dependency DONE, goal ACTIVE. Cycle in the graph → throw a typed error.
2. **Adjusted duration** — `estimatedMin × multiplier(category)`; multiplier is 1.0 until Phase 9.
3. **Score** — weighted sum of: deadline pressure (remaining goal work ÷ remaining capacity before the deadline), task priority, overdue flag, number of tasks this one unblocks, goal risk (from Phase 10). Weights are named constants in one file.
4. **Order** — score descending; ties broken by earlier deadline, then earlier creation, then id. No ties are left to chance.
5. **Fill** — walk the ordered list, add a task if it fits the remaining capacity, otherwise record it in `excluded` and continue; stop at `maxTasks`.
6. **Explain** — each selected task gets a `reason` built from the dominant score terms.

### 7.3 AI contract

```ts
// packages/ai
interface LLMClient { generateStructured<T>(args: { system: string; user: string; schema: ZodSchema<T>; promptVersion: string }): Promise<Result<T, LLMError>>; }
```

Every AI function has the shape `(input, llm) → Result<ValidatedOutput, Error>` and never touches the database. Tests use a fake `LLMClient` returning fixtures, including malformed ones.

### 7.4 Friction → response table (drives the replanner)

| Friction reason | System response |
|---|---|
| Too overwhelming | Shrink the task: 60 → 30 → 15 → 5-minute starting action |
| Don't know how to start | Generate smaller, more concrete micro-actions |
| Low energy | Move demanding work to a different time; offer a low-demand task instead |
| Not enough time | Split the task or reduce scope |
| Don't understand the task | Clarify / rewrite the task |
| Distracted | *(assumption)* Shorten the session and restart from a 2-minute step |
| Don't want to do it | *(assumption)* Relevance check: keep, defer, or delete; if kept, pair with the smallest possible start |

---

## 8. Build sequence

One branch per phase. Do the phases in order; each one's exit gate must pass before the next starts. Hours are the PDF's hands-on estimates.

| Phase | Name | Branch | Primary tool | Depends on | Est. hrs | Exit gate |
|---|---|---|---|---|---|---|
| 0 | Project setup | `chore/setup` | Claude Code | — | 1 | Repo exists with README, CLAUDE.md, `docs/product-spec.md`, empty workspace; `pnpm install` works |
| 1 | Architecture | `docs/architecture` | Claude Code | 0 | 1–3 | `docs/architecture.md` + `docs/planning-engine.md` + ADRs written **and you have read and approved them**. No app code |
| 2 | Database + domain model | `feature/domain-model` | Claude Code | 1 | 2–4 | Prisma schema migrated, `packages/types` Zod schemas, seed script, typed queries, tests green |
| 3 | Goal system | `feature/goals` | Claude Code (API) + Antigravity (UI) | 2 | 3–5 | Signed-in user can create/edit/delete goal → milestone → task with dependencies |
| 4 | AI decomposition | `feature/ai-decomposition` | Claude Code | 3 | 4–7 | Sentence in → validated milestones + tasks → Reality Check → user confirms → saved |
| 5 | Planning engine | `feature/planning-engine` | Claude Code | 2 (logic), 3 (data) | 6–10 | `generateDailyPlan` passes the full test suite, including the 120-min reference case |
| 6 | Daily planner UI | `feature/today` | Antigravity (UI) + Claude Code (API) | 5 | 3–5 | Today page shows the plan with reasons; complete/skip/postpone work |
| 7 | NOVA START | `feature/nova-start` | Claude Code (backend) + Antigravity (UX) | 4, 6 | 4–7 | Task → START → micro-actions → done/stuck/skip → completion with actual duration |
| | **GATE A — Working Loop** | | | | ~15–25 total | Demo: goal sentence → plan → start → finish a task, end to end |
| 8 | Behaviour tracking | `feature/behaviour-model` | Claude Code | 7 | 3–5 | All 9 event types recorded; friction prompt works; est-vs-actual stored |
| 9 | Adaptive replanning | `feature/replanning` | Claude Code | 8 | 5–8 | Missed task + friction reason produces a visibly different next plan; multipliers feed the planner; blocker sub-graphs work |
| | **GATE B — MVP** | | | | ~35–55 total | Demo: fail 3 tasks on purpose → show collected data → show the rebuilt plan |
| 10 | Goal health | `feature/goal-health` | Claude Code | 9 | 3–5 | Each goal shows projected date, status, and an explanation |
| 11 | What-if + Rescue Mode | `feature/goal-simulation`, `feature/rescue-mode` | Claude Code + Antigravity | 10 | 7–12 | Rescue Mode triage after inactivity; what-if returns projections and scope alternatives |
| 12 | Polish, testing, deployment | `chore/release` | both | 11 | 8–15 | E2E test green, README with architecture diagram, deployed URL |
| | **GATE C — Full vision** | | | | ~55–90+ total | |
| 13 | Installable web app (PWA) | `feature/pwa` | Antigravity + Claude Code | 12 | 4–8 | Installs to a phone home screen, works at phone width, shows today's plan offline, push notification for the daily plan |
| 14 | Learning layer | `feature/learning` | Claude Code | 9 (data), 12 | 10–20 | Intervention bandit and completion predictor each beat the Phase 9 statistics in a backtest on logged data, or are not switched on |
| 15 | Calendar | `feature/calendar` | Claude Code | 5 | 6–10 | Busy time reduces that day's capacity; plan available as a calendar feed |
| 16 | Notifications, email, background replanning | `feature/notifications` | Claude Code | 9 | 6–10 | Daily plan email; nightly proposal-only replan the user confirms |
| 17 | Voice | `feature/voice` | Antigravity | 7 | 3–6 | Speak a goal or a friction note; NOVA START can read steps aloud |
| 18 | Share link | `feature/share` | Claude Code + Antigravity | 10 | 3–5 | Read-only, revocable link to one goal's progress |
| 19 | Native mobile app | `feature/mobile` | both | 13 | 20–40 | Today and NOVA START running natively against the same API |
| | **GATE D — Extended product** | | | | | |

### Week-1 schedule (from the PDF)

| Day | Phases |
|---|---|
| 1 | 0, 1, 2 |
| 2 | 3 |
| 3 | 4 |
| 4 | 5 |
| 5 | 6 |
| 6 | 7 |
| 7 | Integrate, fix, test the whole loop → Gate A |

Week 2: Phases 8–9 → Gate B. Weeks 3+: Phases 10–12 → Gate C. Then the extension phases 13–19, in any order that respects the "Depends on" column.

### Where to spend effort (PDF's priority order)

1. Planning engine  2. Adaptive replanning  3. Behaviour/event architecture  4. Task initiation  5. AI structured-output pipeline  6. Goal projection/simulation  7. Frontend polish.

Do not polish the dashboard while the planner is `sort(tasks).slice(0, 5)`.

---

## 9. Working rules

**Tool split.** Claude Code: architecture, database, backend, AI pipelines, planning algorithms, behaviour model, tests, debugging, refactoring. Antigravity: frontend, UI/UX, browser and visual testing, NOVA START experience, interactions. They never edit the same files in the same phase: Antigravity owns `apps/web/app/**/page.tsx`, `apps/web/components/**`, `apps/web/styles/**`; Claude Code owns everything else.

**Per-phase ritual.**

1. Create the branch.
2. Paste the session header + the phase prompt from `NOVA_PROMPTS.md`.
3. The tool first explains: architecture, data flow, files affected, algorithm, tests, failure cases. You approve.
4. It implements. Tests run.
5. You inspect the diff and run the close-out prompt (it updates `docs/PROGRESS.md`).
6. You run the understanding-check prompt and can answer its questions.
7. Commit, merge to `main`.

**Your share.** Roughly 70–80% AI implementation, 20–30% yours — and yours is the architecture, testing and product decisions, not random typing.

---

## 10. Progress tracker

Copy this into `docs/PROGRESS.md` in Phase 0.

- [ ] Phase 0 — Project setup
- [ ] Phase 1 — Architecture (reviewed and approved)
- [ ] Phase 2 — Database + domain model
- [ ] Phase 3 — Goal system
- [ ] Phase 4 — AI decomposition + Task Reality Check
- [ ] Phase 5 — Planning engine
- [ ] Phase 6 — Daily planner UI
- [ ] Phase 7 — NOVA START
- [ ] **Gate A — Working Loop demo**
- [ ] Phase 8 — Behaviour tracking
- [ ] Phase 9 — Adaptive replanning
- [ ] **Gate B — MVP demo (fail 3 tasks, watch it replan)**
- [ ] Phase 10 — Goal health
- [ ] Phase 11 — What-if + Rescue Mode
- [ ] Phase 12 — Polish, testing, deployment
- [ ] **Gate C — Full vision**
- [ ] Phase 13 — Installable web app (PWA)
- [ ] Phase 14 — Learning layer
- [ ] Phase 15 — Calendar
- [ ] Phase 16 — Notifications, email, background replanning
- [ ] Phase 17 — Voice
- [ ] Phase 18 — Share link
- [ ] Phase 19 — Native mobile app
- [ ] **Gate D — Extended product**

## 11. The demo this is all building toward

> "Here is the original goal. Here is the plan NOVA generated. I intentionally failed three tasks. Here is the behavioural data NOVA collected. Now watch it construct a different plan based on what happened."
