# NOVA — Progress

Build order and exit gates: [NOVA_PLAN.md §8](NOVA_PLAN.md). Update this file at every phase close-out.

- [x] Phase 0 — Project setup
- [x] Phase 1 — Architecture (reviewed and approved)
- [x] Phase 2 — Database + domain model
- [x] Phase 3 — Goal system
- [x] Phase 4 — AI decomposition + Task Reality Check (built; real-model check pending a provider)
- [ ] Phase 5 — Planning engine
- [ ] Phase 6 — Daily planner UI
- [ ] Phase 7 — NOVA START
- [ ] **Gate A — Working Loop demo**
- [ ] Phase 8 — Behaviour tracking
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
