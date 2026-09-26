import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION } from 'devgrowth-core/events';
import { createTestPool, resetDb, buildTestApp, register, login, registerCli } from './helpers.js';

let pool;
let app;

before(async () => { pool = await createTestPool(); });
after(async () => { await pool.end(); });
beforeEach(async () => { await resetDb(pool); app = await buildTestApp(pool); });
afterEach(async () => { await app.close(); });

function cookieFrom(res) {
  return res.cookies.find(c => c.name === 'dg_session');
}

describe('register', () => {
  test('CLI registration returns a token and stores only its hash', async () => {
    const res = await register(app);
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.ok(body.userId && body.deviceId);
    assert.ok(body.token.length >= 40);
    assert.equal(cookieFrom(res), undefined);

    const { rows } = await pool.query('SELECT token_hash, kind, expires_at FROM devices');
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].token_hash, body.token);
    assert.equal(rows[0].kind, 'cli');
    assert.equal(rows[0].expires_at, null);
  });

  test('email is unique case-insensitively', async () => {
    await register(app, { email: 'Dev@Example.com' });
    const res = await register(app, { email: 'dev@example.COM' });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, 'email_taken');
  });

  test('rejects bad input with validation_error', async () => {
    for (const payload of [
      { email: 'not-an-email', password: 'long enough pw', deviceName: 'x' },
      { email: 'a@b.io', password: 'short', deviceName: 'x' },
      { email: 'a@b.io', password: 'long enough pw', deviceName: '' },
      { email: 'a@b.io', password: 'long enough pw', deviceName: 'x', kind: 'phone' },
      { email: 'a@b.io', password: 'long enough pw' }
    ]) {
      const res = await app.inject({ method: 'POST', url: '/v1/auth/register', payload });
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().error.code, 'validation_error');
    }
  });

  test('malformed JSON gets a 400 in the standard error shape', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/register',
      headers: { 'content-type': 'application/json' }, payload: '{"email":'
    });
    assert.equal(res.statusCode, 400);
    assert.ok(res.json().error.code);
  });
});

describe('login', () => {
  beforeEach(async () => { await register(app); });

  test('creates a new device with its own token', async () => {
    const res = await login(app);
    assert.equal(res.statusCode, 200);
    const { rows } = await pool.query('SELECT name FROM devices ORDER BY created_at');
    assert.deepEqual(rows.map(r => r.name), ['laptop', 'desktop']);
  });

  test('wrong password and unknown email give the same 401', async () => {
    const wrong = await login(app, { password: 'wrong password!' });
    const unknown = await login(app, { email: 'nobody@example.com' });
    for (const res of [wrong, unknown]) {
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.json(), { error: { code: 'invalid_credentials', message: 'Email or password is incorrect' } });
    }
  });

  test('web login sets an httpOnly SameSite=Strict cookie and never returns the token', async () => {
    const res = await login(app, { kind: 'web', deviceName: 'Chrome' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().token, undefined);
    const cookie = cookieFrom(res);
    assert.ok(cookie.value);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Strict');
    assert.equal(cookie.path, '/');
    const { rows } = await pool.query(`SELECT expires_at FROM devices WHERE kind = 'web'`);
    assert.ok(rows[0].expires_at > new Date());
  });

  test('is rate limited per IP', async () => {
    const limited = await buildTestApp(pool, { authRateLimit: { max: 2, timeWindow: '1 minute' } });
    try {
      await login(limited);
      await login(limited);
      const res = await login(limited);
      assert.equal(res.statusCode, 429);
      assert.equal(res.json().error.code, 'rate_limited');
    } finally {
      await limited.close();
    }
  });
});

describe('authentication', () => {
  test('GET /v1/me works with a bearer token', async () => {
    const { auth, userId, deviceId } = await registerCli(app);
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: auth });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      user: { id: userId, email: 'dev@example.com' },
      device: { id: deviceId, name: 'laptop', kind: 'cli' },
      eventCount: 0,
      schemaVersion: SCHEMA_VERSION
    });
  });

  test('GET /v1/me works with the web cookie', async () => {
    await register(app);
    const cookie = cookieFrom(await login(app, { kind: 'web' }));
    const res = await app.inject({ method: 'GET', url: '/v1/me', cookies: { dg_session: cookie.value } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().device.kind, 'web');
  });

  test('missing or unknown credentials give 401', async () => {
    const none = await app.inject({ method: 'GET', url: '/v1/me' });
    const bogus = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer nope' } });
    for (const res of [none, bogus]) {
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().error.code, 'unauthorized');
    }
  });

  test('cookie-authenticated writes require the CSRF header', async () => {
    await register(app);
    const cookie = cookieFrom(await login(app, { kind: 'web' }));
    const cookies = { dg_session: cookie.value };

    const blocked = await app.inject({ method: 'POST', url: '/v1/auth/logout', cookies });
    assert.equal(blocked.statusCode, 403);
    assert.equal(blocked.json().error.code, 'csrf_required');

    const allowed = await app.inject({
      method: 'POST', url: '/v1/auth/logout', cookies,
      headers: { 'x-requested-with': 'devgrowth-web' }
    });
    assert.equal(allowed.statusCode, 204);
  });

  test('an expired web session is rejected', async () => {
    await register(app);
    const cookie = cookieFrom(await login(app, { kind: 'web' }));
    await pool.query(`UPDATE devices SET expires_at = now() - interval '1 second' WHERE kind = 'web'`);
    const res = await app.inject({ method: 'GET', url: '/v1/me', cookies: { dg_session: cookie.value } });
    assert.equal(res.statusCode, 401);
  });
});

describe('logout', () => {
  test('revokes only the current device', async () => {
    const laptop = await registerCli(app);
    const desktopToken = (await login(app)).json().token;

    const res = await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: laptop.auth });
    assert.equal(res.statusCode, 204);

    const after = await app.inject({ method: 'GET', url: '/v1/me', headers: laptop.auth });
    assert.equal(after.statusCode, 401);
    const other = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${desktopToken}` } });
    assert.equal(other.statusCode, 200);
  });

  test('clears the web cookie', async () => {
    await register(app);
    const cookie = cookieFrom(await login(app, { kind: 'web' }));
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/logout',
      cookies: { dg_session: cookie.value }, headers: { 'x-requested-with': 'devgrowth-web' }
    });
    const cleared = cookieFrom(res);
    assert.equal(cleared.value, '');
    assert.ok(cleared.expires <= new Date());
  });
});
