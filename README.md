# NOVA — Adaptive Goal Execution Engine

NOVA transforms long-term goals into adaptive daily execution plans. Unlike traditional task managers, NOVA separates AI reasoning from deterministic planning: the LLM interprets goals and generates structured work, while a planning engine considers deadlines, dependencies, available capacity and behavioural data to determine what should happen each day.

NOVA goes one step further: its planner does not stop when it gives the user a task. NOVA helps the user start the task, detects friction when execution fails, and adapts future plans based on how the user actually works.

> **Status: in progress.** Setup, architecture and the database layer are complete. No user-facing features yet. See [docs/PROGRESS.md](docs/PROGRESS.md).

## Core loop

```
USER GOAL
    │
    ▼
AI DECOMPOSITION
    │
    ▼
MILESTONE GRAPH
    │
    ▼
TASK GRAPH
    │
    ▼
DETERMINISTIC PLANNER
    │
    ▼
DAILY PLAN
    │
    ▼
NOVA START
    │
    ▼
USER ACTION
    │
    ▼
BEHAVIOURAL DATA
    │
    ▼
FRICTION ANALYSIS
    │
    ▼
REPLANNING
    │
    ▼
PERSONAL EXECUTION MODEL ──────► NEXT PLAN
```

## The rule the architecture is built on

The LLM understands the problem; the software determines the plan.

- The LLM interprets language and proposes structured goals, tasks and micro-actions.
- Every LLM output is schema-validated before it enters the application.
- Scheduling, replanning, projection and simulation are pure, deterministic, unit-tested functions. The LLM never chooses the schedule and never writes to the database.

## Repository layout

```
apps/web/            Next.js application (UI and thin API routes)
packages/types/      Domain types and validation schemas
packages/database/   Prisma client and typed queries
packages/ai/         LLM client and structured-output pipelines
packages/planner/    Deterministic planning engine (pure)
packages/behaviour/  Behaviour events, friction, personal execution model (pure)
packages/simulation/ Goal projection, what-if, scope reduction, rescue (pure)
tests/               Cross-package and end-to-end tests
docs/                Specification, plan, architecture, decisions
prisma/              Database schema and migrations
```

`planner`, `behaviour` and `simulation` may import `@nova/types` only. A lint rule enforces this.

## Running locally

Requires Node.js 22 or newer, pnpm (`corepack enable pnpm`) and PostgreSQL 17.

One-time database setup on macOS:

```bash
brew install postgresql@17
brew services start postgresql@17
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
psql -d postgres -c "CREATE ROLE nova LOGIN PASSWORD 'nova' CREATEDB"
createdb -O nova nova
createdb -O nova nova_test
```

Then:

```bash
cp .env.example .env
pnpm install          # also generates the database client
pnpm db:migrate       # create the tables
pnpm db:seed          # one demo user with the example goal
pnpm dev              # http://localhost:3000
```

Checks:

```bash
pnpm test             # unit tests, then integration tests against nova_test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm db:studio` opens a browser view of the database.

## Documentation

- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Planning engine](docs/planning-engine.md)
- [Momentum, the game layer](docs/game-layer.md)
- [Decision records](docs/decisions/README.md)
- [Build plan](docs/NOVA_PLAN.md)
- [Phase prompts](docs/NOVA_PROMPTS.md)
- [Progress](docs/PROGRESS.md)
- [Development rules](CLAUDE.md)

## Licence

MIT
