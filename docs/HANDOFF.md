# NOVA — Handoff

Read this first when picking NOVA up in a new session, with any AI tool or as a person. It is the shortest path from "nothing in context" to "can safely do the next phase". Keep it current: update the **Current state** section at the end of every phase, in the same commit as `PROGRESS.md`.

## To resume in a new Claude Code session

Open a session in `~/nova` and say:

> Continue NOVA. Read `docs/HANDOFF.md`, then `docs/PROGRESS.md`, and carry on with the next unchecked phase.

`CLAUDE.md` (loaded automatically) points here too.

## Current state

*Last updated: 2026-10-14, during Phase 9.*

- **Done, merged to `main`, live:** Phases 0–8b. See the checklist at the top of `PROGRESS.md`.
- **In progress:** Phase 9, adaptive replanning, on branch `feature/replanning`. Check `git log main..feature/replanning` and the Phase 9 entry in `PROGRESS.md` (if present) to see how far it got.
- **Next after that:** Gate B review (fail three tasks with three different reasons on purpose, check the plan changes, write `docs/demo.md`), then Phase 10 (goal health).
- **Known open items:**
  - Gate A still needs a full walkthrough on the live site from an empty account (owner's task).
  - The Phase 8b screens (Ember, level strip, spark pop-ups, badges, boss bars) have never been looked at in a browser.
  - Phase 4 prompts were tuned on one sentence only; a ten-sentence comparison is still to do.
  - FR-5.6 (blocker sub-graph from inside NOVA START) belongs to Phase 9 and may not be built yet; check `PROGRESS.md`.

## What NOVA is, in five lines

An adaptive goal-execution app. A person types a goal; an LLM proposes milestones and tasks, which the person reviews; a **deterministic, pure planner** picks today's tasks within their available minutes; **NOVA START** turns a task into 2–5 minute steps; every action is recorded as a behaviour event; friction answers and real durations feed back into planning. A game layer (sparks, levels, momentum) rewards starting and never takes anything away. Full spec: `product-spec.md`. Architecture: `architecture.md`.

**The rule everything hangs on:** the LLM proposes, deterministic code decides. The LLM never writes to the database and never chooses the schedule. `planner`, `behaviour` and `simulation` are pure (no clock, no randomness, no I/O); a lint rule enforces it, and the planner may not even import `behaviour`.

## Where things live

| Path | What |
|---|---|
| `apps/web/app/(app)/` | Signed-in screens: `today`, `goals`, `dashboard` |
| `apps/web/app/start/[taskId]` | NOVA START, full screen |
| `apps/web/app/api/` | HTTP routes; thin: parse → `requireUser()` → one service |
| `apps/web/server/services/` | Orchestration: load data, call pure packages / AI, write in one transaction |
| `apps/web/server/hooks/behaviour.ts` | Writes a behaviour event for every task change, in the same transaction |
| `packages/types` | Zod schemas, the only source of types |
| `packages/database` | Prisma client and user-scoped queries (only package touching the DB) |
| `packages/ai` | LLM client, prompts (versioned, in `src/prompts/`), validated generation with one retry |
| `packages/planner` | `generateDailyPlan` and friends; spec with worked examples in `planning-engine.md` |
| `packages/behaviour` | Events, friction, session rules, summary, Momentum game logic |
| `tests/` | Unit tests by area; `tests/integration/` runs against a real PostgreSQL test DB |
| `docs/` | Spec, plan, architecture, decisions (ADRs), progress, deploy guide, this file |

## How each phase is done (the working routine)

1. `git checkout main && git pull`, then `git checkout -b feature/<name>`.
2. Read the phase's prompt in `NOVA_PROMPTS.md` and its requirements (FR-x.y) in `NOVA_PLAN.md` §3.
3. Build in small commits. Pure logic first with unit tests, then service and routes with integration tests, then screens.
4. Check: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
5. Look at it in a browser (`pnpm dev`, then "Continue as demo user" at http://localhost:3000). Put the demo data back afterwards if the test changed it.
6. Append a phase entry to `PROGRESS.md` (built / requirement check / verified / decisions / not built), tick the box, update the README status line and the **Current state** section above.
7. Merge to `main`, push. Vercel deploys `main` automatically in 1–2 minutes; confirm a new route answers `401` (not `404`) at https://nova-one-sand.vercel.app.

Commit messages end with a `Co-Authored-By` line when written by an AI tool. Never commit `.env`.

## Environment facts (the owner's Mac)

- **Repo:** `~/nova`, GitHub `sughraazim2008/NOVA` (public). Owner merges are welcome but the routine above merges and pushes each phase.
- **Machine:** Apple M1, **8 GB memory**. Tests and lint can stall for many minutes when memory runs short or the laptop sleeps. If a run is slow or a test times out, compare CPU time with wall time (`time pnpm test`) and re-run the failing file alone before believing it is a real failure.
- **pnpm** comes from corepack shims in `/opt/homebrew/bin`. **TypeScript is pinned to 6.x** (typescript-eslint does not support 7). **Prisma is 7.x** (npm `latest` has pointed at an 8.0 release candidate; do not upgrade by accident).
- **PostgreSQL 17** via Homebrew, running as a service. Role `nova`, password `nova`, databases `nova` (dev) and `nova_test` (integration tests, emptied on every run). Connection strings in `.env`.
- **AI:** Groq free tier, `LLM_MODEL="openai/gpt-oss-120b"`, `LLM_JSON_MODE="object"`, key in `.env` as `LLM_API_KEY`. A decomposition is four calls, about 15 seconds. `llama-3.3-70b-versatile` is *not* available on this account (404). With no key set, the app runs in sample mode.
- **Never type, paste or print API keys.** Check a key's shape and validity without showing it. The owner pastes keys into `.env` and Vercel themselves.
- **When a config change "isn't working"**, check whether the file was actually saved (its modification time) before anything else.
- **Deployment:** Vercel project `nova` under the owner's account, Neon Postgres attached, `DEMO_SIGNIN=true` (one shared demo account; anyone with the address can use it). Steps and troubleshooting in `deploy.md`.

## Gotchas already paid for

- Next.js 16: route `params` are a Promise; read the bundled docs in `node_modules/next/dist/docs/` before using an unfamiliar API.
- `next-auth` is the 5.x beta, pinned exactly. Sessions are JWTs; `requireUser()` is the only way to get the user.
- One `.env` at the repo root; `next.config.ts` loads it for the web app.
- Integration tests mock only `@/server/auth/session`; everything below is real. `setLLMForTests()` swaps the model.
- Planner determinism is tested by shuffling inputs; keep every sort fully ordered (ties broken by id).
- Momentum sparks only never decrease because events are recorded at the time they happen; do not back-date events.
- The browser preview tool in the Claude desktop app sometimes loses the dev server ("Dev servers are not available"); starting it again works.
