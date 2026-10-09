# Deploying NOVA for review

This puts the current `main` branch on a public address so it can be tried from any device. It uses Vercel for the app and a hosted PostgreSQL database, both on free plans.

Status: the production build and its sign-in behaviour were checked locally on 2026-10-09. The steps on Vercel itself have **not** been run by the author of this file, because they need the owner's account. Expect to adjust a detail or two.

## What the repository already contains

- `apps/web/vercel.json`: installs from the repository root, applies database migrations, then builds the web app.
- `DEMO_SIGNIN`: when `"true"`, the one-click demo sign-in stays available in the production build.
- `prisma.config.ts` uses `DATABASE_URL_UNPOOLED` for migrations when the host provides it.
- The account timezone follows the device, so "today" is right wherever it is opened.

## Steps

1. **Sign in to vercel.com with GitHub** and allow it to see the `NOVA` repository.
2. **Add New → Project → import `NOVA`.**
3. Set **Root Directory** to `apps/web`. Leave the framework as Next.js and do not change the build settings; `vercel.json` supplies them.
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `AUTH_SECRET` | a long random string; `openssl rand -base64 32` in a terminal prints one |
   | `DEMO_SIGNIN` | `true` |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1` |
   | `LLM_PROVIDER` | `openai-compatible` |
   | `LLM_BASE_URL` | `https://api.groq.com/openai/v1` |
   | `LLM_MODEL` | `openai/gpt-oss-120b` |
   | `LLM_JSON_MODE` | `object` |
   | `LLM_API_KEY` | the Groq key |

5. Press **Deploy**. This first build is expected to **fail** at the migration step, because there is no database yet.
6. In the project, open **Storage → Create Database → Neon (Postgres)**, accept the free plan, and connect it to this project for all environments. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.
7. Open **Deployments**, choose the failed one, and **Redeploy**.
8. Open the address Vercel shows, press **Continue as demo user**, and create a goal.

Every later `git push` to `main` redeploys automatically.

## Things to know

- **The demo account is shared.** Anyone who has the address can sign in to it, read what is in it, and use the Groq quota. Do not share the address widely and do not put private goals in it. To close it, delete `DEMO_SIGNIN` and redeploy.
- **Real accounts** need a second GitHub OAuth app whose callback is `https://<the address>/api/auth/callback/github`, with its id and secret added as `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.
- **The database starts empty.** The demo user is created on first sign-in with no goals. `pnpm db:seed` run locally with `DATABASE_URL` set to the hosted connection string adds the example goal.
- **Goal text is sent to Groq** when a goal is described in a sentence.
- **Limits on the free plans:** a request may run for 60 seconds, which a decomposition (about 15 seconds) fits; the database sleeps when idle, so the first request after a pause is slow.
- Rate limiting is per server instance, so it is weaker on a platform that runs several.

## If the build fails

| Message | Likely cause |
|---|---|
| `DATABASE_URL` missing, or cannot reach database | Step 6 not done, or the database is not connected to this environment |
| `pnpm` version or lockfile errors | `ENABLE_EXPERIMENTAL_COREPACK` not set to `1` |
| Cannot find `packages/database/src/generated` | The install step did not run from the repository root; check Root Directory is `apps/web` and the build settings were not overridden |
| Sign-in page says "Sign-in is not configured" | `DEMO_SIGNIN` is not `true`, or it was added after the build; redeploy |
| Redirect loop or "UntrustedHost" on sign-in | `AUTH_SECRET` missing |
