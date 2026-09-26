# devgrowth-cloud

The sync API, and later the web dashboard, for the [devgrowth CLI](https://github.com/EhDohWah/devgrowth). It lets every device that runs `devgrowth` share the same sessions, streaks, milestones and config.

- **server/**: Fastify + Postgres. It is a per-user event store, and it never computes stats itself.
- **web/**: a Vue 3 dashboard (coming in step 4). Fastify serves it from the same origin.

Both sides replay events through [`devgrowth-core`](https://github.com/EhDohWah/devgrowth/tree/main/packages/core), so the CLI, the server and the dashboard all agree on the numbers. The API is documented in [`docs/api.md`](docs/api.md).

## Requirements

- Node.js 22+
- Docker, for Postgres. An existing Postgres 16 also works if you point `DATABASE_URL` at it.

## Setup

```bash
docker compose up -d                  # Postgres on localhost:5433 (dev + test databases)
cp server/.env.example server/.env
npm install
npm run migrate
npm run dev                           # http://localhost:3000, restarts on file changes
```

Then check it:
```bash
curl localhost:3000/health            # {"status":"ok"}
```

## Tests

```bash
npm test
```

The tests run against the **real** Postgres test database (`TEST_DATABASE_URL`, which defaults to `devgrowth_test` on port 5433). They truncate every table, so the helper refuses to run against any database whose name doesn't end in `_test`.

## Working on `devgrowth-core` at the same time

`devgrowth-core` lives in the CLI repo, under `packages/core`. To test unpublished core changes here, link it:

```bash
# in the devgrowth (CLI) repo
cd packages/core && npm link
# in this repo
npm link devgrowth-core
```

Run `npm install` to switch back to the published version.

**Release order:**
1. Publish `devgrowth-core`.
2. Bump it here and deploy.
3. Release the CLI.

Bump core's **major** version for any change that makes existing events derive differently.

## Configuration (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | none | Required. |
| `TEST_DATABASE_URL` | `…/devgrowth_test` | Must name a `*_test` database. |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Use `HOST=0.0.0.0` in a container. |
| `BCRYPT_ROUNDS` | `12` | Password hashing cost. |
| `COOKIE_SECURE` | `false` | Set to `true` behind HTTPS in production. |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy so rate limiting sees real client IPs. |
| `WEB_DIST` | `../web/dist` | The built dashboard. It is served at `/` if `index.html` exists. |
