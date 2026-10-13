# NOVA — Progress

Build order and exit gates: [NOVA_PLAN.md §8](NOVA_PLAN.md). Update this file at every phase close-out.

- [x] Phase 0 — Project setup
- [x] Phase 1 — Architecture (reviewed and approved)
- [x] Phase 2 — Database + domain model
- [x] Phase 3 — Goal system
- [x] Phase 4 — AI decomposition + Task Reality Check (first real-model run done; prompt tuning still to do)
- [x] Phase 5 — Planning engine
- [x] Phase 6 — Daily planner UI
- [x] Phase 7 — NOVA START
- [ ] **Gate A — Working Loop demo** (every step works; a start-to-finish walkthrough from an empty account on the live site is still to be done)
- [x] Phase 8 — Behaviour tracking
- [ ] Phase 8b — Momentum (game layer)
- [ ] Phase 9 — Adaptive replanning
- [ ] **Gate B — MVP demo (fail 3 tasks, watch it replan)**
- [ ] Phase 10 — Goal health
- [ ] Phase 11 — What-if + Rescue Mode
- [ ] Phase 12 — Polish, testing, deployment
- [ ] **Gate C — Full vision**

## Log

### Phase 0 — Project setup (2026-10-06)

Built: pnpm workspace, six empty packages, bare Next.js app, Vitest, ESLint, docs.

Differences from the Phase 0 prompt:

- Package source lives in `packages/<name>/src/` rather than directly in the package folder.
- TypeScript is pinned to 6.x. TypeScript 7 is current, but typescript-eslint does not support it yet.
- ESLint carries a rule that fails the build if `planner`, `behaviour` or `simulation` import a framework, the database, the LLM package, or use `Date.now()` / `Math.random()` / `fetch`.

Dependencies introduced, with justification:

| Dependency | Why |
|---|---|
| next, react, react-dom | Required stack |
| typescript | Required stack |
| tailwindcss, @tailwindcss/postcss | Styling choice in the plan |
| vitest | Test runner choice in the plan |
| eslint, @eslint/js, typescript-eslint | Linting, and enforcement of the pure-package rule |
| @types/node, @types/react, @types/react-dom | Type definitions |

Open for Phase 1: confirm pnpm / Zod / Vitest / Auth.js / Tailwind; choose the LLM provider (no paid API key — local model in development is the leading option).

### Phase 1 — Architecture (2026-10-06) — approved

Produced: `architecture.md`, `planning-engine.md` (13 worked examples), ADR-001 to ADR-008. The plan gained extension Phases 13–19 and the no-paid-key decision.

The developer approved all six questions in `architecture.md` §13 with the proposed defaults: GitHub sign-in, twelve tables and two system events, the capacity rule, the planner weights, PostgreSQL installed locally, hosted free AI tier with a local fallback.

Added after approval at the developer's request: the game layer (`game-layer.md`, ADR-009, Phase 8b).

### Phase 2 — Database + domain model (2026-10-06)

Built:

- `prisma/schema.prisma`: twelve tables, fifteen enums, cascade rules, indexes; ten check constraints added by hand in the first migration (duration range, no self-dependency, a deferred task must have a date, a plan cannot exceed its capacity, and others).
- `@nova/types`: one Zod schema per entity, input schemas, and a schema per behaviour-event payload.
- `@nova/database`: client, mappers from rows to domain types, and queries for users, goals, milestones, tasks, dependencies, daily plans and events. Every query takes the acting user's id.
- `prisma/seed.ts`: demo user with the internship goal, 5 milestones, 21 tasks, 21 dependencies.
- Tests: 40 unit, 45 integration against a real PostgreSQL test database.

Requirement check against the Phase 2 "done when":

| Check | Result |
|---|---|
| `pnpm db:migrate` | met |
| `pnpm db:seed` | met |
| `pnpm test` | met — 85 passing |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | met |
| Zod accepts valid and rejects invalid input | met |
| CRUD, cascade deletes, unique constraints | met |
| Dependency cycle rejected at write time | met, including two concurrent inserts |

Differences from the prompt and decisions made while building:

