# ADR-001 — pnpm monorepo with pure logic packages

Status: accepted (2026-10-06)

## Context
NOVA's value is in its planning, behaviour and simulation logic. In a single Next.js app that logic ends up inside route handlers and components, where it cannot be tested in isolation and cannot be reused by a mobile client.

## Decision
One pnpm workspace: `apps/web` plus `packages/{types, database, ai, planner, behaviour, simulation}`. `planner`, `behaviour` and `simulation` contain only pure functions and may import `@nova/types` (and `simulation` may import `planner`). A lint rule fails the build on a forbidden import, `Date.now()`, `Math.random()` or `fetch` in those packages.

## Alternatives considered
- Single app with a `lib/` folder: simpler, but the boundary is a convention nobody enforces.
- Turborepo or Nx on top: caching is not needed at this size; add later if builds get slow.

## Consequences
- Logic is testable with plain data and reusable in a native app.
- Packages ship TypeScript source; Next compiles them (`transpilePackages`). No build step per package.
- Slightly more setup and import ceremony.
