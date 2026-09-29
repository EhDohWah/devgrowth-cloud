import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deriveState } from 'devgrowth-core/derive';
import {
  createTestPool, resetDb, buildTestApp, registerCli, login, register,
  sessionEvent, milestoneEvent
} from './helpers.js';

let pool;
let app;

before(async () => { pool = await createTestPool(); });
after(async () => { await pool.end(); });
beforeEach(async () => { await resetDb(pool); app = await buildTestApp(pool); });
afterEach(async () => { await app.close(); });

function push(auth, events) {
  return app.inject({ method: 'POST', url: '/v1/events', headers: auth, payload: { events } });
}

function pull(auth, query = '') {
  return app.inject({ method: 'GET', url: `/v1/events${query}`, headers: auth });
}

async function pullAll(auth) {
  const all = [];
  let cursor = 0;
  for (;;) {
    const body = (await pull(auth, `?since=${cursor}&limit=3`)).json();
    all.push(...body.events);
    cursor = body.nextCursor;
    if (!body.hasMore) return all;
  }
}

describe('POST /v1/events', () => {
  test('accepts valid events and records the pushing device', async () => {
    const { auth, deviceId } = await registerCli(app);
    const events = [sessionEvent('2026-08-10', '2026-08-10'), milestoneEvent('laravel', 'm1', 'policies')];
    const res = await push(auth, events);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { accepted: events.map(e => e.id), duplicates: [] });

    const { rows } = await pool.query('SELECT device_id FROM events');
    assert.deepEqual(rows.map(r => r.device_id), [deviceId, deviceId]);
  });

  test('is idempotent: pushing the same ids again reports duplicates and stores nothing new', async () => {
    const { auth } = await registerCli(app);
    const first = sessionEvent('2026-08-10', '2026-08-10');
    await push(auth, [first]);

    const second = sessionEvent('2026-08-11', '2026-08-10');
    const res = await push(auth, [first, second, first]);
    assert.deepEqual(res.json(), { accepted: [second.id], duplicates: [first.id] });
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM events');
    assert.equal(rows[0].n, 2);
  });

  test('uppercase UUIDs are normalized, so a retry in a different case is still a duplicate', async () => {
    const { auth } = await registerCli(app);
    const event = sessionEvent('2026-08-10', '2026-08-10');
    await push(auth, [{ ...event, id: event.id.toUpperCase() }]);
    const res = await push(auth, [event]);
    assert.deepEqual(res.json().duplicates, [event.id]);
  });

  test('one invalid event rejects the whole batch with per-event details', async () => {
    const { auth } = await registerCli(app);
    const good = sessionEvent('2026-08-10', '2026-08-10');
    const bad = milestoneEvent('laravel', 'm1', 'toString');
    const res = await push(auth, [good, bad]);
    assert.equal(res.statusCode, 400);
    const { error } = res.json();
    assert.equal(error.code, 'invalid_event');
    assert.equal(error.details.length, 1);
    assert.equal(error.details[0].index, 1);
    assert.equal(error.details[0].id, bad.id);
    assert.match(error.details[0].errors[0], /unknown item/);

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM events');
    assert.equal(rows[0].n, 0);
  });

  test('rejects empty and oversized batches', async () => {
    const { auth } = await registerCli(app);
    assert.equal((await push(auth, [])).statusCode, 400);
    const tooMany = Array.from({ length: 501 }, () => milestoneEvent('laravel', 'm1', 'policies'));
    assert.equal((await push(auth, tooMany)).statusCode, 400);
  });

  test('requires authentication', async () => {
    const res = await push({}, [sessionEvent('2026-08-10', '2026-08-10')]);
    assert.equal(res.statusCode, 401);
  });
});

