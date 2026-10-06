# ADR-003 — Zod schemas as the single source of types

Status: accepted (2026-10-06)

## Context
The same shapes are needed in four places: API input validation, LLM output validation, JSON columns in the database, and TypeScript types. Writing them separately guarantees drift.

## Decision
Every domain shape is a Zod schema in `@nova/types`; TypeScript types are inferred from it. API routes, AI pipelines and JSON column reads and writes all parse with the same schema.

## Alternatives considered
- Hand-written interfaces plus ad hoc checks: no runtime guarantee.
- Types generated from Prisma only: covers tables, not API inputs, LLM outputs or JSON payloads.

## Consequences
- One runtime dependency in the lowest package.
- Prisma's generated types and the Zod schemas describe the same tables; a test asserts they agree.
