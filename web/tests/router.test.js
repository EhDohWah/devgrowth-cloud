import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';

vi.mock('../src/api.js', () => ({ api: { get: vi.fn(), post: vi.fn(), del: vi.fn() } }));
const { api } = await import('../src/api.js');
const { createAppRouter, safeRedirect } = await import('../src/router.js');

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('router guard', () => {
  test('signed-out visitors are sent to /login, remembering where they were going', async () => {
    api.get.mockRejectedValueOnce(Object.assign(new Error('no'), { status: 401 }));
    const router = createAppRouter(createMemoryHistory());
    await router.push('/history');
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/history');
  });

  test('signed-in users skip /login', async () => {
    api.get.mockResolvedValueOnce({ user: { id: 'u', email: 'a@b.io' }, device: { id: 'd' }, eventCount: 0, schemaVersion: 1 });
    const router = createAppRouter(createMemoryHistory());
    await router.push('/login');
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  test('safeRedirect only allows in-app paths', () => {
    expect(safeRedirect('/history')).toBe('/history');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect('https://evil.example')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
  });
});
