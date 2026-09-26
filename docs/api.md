# devgrowth-cloud HTTP API (v1)

All request and response bodies are JSON. The event format (types, payloads, and derivation rules) is specified in `devgrowth-core`'s [`SYNC_API.md`](https://github.com/EhDohWah/devgrowth/blob/main/packages/core/SYNC_API.md). This file covers the transport only.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "invalid_event", "message": "1 event(s) failed validation", "details": [ ... ] } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `validation_error` | The body, query or params don't match the route schema. Unknown fields are stripped, not rejected. |
| 400 | `invalid_event` | An event failed `validateEvent`. `details` is `[{ index, id, errors[] }]`. |
| 401 | `unauthorized` | No credentials, or the token is unknown, revoked or expired. |
| 401 | `invalid_credentials` | Wrong email or password. The response is the same for both, so it doesn't reveal which accounts exist. |
| 403 | `csrf_required` | A cookie-authenticated `POST`/`PUT`/`DELETE` request without `X-Requested-With: devgrowth-web`. |
| 404 | `not_found` | Unknown route or device. |
| 409 | `email_taken` | The email is already registered. Comparison is case-insensitive. |
| 429 | `rate_limited` | Too many register or login attempts from one IP. The default is 10 per minute. |
| 503 | `db_unavailable` | Returned by `/health` only. |

## Authentication

Each login creates a **device** with its own token. Revoking a device logs out only that device.

- **CLI:** `kind: "cli"`. The token is returned in the response body, and the client sends `Authorization: Bearer <token>`. It stays valid until it is revoked.
- **Web:** `kind: "web"`. The token is set as the `dg_session` cookie (`HttpOnly`, `SameSite=Strict`, and `Secure` when `COOKIE_SECURE=true`) and is never included in a body. The session lasts 30 days. Unsafe methods must also send `X-Requested-With: devgrowth-web`.

The server stores only the SHA-256 hash of each token.

## Endpoints

### `GET /health`
`200 { "status": "ok" }`, or `503` if the database is unreachable.

### `POST /v1/auth/register` and `POST /v1/auth/login`
Request:
```json
{ "email": "you@example.com", "password": "8-72 chars", "deviceName": "work-laptop", "kind": "cli" }
```
`kind` is `cli` (the default) or `web`.

Response:
- register → `201`, login → `200`.
- Body: `{ "userId", "deviceId", "token" }`. For web logins, `token` is omitted and the cookie is set instead.

### `POST /v1/auth/logout` (auth)
Revokes the calling device and clears the cookie. Returns `204`.

### `GET /v1/me` (auth)
```json
{
  "user": { "id": "…", "email": "you@example.com" },
  "device": { "id": "…", "name": "work-laptop", "kind": "cli" },
  "eventCount": 42,
  "schemaVersion": 1
}
```
- `eventCount === 0` tells a client on first login that it should push a `baseline` event.
- A client whose `SCHEMA_VERSION` is lower than `schemaVersion` should prompt the user to update.

### `GET /v1/devices` (auth)
Returns `{ "devices": [{ id, name, kind, createdAt, lastSeenAt, expiresAt, current }] }`. Only active devices are listed, oldest first.

### `DELETE /v1/devices/:id` (auth)
Revokes one of the caller's devices and returns `204`. It returns `404` if the device is unknown, already revoked, or belongs to another user.

### `POST /v1/events` (auth)
Request: `{ "events": [ <1–500 events> ] }`.

The push is **all or nothing**: if any event fails `validateEvent`, the response is `400 invalid_event` and nothing is stored.

It is also **idempotent**: an id this user has already pushed is reported in `duplicates`, not treated as an error, so clients can safely retry after a timeout.

```json
{ "accepted": ["<id>", …], "duplicates": ["<id>", …] }
```
Ids are lowercased. Event ids are scoped per user.

### `GET /v1/events?since=<cursor>&limit=<1-1000>` (auth)
```json
{
  "events": [{ "serverSeq": 17, "id": "…", "deviceId": "…", "type": "session", "v": 1, "payload": { … }, "occurredAt": "2026-08-10T14:30:00.000Z" }],
  "nextCursor": 17,
  "hasMore": false
}
```
Start with `since=0` and store `nextCursor` after each page. Keep pulling while `hasMore` is true.

**The cursor never skips a row.** The server serializes each user's pushes with a transaction-scoped advisory lock, so that user's `serverSeq` values become visible in increasing order.

Events come back in `serverSeq` (arrival) order. Clients must replay them with `deriveState`, which sorts them by `occurredAt`.
