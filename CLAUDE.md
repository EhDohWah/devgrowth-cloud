# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

This repo is the cloud half of devgrowth:
- a Fastify + Postgres sync API (`server/`).
- a Vue 3 dashboard (`web/`, step 4), which Fastify serves in production.

The CLI lives in a separate repo, `EhDohWah/devgrowth`. Both repos depend on the **`devgrowth-core`** npm package, whose source is in that repo under `packages/core`. It provides `validateEvent`, `SCHEMA_VERSION` and `deriveState`. **Never copy core logic into this repo.** Every client must replay events through the identical reducers, or the numbers drift between devices.

## Commands

```bash
docker compose up -d        # Postgres 16 on :5433, creates devgrowth + devgrowth_test
npm install                 # root workspace; installs server deps
npm run migrate             # applies server/migrations/*.sql not yet in schema_migrations
npm run dev                 # node --watch server/src/server.js
npm test                    # node:test against the real devgrowth_test database
```

Single file or test (from `server/`):

```bash
node --test tests/events.test.js
node --test --test-name-pattern="idempotent" tests/events.test.js
```

The tests use `node:test`, not Jest. They need no mocking, run ESM natively, and need no `--experimental-vm-modules` flag. Files run with `--test-concurrency=1` because every test truncates the shared test database.

## Architecture

- **`server/src/app.js`**: `buildApp({ pool, config })` builds the app without listening. Tests call `app.inject()` on it, and `server.js` is the only place that listens. It owns the global error handler, which returns every error as `{ error: { code, message, details? } }`. Throw `HttpError(status, code, message, details)` from `errors.js` rather than building replies by hand.
- **`server/src/auth.js`**: `createAuthenticate(pool)` is the `preHandler` that protects routes. It accepts a CLI Bearer token or the web `dg_session` cookie. Cookie requests with unsafe methods must send `X-Requested-With: devgrowth-web` (the CSRF guard). Tokens are stored only as SHA-256 hashes (`tokens.js`).
- **Routes** (`server/src/routes/*.js`) are Fastify plugins that receive `{ pool, authenticate, config }`. Validate request shapes with JSON schema in the route options. Fastify's default validator **strips** unknown fields rather than rejecting them.
- **Migrations** are plain SQL files in `server/migrations/`, applied in filename order, each in its own transaction. Never edit an applied migration; add `002_*.sql` instead.

### Event store invariants (preserve these)

- **Validation is all or nothing.** `POST /v1/events` runs every event through core's `validateEvent` before inserting any of them.
- **Idempotency key is `(user_id, id)`.** The insert uses `ON CONFLICT DO NOTHING`, so a retried push reports `duplicates` instead of double-counting.
- **The per-user advisory lock around inserts is load-bearing.** `server_seq` is assigned at insert time but becomes visible at commit. Without `pg_advisory_xact_lock(hashtextextended(user_id::text, 0))`, two concurrent pushes can commit out of order, and a cursor-based puller skips a row forever. The test `a push waits for an in-flight push by the same user` fails if the lock is removed.
- **The server never derives stats.** Clients do that with `deriveState`. Don't add endpoints that compute streaks server-side.

## `devgrowth-core` dependency

- Until `devgrowth-core` is published, `npm install` fails with a 404 for it. Link the local copy as the README describes.
- No `package-lock.json` is committed yet, because it can't include core until core is on npm. Generate and commit it right after the first publish.
