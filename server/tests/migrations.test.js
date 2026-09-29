import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.js';
import { createTestPool, resetDb } from './helpers.js';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

let pool;

before(async () => { pool = await createTestPool(); });
after(async () => { await pool.end(); });
beforeEach(async () => { await resetDb(pool); });

async function seedUserAndDevice() {
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ('m@example.com', 'x') RETURNING id`);
  const { rows: [device] } = await pool.query(
    `INSERT INTO devices (user_id, name, kind, token_hash) VALUES ($1, 'd', 'cli', $2) RETURNING id`,
    [user.id, randomUUID()]);
  return { userId: user.id, deviceId: device.id };
}

function insertEvent({ userId, deviceId }, type) {
  return pool.query(
    `INSERT INTO events (user_id, id, device_id, type, v, payload, occurred_at)
     VALUES ($1, $2, $3, $4, 1, '{}', now())`,
    [userId, randomUUID(), deviceId, type]);
}

describe('migrations', () => {
  test('are recorded once each and a second run applies nothing', async () => {
    assert.deepEqual(await migrate(pool), []);
    const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    assert.deepEqual(rows.map(r => r.name), ['001_init.sql', '002_session_delete_edit.sql']);
  });

  test('events.type accepts every event type, including session_delete and session_edit', async () => {
    const ctx = await seedUserAndDevice();
    for (const type of ['session', 'review', 'milestone_check', 'config_snapshot', 'baseline', 'session_delete', 'session_edit']) {
      await insertEvent(ctx, type);
    }
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM events');
    assert.equal(rows[0].n, 7);
  });

  test('events.type still rejects anything else, under a single CHECK', async () => {
    const ctx = await seedUserAndDevice();
    await assert.rejects(insertEvent(ctx, 'session_undelete'), /events_type_check/);
    const { rows } = await pool.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'events'::regclass AND contype = 'c'`);
    assert.deepEqual(rows.map(r => r.conname), ['events_type_check']);
  });

  test('002 upgrades a database that already holds events, keeping them', async () => {
    const ctx = await seedUserAndDevice();
    await insertEvent(ctx, 'session');
    await insertEvent(ctx, 'baseline');

    // Re-run 002 against live data, as a deploy onto an existing database would.
    const sql = await readFile(path.join(MIGRATIONS, '002_session_delete_edit.sql'), 'utf-8');
    await pool.query(sql);

    const { rows } = await pool.query('SELECT type FROM events ORDER BY type');
    assert.deepEqual(rows.map(r => r.type), ['baseline', 'session']);
    await insertEvent(ctx, 'session_delete');
    await assert.rejects(insertEvent(ctx, 'nope'), /events_type_check/);
  });
});
