import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgres://devgrowth:devgrowth@localhost:5433/devgrowth_test';

/**
 * Connect to the test database and bring its schema up to date.
 * Refuses to run against a database whose name doesn't end in `_test`,
 * because resetDb() truncates every table.
 */
export async function createTestPool() {
  const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${dbName}": TEST_DATABASE_URL must point at a *_test database.`);
  }
  const pool = createPool(TEST_DATABASE_URL);
  await migrate(pool);
  return pool;
}

export async function resetDb(pool) {
  await pool.query('TRUNCATE users, devices, events RESTART IDENTITY CASCADE');
}

export function buildTestApp(pool, config = {}) {
  return buildApp({
    pool,
    config: {
      bcryptRounds: 4, // fast hashing for tests
      authRateLimit: { max: 1000, timeWindow: '1 minute' },
      ...config
    }
  });
}

export const PASSWORD = 'correct horse battery';

export async function register(app, { email = 'dev@example.com', kind = 'cli', deviceName = 'laptop', password = PASSWORD } = {}) {
  return app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password, deviceName, kind } });
}

export async function login(app, { email = 'dev@example.com', kind = 'cli', deviceName = 'desktop', password = PASSWORD } = {}) {
  return app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password, deviceName, kind } });
}

/** Register a CLI user and return `{ token, userId, deviceId, auth }` where `auth` is ready-made headers. */
export async function registerCli(app, options) {
  const res = await register(app, { ...options, kind: 'cli' });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  const body = res.json();
  return { ...body, auth: { authorization: `Bearer ${body.token}` } };
}

export function sessionEvent(sessionDate, weekOf, overrides = {}) {
  return {
    id: randomUUID(),
    type: 'session',
    v: 1,
    occurredAt: `${sessionDate}T14:30:00.000Z`,
    payload: {
      skill: 'laravel',
      resource: 'Laravel Daily',
      duration: 20,
      status: 'Completed',
      message: 'Today I learned X. Tomorrow I will Y.',
      sessionDate,
      weekOf,
      startedAt: '21:30'
    },
    ...overrides
  };
}

export function milestoneEvent(skill, month, item, occurredAt = '2026-08-10T10:00:00.000Z') {
  return { id: randomUUID(), type: 'milestone_check', v: 1, occurredAt, payload: { skill, month, item } };
}
