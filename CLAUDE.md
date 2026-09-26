# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

This repo is the cloud half of devgrowth:
- a Fastify + Postgres sync API (`server/`).
- a Vue 3 dashboard (`web/`), which Fastify serves in production from `web/dist`.

The CLI lives in a separate repo, `EhDohWah/devgrowth`. Both repos depend on the **`devgrowth-core`** npm package, whose source is in that repo under `packages/core`. It provides `validateEvent`, `SCHEMA_VERSION` and `deriveState`. **Never copy core logic into this repo.** Every client must replay events through the identical reducers, or the numbers drift between devices.

## Commands

```bash
docker compose up -d        # Postgres 16 on :5433, creates devgrowth + devgrowth_test
npm install                 # root workspace; installs server + web deps
npm run migrate             # applies server/migrations/*.sql not yet in schema_migrations
npm run dev                 # node --watch server/src/server.js
npm run dev:web             # Vite on :5173, proxies /v1 and /health to :3000
npm run build               # web/dist, which the server hosts at /
npm test                    # server (node:test, real devgrowth_test DB), then web (vitest + jsdom)
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

### Dashboard (`web/`)

The dashboard is **just another sync client**, not a view over server-computed data.

- **`stores/events.js`**
  - Pulls `/v1/events` from a cursor.
  - Exposes `state = deriveState(events)` from `devgrowth-core`, so its numbers match `devgrowth status` exactly.
  - Never compute stats any other way.
- **Edits are events.** `addEvent()` validates with core's `assertValidEvent`, applies the event optimistically, and rolls it back if the push fails.
  - Milestones push `milestone_check`, which is irreversible, so the UI asks for confirmation first.
  - Settings pushes a `config_snapshot` holding the **full** config, because snapshots are last-writer-wins, not merges.
- **Dates:** anything that decides "which day or week is this" goes through core's `getSessionDate`, `getWeekStart` and `toDateKey`, exactly as the CLI does. For example, 02:00 on Tuesday is Monday's session.
- **`api.js`:**
  - Always sends `X-Requested-With: devgrowth-web`; the server requires it for cookie writes.
  - A 401 from anything except `/v1/auth/*` and `/v1/me` triggers the global sign-out redirect.
- **User-written text** (log messages, resources) is rendered with `{{ }}`, **never `v-html`**.
- **Styling:**
  - Plain CSS tokens are in `src/styles.css`. The dark theme is set with `prefers-color-scheme`.
  - The chart color `--series-1` comes from the dataviz reference palette and was validated against both surfaces.
  - Grid children need `min-width: 0` (already set on `.stack`, `.grid-3` and `.grid-4`). Without it, the chart's SVG widens the page on phones.
- **Tests:**
  - `web/tests/` uses `vi.mock('../src/api.js')`, then dynamic imports, and `setActivePinia(createPinia())` in `beforeEach`.

## `devgrowth-core` dependency

- `devgrowth-core` is installed from npm (pinned in `package-lock.json`). To test unpublished core changes, `npm link` the CLI repo's `packages/core` as the README describes, then run `npm install` to go back to the published version. Never commit a lockfile generated while core was linked.
- **Release order:** publish a new `devgrowth-core` first, then bump the range in `server/package.json` and `web/package.json`, run `npm install` to update the lockfile, and deploy.
