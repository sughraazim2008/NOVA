# ADR-005 — Auth.js with signed-token sessions

Status: accepted (2026-10-06) — GitHub sign-in

## Context
Every record belongs to a user. A PWA and later a native app must authenticate against the same API. The data model should stay small.

## Decision
Auth.js (NextAuth) with the JWT session strategy: the session is a signed token, so no session or account tables are needed, and a native client can send the same token as a bearer header. Assumed provider: GitHub OAuth. On first sign-in a `User` row is created from the verified email. A development-only sign-in for the seeded user is enabled when `NODE_ENV` is not `production`, so tests and local work need no OAuth round trip.

One helper, `requireUser()`, is the only way a route obtains the current user.

## Alternatives considered
- Email and password: NOVA would store password hashes and own reset flows; more risk for no product value.
- Database sessions: adds tables and a lookup per request; revocation is the only gain.
- A hosted auth service: another account and dependency.

## Consequences
- Tokens cannot be revoked individually before expiry; kept short-lived.
- Adding Google or an email link later is configuration, not redesign.