describe('GET /v1/events', () => {
  test('pages with since/limit and reports hasMore and nextCursor', async () => {
    const { auth } = await registerCli(app);
    const events = ['10', '11', '12', '13', '14'].map(d => sessionEvent(`2026-08-${d}`, '2026-08-10'));
    await push(auth, events);

    const page1 = (await pull(auth, '?since=0&limit=2')).json();
    assert.equal(page1.events.length, 2);
    assert.equal(page1.hasMore, true);
    assert.equal(page1.nextCursor, page1.events[1].serverSeq);

    const page2 = (await pull(auth, `?since=${page1.nextCursor}&limit=10`)).json();
    assert.equal(page2.events.length, 3);
    assert.equal(page2.hasMore, false);

    const empty = (await pull(auth, `?since=${page2.nextCursor}`)).json();
    assert.deepEqual(empty, { events: [], nextCursor: page2.nextCursor, hasMore: false });
  });

  test('returns events in the shape clients replay', async () => {
    const { auth, deviceId } = await registerCli(app);
    const event = sessionEvent('2026-08-10', '2026-08-10');
    await push(auth, [event]);
    const [pulled] = (await pull(auth)).json().events;
    assert.deepEqual(pulled, { ...event, serverSeq: pulled.serverSeq, deviceId });
    assert.equal(typeof pulled.serverSeq, 'number');
  });

  test('rejects bad query parameters', async () => {
    const { auth } = await registerCli(app);
    for (const query of ['?since=-1', '?limit=0', '?limit=1001', '?since=abc']) {
      assert.equal((await pull(auth, query)).statusCode, 400, query);
    }
  });

  test('ignores unknown query parameters (Fastify strips them)', async () => {
    const { auth } = await registerCli(app);
    assert.equal((await pull(auth, '?foo=1')).statusCode, 200);
  });
});

describe('isolation between users', () => {
  test('a user never sees another user\'s events, and event ids are per user', async () => {
    const alice = await registerCli(app, { email: 'alice@example.com' });
    const bob = await registerCli(app, { email: 'bob@example.com' });
    const event = sessionEvent('2026-08-10', '2026-08-10');

    await push(alice.auth, [event]);
    // Same id from another account is a different event, not a duplicate.
    const res = await push(bob.auth, [event]);
    assert.deepEqual(res.json(), { accepted: [event.id], duplicates: [] });

    await push(alice.auth, [milestoneEvent('rust', 'm1', 'bookCh6')]);
    assert.equal((await pull(alice.auth)).json().events.length, 2);
    assert.equal((await pull(bob.auth)).json().events.length, 1);
  });
});

describe('multi-device sync end to end', () => {
  test('two devices push, both pull everything, and derive identical state', async () => {
    const laptop = await registerCli(app);
    const desktopToken = (await login(app)).json().token;
    const desktop = { authorization: `Bearer ${desktopToken}` };

    await push(laptop.auth, [sessionEvent('2026-08-10', '2026-08-10'), sessionEvent('2026-08-11', '2026-08-10')]);
    await push(desktop, [
      sessionEvent('2026-08-11', '2026-08-10', { occurredAt: '2026-08-11T15:00:00.000Z' }), // same day as laptop
      sessionEvent('2026-08-12', '2026-08-10'),
      milestoneEvent('vue', 'm2', 'pinia')
    ]);

    const fromLaptop = deriveState(await pullAll(laptop.auth));
    const fromDesktop = deriveState(await pullAll(desktop));
    assert.deepEqual(fromLaptop, fromDesktop);
    assert.equal(fromLaptop.stats.totalSessions, 4);
    assert.equal(fromLaptop.stats.currentWeek.completed, 3); // same-day dedupe across devices
    assert.equal(fromLaptop.milestones.vue.m2.items.pinia, true);
  });

  test('a push waits for an in-flight push by the same user, so pullers never skip a row', async () => {
    const { auth, userId, deviceId } = await registerCli(app);

    // Simulate a slow push that has taken a server_seq but not committed yet,
    // holding the same per-user lock the route takes.
    const slow = await pool.connect();
    const slowId = randomUUID();
    let fastPush;
    try {
      await slow.query('BEGIN');
      await slow.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [userId]);
      await slow.query(
        `INSERT INTO events (user_id, id, device_id, type, v, payload, occurred_at)
         VALUES ($1, $2, $3, 'milestone_check', 1, $4, now())`,
        [userId, slowId, deviceId, JSON.stringify({ skill: 'laravel', month: 'm1', item: 'policies' })]
      );

      const fast = milestoneEvent('rust', 'm1', 'bookCh6');
      fastPush = push(auth, [fast]);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Without the lock, the fast push would already be committed with a
      // higher seq, this pull would advance the cursor past the slow row, and
      // the slow row would never be pulled.
      const midPull = (await pull(auth)).json();
      assert.deepEqual(midPull.events, []);

      await slow.query('COMMIT');
      assert.equal((await fastPush).statusCode, 200);

      const later = (await pull(auth, `?since=${midPull.nextCursor}`)).json();
      assert.deepEqual(later.events.map(e => e.id).sort(), [slowId, fast.id].sort());
    } finally {
      slow.release();
      await fastPush;
    }
  });

  test('concurrent pushes from several devices leave no gaps for a cursor-based puller', async () => {
    await register(app);
    const tokens = [];
    for (let i = 0; i < 4; i++) tokens.push((await login(app, { deviceName: `device-${i}` })).json().token);
    const headers = tokens.map(t => ({ authorization: `Bearer ${t}` }));

    const pushed = [];
    const seen = new Map();
    let cursor = 0;
    async function drain() {
      const body = (await pull(headers[0], `?since=${cursor}`)).json();
      for (const e of body.events) seen.set(e.id, e.serverSeq);
      cursor = body.nextCursor;
    }

    // Interleave pulls with concurrent pushes, like a device syncing mid-burst.
    for (let round = 0; round < 5; round++) {
      const batches = headers.map(() => Array.from({ length: 5 }, () => milestoneEvent('laravel', 'm1', 'policies')));
      batches.forEach(b => pushed.push(...b.map(e => e.id)));
      await Promise.all([...batches.map((b, i) => push(headers[i], b)), drain()]);
    }
    await drain();

    assert.equal(seen.size, pushed.length);
    for (const id of pushed) assert.ok(seen.has(id), `missed ${id}`);
  });
});

