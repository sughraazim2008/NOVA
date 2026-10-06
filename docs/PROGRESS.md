# NOVA — Progress

Build order and exit gates: [NOVA_PLAN.md §8](NOVA_PLAN.md). Update this file at every phase close-out.

- [x] Phase 0 — Project setup
- [x] Phase 1 — Architecture (reviewed and approved)
- [ ] Phase 2 — Database + domain model
- [ ] Phase 3 — Goal system
- [ ] Phase 4 — AI decomposition + Task Reality Check
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
