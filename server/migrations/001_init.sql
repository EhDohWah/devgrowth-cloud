-- Initial schema: users, their devices (one revocable token each), and the
-- per-user append-only event store that every client syncs against.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Every login creates a device. Only the SHA-256 hash of its token is stored,
-- so a database leak does not leak usable tokens.
CREATE TABLE devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('cli', 'web')),
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  -- NULL for CLI devices (valid until revoked); web sessions expire.
  expires_at   timestamptz,
  revoked_at   timestamptz
);

CREATE INDEX devices_user_id_idx ON devices (user_id);

CREATE TABLE events (
  -- Pull cursor. Inserts for one user are serialized with an advisory lock
  -- (see routes/events.js), so a user's server_seq values commit in order and
  -- `WHERE server_seq > cursor` can never skip a row.
  server_seq  bigserial NOT NULL UNIQUE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Client-generated UUID: the idempotency key for pushes. Scoped per user
  -- so one account can never shadow another account's event ids.
  id          uuid NOT NULL,
  device_id   uuid NOT NULL REFERENCES devices(id),
  type        text NOT NULL CHECK (type IN ('session', 'review', 'milestone_check', 'config_snapshot', 'baseline')),
  v           integer NOT NULL,
  payload     jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX events_user_seq_idx ON events (user_id, server_seq);
