# ADR-006 — PostgreSQL installed natively, not in Docker

Status: proposed — awaits the developer's choice between local and hosted

## Context
The plan's Phase 2 prompt assumed `docker-compose`. The development Mac has 8 GB of memory and no Docker; Docker Desktop alone would take a large share of that alongside the dev server and a browser.

## Decision
Assumed: PostgreSQL installed with Homebrew and run as a background service, with two databases, `nova` and `nova_test`. The alternative with nothing to install is a free hosted PostgreSQL database; the code is identical either way because only `DATABASE_URL` changes. The deployed app uses a hosted database in both cases.

## Alternatives considered
- Docker: reproducible, too heavy for this machine.
- SQLite for development: different behaviour from production (dates, JSON, constraints); the planner's queries should be tested on the real engine.

## Consequences
- Setup is one install command and is documented in the README.
- Integration tests need the local service running.