- PostgreSQL is installed with Homebrew rather than Docker (ADR-006).
- Prisma 7 is used: the client is generated into `packages/database/src/generated` (not committed; `pnpm install` regenerates it), the connection goes through the `pg` driver adapter, and the connection string lives in `prisma.config.ts`.
- Dependency writes take a per-user PostgreSQL advisory lock, so two requests cannot each pass the cycle check and together create a cycle.
- `packages/database` turns off `exactOptionalPropertyTypes`, because Prisma treats an explicit `undefined` as "leave unchanged".
- A test compares every enum in Prisma with its Zod counterpart, so the two definitions cannot drift.
- Rebuilding a day's plan keeps entries the user has already acted on.

Dependencies introduced:

| Dependency | Why |
|---|---|
| prisma, @prisma/client | Required stack |
| @prisma/adapter-pg | Prisma 7 connects to PostgreSQL through a driver adapter |
| zod | Validation choice (ADR-003) |
| tsx | Runs the TypeScript seed script |

Not built (belongs to later phases): queries for start sessions, friction events, execution estimates and goal projections. Their tables exist; the queries arrive with the phases that use them.

### Phase 3 — Goal system (2026-10-06)

Built:

- **Sign-in** with Auth.js: GitHub (enabled when `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are set) and a one-click demo sign-in that exists only outside production builds. Sessions are signed tokens; `requireUser()` is the single way a route or page gets the current user.
- **HTTP layer** (`apps/web/server/http.ts`): one wrapper gives every route the same error shape and status codes.
- **Services** (`apps/web/server/services/`): goals with progress, milestones, tasks, dependencies.
- **API**: goals, milestones, tasks, dependencies and profile routes, as listed in `architecture.md` section 5.
- **Screens**: sign-in, dashboard, goal list, new goal, and a goal page for editing milestones, tasks, status and prerequisites. Today is a placeholder until Phase 6.
- **Behaviour hook** `onTaskCreated`, called inside the task-creation transaction, empty until Phase 8.

Requirement check (FR-1.1 to FR-1.6):

| Requirement | Result |
|---|---|
| FR-1.1 sign in, data scoped to the user | met — every route answers 401 without a session and 404 for another user's records |
| FR-1.2 create a goal | met |
| FR-1.3 edit, archive, delete | met |
| FR-1.4 milestones and tasks, full CRUD | met |
| FR-1.5 task fields | met |
| FR-1.6 dashboard with progress | met (share of estimated minutes done) |

Verified: 13 API integration tests (58 integration and 40 unit in total), and by hand in the browser: demo sign-in, create a goal, add a milestone and tasks, set a prerequisite, see the "waiting on" note, see a loop rejected with a readable message, tick a task and watch progress move, and the layout at phone width.

Differences from the prompts and decisions made while building:

- Both halves of the phase (3a API, 3b screens) were built by Claude Code in one pass at the developer's request, rather than handing the screens to a second tool.
- Server-rendered pages read through the same services the API uses; every change goes through the API. Non-web clients use the API for everything.
- `next-auth` is the 5.x beta: it is the line that supports the App Router `auth()` helper and Next 16. Pinned to an exact version.
- Pages live in an `app/(app)/` route group so they share one signed-in layout; URLs are unchanged.
- `exactOptionalPropertyTypes` was removed from the base compiler settings: Prisma's update inputs are incompatible with it, and the web app compiles the database package's source.
- One `.env` at the repository root; `next.config.ts` loads it for the web app.

Dependencies introduced:

| Dependency | Why |
|---|---|
| next-auth (5.0.0-beta.32) | Sign-in and sessions (ADR-005) |
| zod (in apps/web) | Request validation in routes |

Known gaps, deliberately left:

- GitHub sign-in is wired but untested until an OAuth app's id and secret are in `.env`.
- No rate limiting yet (planned with the AI routes in Phase 4 and the security pass in Phase 12).
- Milestones cannot be reordered from the screen.

### Phase 4 — AI decomposition + Task Reality Check (2026-10-06)

Built:

- **Model client** (`packages/ai`): one `LLMClient` interface; a scripted `fake` adapter for tests; an `openai-compatible` adapter written with `fetch` that serves a hosted free tier or a local model.
- **Validated generation**: every model reply is parsed against a Zod schema, then against semantic checks; one retry that tells the model exactly what was wrong; a second failure is `INVALID_OUTPUT`. One log line per call, with no prompt or reply text.
- **Pipeline**: goal parser → milestone decomposer → task generator (one milestone at a time, each seeing the tasks before it) → draft validation → Task Reality Check. Prompts are versioned files.
- **Task Reality Check**: stage 1 is rules with no model (vague openers, too short, longer than one 90-minute sitting); stage 2 has the model score every task and rewrite or split the weak ones. Verdicts: PASS, REWRITTEN, SPLIT, FLAGGED. If the model is unavailable the rules alone decide and the draft says so.
- **API**: `POST /api/goals/decompose` returns a draft and saves nothing; `POST /api/goals/confirm` validates the reviewed draft again and saves everything in one transaction, recording a `DECOMPOSITION_CONFIRMED` event with what the reviewer accepted, edited, deleted and added; `GET /api/ai/status`. Decompose is rate-limited to six a minute per user.
- **Screens**: "Describe it" entry with a review step showing before and after for rewritten and split tasks, editable titles and minutes, removable tasks and milestones, and tasks of the reviewer's own.
- **Sample mode**: with no model configured, two example sentences return plans written by hand in advance, labelled as samples in the draft. Any other sentence gets an explanation, never an invented plan.
- `pnpm ai:demo "<sentence>"` prints a decomposition in the terminal.

Requirement check (FR-2.1 to FR-2.6):

| Requirement | Result |
|---|---|
| FR-2.1 parse a sentence into a goal | met with the scripted model; **not yet run against a real model** |
| FR-2.2 ordered milestones | same |
| FR-2.3 tasks with duration, priority, dependencies | same; task-level deadlines are left empty by design (milestones carry dates) |
| FR-2.4 schema validation, one retry, clean failure | met |
| FR-2.5 review and confirm before saving | met |
| FR-2.6 Task Reality Check, including "Work on portfolio" → "Choose the three projects to showcase" | met with the scripted model |

Verified: 93 new unit tests and 21 new integration tests (133 unit and 79 integration in total), and by hand in the browser in sample mode: example sentence → review screen with a rewritten task marked → save → goal page with tasks and "waiting on" notes.

**What is not verified.** No real language model has been called. Everything that depends on how a real model behaves (prompt quality, how often replies fail validation, whether a free or small model follows the schema) is untested until a provider is configured. The step planned as "compare providers on ten sentences" has not happened; it needs a free API key or a local model.

Differences from the prompts and decisions made while building:

- **No `replay` adapter yet.** It replays recorded real responses, so it cannot exist before a real model has been used. Sample mode covers the same need (demonstrating without a model) at the pipeline level instead. The replay adapter is still planned for the deployed demo.
- Adapters return raw JSON; schema checking, retry and semantic checks live in one function above them, so behaviour is identical for every model.
- The model never assigns identifiers: milestone and task keys are produced by code.
- A fourth verdict, FLAGGED, covers a task the model passed but a rule or a low score disagrees with. It is shown to the reviewer and not changed.
- Reality-check rewrites count as edits in the `DECOMPOSITION_CONFIRMED` record, since the comparison is between what the model first wrote and what was saved.
- Rate limiting is in memory, per server process.

Dependencies introduced: none beyond `zod`, now also a direct dependency of `packages/ai` and the root (tests).

### Phase 5 — Planning engine (2026-10-07)

Built:

- `packages/planner`: dependency graph (build, cycle detection, topological order, unblocked tasks, downstream count), capacity, scoring with six weighted terms, deterministic ordering with three tie-breakers, capacity fill with a task cap, and a reason sentence for every planned task. All constants are in `weights.ts`.
- `apps/web/server/services/planning.ts`: loads goals, tasks and dependencies, runs the planner, stores the plan, and reports why a plan is empty and which tasks need splitting.
- `GET /api/plan/today` and `POST /api/plan/today/regenerate`.

Requirement check (FR-3.1 to FR-3.6):

| Requirement | Result |
|---|---|
| FR-3.1 dependency resolver with cycle detection | met |
| FR-3.2 capacity calculation | met |
| FR-3.3 deterministic score from pressure, priority, overdue, progress, risk | met; "milestone progress" enters as the tie-break on milestone date, and risk is wired but zero until Phase 10 |
| FR-3.4 scheduler, including 120 min with A=60, B=40, C=30 → A + B | met |
| FR-3.5 at most five tasks, each with a reason | met |
| FR-3.6 plan persisted and regenerated on demand | met |
| FR-3.7 historical execution data | interface in place (`multipliers`), filled in Phase 9 |

Verified: 47 planner unit tests and 17 planning integration tests (180 unit and 96 integration in total). The unit tests include all 13 worked examples from `planning-engine.md` and a property test that checks the seven guarantees (deterministic under shuffling, never over capacity, never blocked, bounded, every task accounted for, every choice explained, input not mutated) on 300 generated inputs. An integration test installs a model that throws if called, proving the planner never touches the AI.

On the seeded internship goal (90 minutes available) the plan is: list past projects (25 min, unblocks 8 tasks), choose three projects to showcase (20 min, unblocks 7), list fifteen companies (45 min, unblocks 5). Sixteen tasks are correctly held back as blocked.

Two test expectations I wrote about reason wording were wrong and were corrected to match the specified rule (largest contribution first); no planner code changed as a result.

Changes from the design are listed in `planning-engine.md` section 10. No dependencies were introduced.

Not built: the Today screen (Phase 6). The plan is reachable through the API only.

### Note on Phase 4

The first call to a real model (Groq) on 2026-10-07 was rejected with HTTP 401: the key saved in `.env` is 54 characters, and Groq keys are 56, so it was most likely cut short when pasted. The AI path is therefore still unverified against a real model.

### Phase 4 follow-up — first run against a real model (2026-10-07)

Provider: Groq free tier, model `openai/gpt-oss-120b`, JSON-object mode.

What it took to get there:

- The key problem was not in NOVA. The first key had been deleted on Groq's side, and a later paste had not been saved to `.env`. Once a live key was on disk, Groq accepted it.
- The model first chosen, `llama-3.3-70b-versatile`, is not available to this account (HTTP 404). The model was changed after listing what the account can use.
- The free tier's per-minute limit was reached on the sixth call of one decomposition. The adapter now waits for the time the provider asks (its `Retry-After` header, or a doubling back-off), up to three times and at most 30 seconds each, before reporting the model as unavailable. Three unit tests cover this.

Result for "I want to learn to cook five dinners by the end of November": a valid draft with 5 milestones and 25 tasks (8.9 hours). Every step passed validation on the first attempt except the reality check, which needed its one retry. Total time about 110 seconds, most of it waiting on the rate limit.

Quality, judged by reading the output (one sentence only, so these are observations, not measurements):

- Good: tasks are concrete and startable; milestones are in a sensible order with realistic dates; durations are plausible.
- Weak: the reality check passed everything, including "Cook remaining four dinners following their recipes · 90 min", which is four sittings and should have been split.
- Weak: every task depends on the one before it, although the prompt asks for real prerequisites only. This would leave the planner one eligible task at a time.
- Weak: the last milestone ("Review & Share" with friends) is not something the sentence asked for.
- Slow: about two minutes per goal on the free tier. The decompose route allows 120 seconds, which is too close.

To do when work resumes: tighten the task-generator and reality-check prompts for the three weak points and bump their versions; run a set of ten sentences rather than one; consider generating all tasks in one call to stay under the rate limit and cut the time.

### AI prompt revision (2026-10-09)

Addressed the weak points from the first real run:

- **One call for all tasks** instead of one per milestone. A decomposition is now four model calls. On Groq's free tier the same sentence went from about 110 seconds to about 13, with no rate-limit waits.
- **Task generator (version 2):** repeated work must be one task per sitting; prerequisites only when a task needs another's result; nothing outside the goal.
- **Decomposer (version 2):** no stages the person did not ask for.
- **Reality check (version 2):** told to split tasks that hide several sittings, with the failing example from the first run included.

Result for the same sentence ("learn to cook five dinners by the end of November"): 5 milestones, 15 tasks, 6.9 hours; each dinner is its own 45-minute task; no invented final stage; 7 of 15 tasks have a prerequisite, where before all but one did. This is still one sentence read by eye, not a measured evaluation. A ten-sentence comparison remains to be done.

### Phase 6 — Daily planner UI (2026-10-09)

Built:

- **Task actions** with routes and a service: start, complete (optionally with minutes spent), reopen, skip for today, postpone (tomorrow by default). Each changes the task and today's plan entry in one transaction and calls a behaviour hook that Phase 8 will fill.
- **Today page**, now the landing page: one focus card with the first task and a large Start button; after starting, the same card offers Done. The rest of the plan sits below as "Then", each with its reason behind a "More" toggle. Handled tasks move to a quiet list with Undo for completions. No overdue list anywhere.
- **Completion feedback** (FR-8.1): a tick that pops with an expanding ring, shown the moment Done is pressed, before the server answers. One reusable component for the game layer to build on. It respects the reduce-motion setting.
- **Empty states** for no goals, nothing eligible, no time today, and everything done; a note for tasks too big for one day.
- The account's timezone now follows the device.

Requirement check:

| Requirement | Result |
|---|---|
| FR-4.1 plan with duration and reason | met |
| FR-4.2 complete, skip, postpone from Today | met, plus start, undo and "already done" |
| FR-4.3 next action obvious, no overdue wall | met |
| FR-8.1 immediate feedback on completion | met for tasks; steps arrive with NOVA START |

Verified: 12 new integration tests, including a whole day from first plan to last task (185 unit and 108 integration in total), and by hand in the browser on desktop and at phone width: start, done with the animation, the list reflowing, undo.

Decisions: "Start" marks the task in progress for now; Phase 7 replaces it with the NOVA START session. Optimistic updates are limited to the completion moment; other actions wait for the server, which is fast enough locally.

### Deployment preparation (2026-10-09)

Added `apps/web/vercel.json`, the `DEMO_SIGNIN` switch, and `docs/deploy.md`. A production build was run locally and checked: with the switch on, the sign-in page offers the demo account; with it off and no GitHub credentials, sign-in is closed; API routes answer 401 without a session. The deployment itself needs the owner's Vercel account and has not been performed.

### Deployed (2026-10-10)

The owner deployed `main` to Vercel with a Neon database: https://nova-one-sand.vercel.app. Checked from outside: the sign-in page loads with the demo sign-in, signed-out visitors are redirected, and the API answers 401 without a session. Every push to `main` redeploys.

### Phase 7 — NOVA START (2026-10-13)

Built:

- **Step writing** (`packages/ai/task-breaker.ts`): at the moment Start is pressed, the model turns the task into 3 to 7 micro-actions of 1 to 5 minutes, the first of which must take 2 minutes at most. Validated and retried like every other model call.
- **"I'm stuck"**: the current step is replaced by one smaller or clearer step, written by the model with the user's optional note about what is in the way. A replacement must be shorter than the step it replaces.
- **Fallbacks**: with no model, an unreachable model, or unusable output, a built-in opener (get it open → find the place → smallest first piece → five more minutes) and a built-in "two-minute timer" replacement are used. Start never fails for lack of a model, and the screen says when the steps are general ones.
- **Session rules** (`packages/behaviour/start-session.ts`): pure functions for done, skip, replace, and sitting length.
- **Service and routes**: open (or resume) a session, act on a step, finish as completed, partial or abandoned. Finishing records the minutes the sitting took; completed finishes the task, partial keeps it in progress and marks today's entry as partly done, abandoned keeps the time and leaves the task open.
- **Screen** (`/start/[taskId]`): full screen, no navigation, one step at a time in large type with one main button, quiet "I'm stuck" and "Skip", progress dots, elapsed minutes shown plainly with no countdown. A reward animation after each step, larger for the first. After the last step: keep going, finish, or stop for now. A closing screen states time spent against the estimate without judgement.
- Today's Start button now opens the session; an in-progress task shows Continue.

Requirement check (FR-5.1 to FR-5.5):

| Requirement | Result |
|---|---|
| FR-5.1 Start opens a session | met; reopening returns the same session |
| FR-5.2 task broken down at start time into 2–5 minute actions, one at a time | met |
| FR-5.3 done / stuck / skip per step | met |
| FR-5.4 stuck gives a smaller or clearer step | met |
| FR-5.5 completion records actual duration and returns to Today | met |
| FR-5.6 adaptive task collapse (blockers) | Phase 9, as planned |

Verified: 20 new unit tests and 17 new integration tests (205 unit and 125 integration in total), including a double tap on Start opening only one session. By hand in the browser against the real model (Groq): Start on "List every project, job and course from the last two years" produced "Open a new blank document" then "Open your LinkedIn profile"; "I'm stuck" with the note "I don't have a LinkedIn profile" produced "Write down any projects, jobs, and courses you remember…", which steps around the obstacle; stopping part-way showed the closing screen and returned to Today with the task marked partly done and the next task in focus.

Decisions:

- Session state uses the `StartSession` table created in Phase 2; no schema change.
- Opening a session takes a per-user database lock, so two simultaneous requests cannot both create one.
- The model call happens before the transaction opens, so nothing is locked while waiting on it.
- A partly finished task is not offered again the same day; it returns to the plan tomorrow, still in progress, with its time recorded.

Not built: friction is not yet recorded or passed to the step writer (Phase 8), and steps earn no points yet (Phase 8b).

### Phase 8 — Behaviour tracking (2026-10-13)

Built:

- **Events** (`packages/behaviour/events.ts`): pure builders for the nine execution events. Each carries a snapshot of the task at that moment (estimate, kind of work, energy, size, postponements, starts) and the hour and weekday where the user is.
- **Hooks filled in**: creating, starting, completing, skipping and postponing a task each record their event in the same transaction as the change. A completion also records an overrun at 25% over the estimate or an underrun at 25% under. A task ticked off without timing records the completion alone; no duration is inferred.
- **Abandonment**, two ways: the third postponement of a task records it once; a task started and then left when its day ends records it at day close.
- **Day closing** (`closePastDays`): entries still pending from earlier days become missed, or completed if the task was finished elsewhere. It runs when the user next opens Today, not on a timer, and acts only on pending entries, so repeating it or running it twice at once changes nothing.
- **Friction**: `POST /api/tasks/:id/friction` stores one of the seven reasons with an optional note, plus its event. The "what got in the way?" sheet appears after "Not today" and "Tomorrow", for up to two tasks missed on an earlier day, and as optional chips under "I'm stuck" in NOVA START. One tap, always dismissible.
- **Friction feeds the step writer**: when a session opens, the task's recent friction is passed to the model as short labels. The user's notes are never sent.
- **Summary**: `GET /api/behaviour/summary` returns counts by event, estimate against actual by kind of work, and friction by reason. The dashboard shows a short "What NOVA has noticed" card from it, and holds back any timing statement until at least three timed completions exist.

Requirement check (FR-6.1 to FR-6.4):

| Requirement | Result |
|---|---|
| FR-6.1 the nine events | met |
| FR-6.2 estimate vs actual, postponements, starts, friction, time and context | met |
| FR-6.3 ask "what's stopping you?" with seven options | met |
| FR-6.4 failure, postponement, abandonment and friction kept distinct | met (missed, skipped, postponed, abandoned-left, abandoned-postponed are all separate) |

Verified: 16 new unit tests and 20 new integration tests (221 unit and 145 integration in total), including the specification's own example (estimated 35, actual 55 → ratio 1.57 and an overrun) and a simulated week whose summary is checked figure by figure. By hand in the browser: "Not today" brought up the sheet, one tap recorded the reason, and the dashboard card appeared.

One real bug found by the tests and fixed: the question about a missed task never appeared, because the task's fresh entry in today's plan hid yesterday's missed one. The lookup now considers earlier days only.

Decisions:

- `TASK_COMPLETED` allows an unknown duration (null) so that ticking a task off does not invent data.
- Nothing here changes the plan yet. Events and friction are recorded and described; acting on them is Phase 9.
- The summary describes; it does not claim patterns. Minimum sample sizes and smoothing belong to the execution model.

No dependencies were introduced and the schema did not change.
