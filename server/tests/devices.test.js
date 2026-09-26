import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestPool, resetDb, buildTestApp, registerCli, login } from './helpers.js';

let pool;
let app;

before(async () => { pool = await createTestPool(); });
after(async () => { await pool.end(); });
beforeEach(async () => { await resetDb(pool); app = await buildTestApp(pool); });
afterEach(async () => { await app.close(); });

function listDevices(headers) {
  return app.inject({ method: 'GET', url: '/v1/devices', headers });
}

function revoke(headers, id) {
  return app.inject({ method: 'DELETE', url: `/v1/devices/${id}`, headers });
}

describe('GET /v1/devices', () => {
  test('lists active devices and marks the current one', async () => {
    const laptop = await registerCli(app);
    await login(app, { deviceName: 'desktop' });
    const res = await listDevices(laptop.auth);
    assert.equal(res.statusCode, 200);
    const { devices } = res.json();
    assert.deepEqual(devices.map(d => [d.name, d.kind, d.current]), [['laptop', 'cli', true], ['desktop', 'cli', false]]);
    assert.ok(devices[0].createdAt);
  });

  test('hides revoked devices', async () => {
    const laptop = await registerCli(app);
    const desktopId = (await login(app, { deviceName: 'desktop' })).json().deviceId;
    await revoke(laptop.auth, desktopId);
    const { devices } = (await listDevices(laptop.auth)).json();
    assert.deepEqual(devices.map(d => d.name), ['laptop']);
  });
});

describe('DELETE /v1/devices/:id', () => {
  test('revoking another device logs it out', async () => {
    const laptop = await registerCli(app);
    const desktop = (await login(app, { deviceName: 'desktop' })).json();
    const res = await revoke(laptop.auth, desktop.deviceId);
    assert.equal(res.statusCode, 204);

    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${desktop.token}` } });
    assert.equal(me.statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/me', headers: laptop.auth })).statusCode, 200);
  });

  test('cannot revoke another user\'s device (reported as not found)', async () => {
    const alice = await registerCli(app, { email: 'alice@example.com' });
    const bob = await registerCli(app, { email: 'bob@example.com' });
    const res = await revoke(alice.auth, bob.deviceId);
    assert.equal(res.statusCode, 404);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/me', headers: bob.auth })).statusCode, 200);
  });

  test('unknown or already-revoked ids give 404; malformed ids give 400', async () => {
    const laptop = await registerCli(app);
    const desktopId = (await login(app, { deviceName: 'desktop' })).json().deviceId;
    assert.equal((await revoke(laptop.auth, randomUUID())).statusCode, 404);
    assert.equal((await revoke(laptop.auth, desktopId)).statusCode, 204);
    assert.equal((await revoke(laptop.auth, desktopId)).statusCode, 404);
    const bad = await revoke(laptop.auth, 'not-a-uuid');
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'validation_error');
  });
});