function deleteEvent(targetId, overrides = {}) {
  return { id: randomUUID(), type: 'session_delete', v: 2, occurredAt: '2026-08-20T09:00:00.000Z', payload: { targetId }, ...overrides };
}

function editEvent(targetId, message, overrides = {}) {
  return { id: randomUUID(), type: 'session_edit', v: 2, occurredAt: '2026-08-20T09:00:00.000Z', payload: { targetId, message }, ...overrides };
}

describe('session_delete and session_edit', () => {
  test('are stored and served, and replaying them removes and rewrites sessions', async () => {
    const { auth } = await registerCli(app);
    const keep = sessionEvent('2026-08-10', '2026-08-10');
    const mistake = sessionEvent('2026-08-11', '2026-08-10');
    const edit = editEvent(keep.id, 'Reworded after the fact.');
    const del = deleteEvent(mistake.id);

    const res = await push(auth, [keep, mistake, edit, del]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().accepted, [keep.id, mistake.id, edit.id, del.id]);

    const pulled = await pullAll(auth);
    assert.deepEqual(pulled.map(e => [e.type, e.v]), [['session', 1], ['session', 1], ['session_edit', 2], ['session_delete', 2]]);

    // What a client does with them.
    const state = deriveState(pulled);
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].message, 'Reworded after the fact.');
    assert.equal(state.sessions[0].edited, true);
    assert.equal(state.stats.totalSessions, 1);
    assert.equal(state.stats.currentWeek.completed, 1);
  });

  test('a delete that arrives from a second device applies to the first device\'s sessions', async () => {
    const laptop = await registerCli(app);
    const desktopToken = (await login(app)).json().token;
    const desktop = { authorization: `Bearer ${desktopToken}` };
    const session = sessionEvent('2026-08-10', '2026-08-10');

    await push(laptop.auth, [session]);
    await push(desktop, [deleteEvent(session.id)]);

    for (const auth of [laptop.auth, desktop]) {
      assert.equal(deriveState(await pullAll(auth)).stats.totalSessions, 0);
    }
  });

  test('are validated like every other event', async () => {
    const { auth } = await registerCli(app);
    const target = randomUUID();
    const cases = [
      ['a delete stamped v1', deleteEvent(target, { v: 1 }), /require v >= 2/],
      ['a delete without a UUID target', deleteEvent('not-a-uuid'), /targetId/],
      ['an edit with a blank message', editEvent(target, '   '), /message/],
      ['a schema newer than this server knows', deleteEvent(target, { v: 3 }), /newer than supported/]
    ];
    for (const [label, event, expected] of cases) {
      const res = await push(auth, [event]);
      assert.equal(res.statusCode, 400, label);
      assert.equal(res.json().error.code, 'invalid_event', label);
      assert.match(res.json().error.details[0].errors.join(' '), expected, label);
    }
    assert.equal((await pull(auth)).json().events.length, 0);
  });

  test('a retried delete is a duplicate, not a second tombstone', async () => {
    const { auth } = await registerCli(app);
    const del = deleteEvent(randomUUID());
    await push(auth, [del]);
    const again = await push(auth, [del]);
    assert.deepEqual(again.json(), { accepted: [], duplicates: [del.id] });
  });
});

describe('GET /v1/me eventCount', () => {
  test('counts only the caller\'s events', async () => {
    const { auth } = await registerCli(app);
    await registerCli(app, { email: 'other@example.com' });
    await push(auth, [milestoneEvent('laravel', 'm1', 'policies'), { ...milestoneEvent('rust', 'm1', 'bookCh6'), id: randomUUID() }]);
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: auth });
    assert.equal(res.json().eventCount, 2);
  });
});
