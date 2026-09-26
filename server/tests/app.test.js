import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestPool, buildTestApp } from './helpers.js';

let pool;

before(async () => { pool = await createTestPool(); });
after(async () => { await pool.end(); });

describe('health', () => {
  test('reports ok when the database is reachable', async () => {
    const app = await buildTestApp(pool);
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'ok' });
    await app.close();
  });

  test('reports 503 when the database is not', async () => {
    const brokenPool = { query: async () => { throw new Error('connection refused'); } };
    const app = await buildTestApp(brokenPool);
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, 'db_unavailable');
    await app.close();
  });
});

describe('without a built dashboard', () => {
  test('unknown routes are JSON 404s', async () => {
    const app = await buildTestApp(pool, { webDist: null });
    for (const url of ['/', '/history', '/v1/nope']) {
      const res = await app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 404, url);
      assert.equal(res.json().error.code, 'not_found');
    }
    await app.close();
  });
});

describe('serving the dashboard from web/dist', () => {
  let dist;
  let app;

  before(async () => {
    dist = await mkdtemp(path.join(tmpdir(), 'devgrowth-dist-'));
    await mkdir(path.join(dist, 'assets'));
    await writeFile(path.join(dist, 'index.html'), '<!doctype html><div id="app"></div>');
    await writeFile(path.join(dist, 'assets', 'app.js'), 'console.log("hi")');
    app = await buildTestApp(pool, { webDist: dist });
  });

  after(async () => {
    await app.close();
    await rm(dist, { recursive: true, force: true });
  });

  test('serves index.html at /', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /id="app"/);
  });

  test('serves static assets', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app.js' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /javascript/);
  });

  test('falls back to index.html for client-side routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/milestones/laravel?tab=m1' });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /id="app"/);
  });

  test('never falls back for API routes or non-GET requests', async () => {
    const api = await app.inject({ method: 'GET', url: '/v1/does-not-exist' });
    assert.equal(api.statusCode, 404);
    assert.equal(api.json().error.code, 'not_found');
    const post = await app.inject({ method: 'POST', url: '/somewhere' });
    assert.equal(post.statusCode, 404);
    assert.equal(post.json().error.code, 'not_found');
  });
});
