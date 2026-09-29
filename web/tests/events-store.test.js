import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { deriveState } from 'devgrowth-core/derive';
import { session, uuid } from './fixtures.js';

vi.mock('../src/api.js', () => ({ api: { get: vi.fn(), post: vi.fn(), del: vi.fn() } }));
const { api } = await import('../src/api.js');
const { useEventsStore } = await import('../src/stores/events.js');

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('events store', () => {
  test('sync pages until hasMore is false and derives state from all events', async () => {
    const a = session('2026-08-10', '2026-08-10');
    const b = session('2026-08-11', '2026-08-10');
    const c = session('2026-08-11', '2026-08-10');
    api.get
      .mockResolvedValueOnce({ events: [a, b], nextCursor: 2, hasMore: true })
      .mockResolvedValueOnce({ events: [c], nextCursor: 3, hasMore: false });

    const store = useEventsStore();
    await store.sync();

    expect(api.get.mock.calls.map(c => c[0])).toEqual(['/v1/events?since=0', '/v1/events?since=2']);
    expect(store.cursor).toBe(3);
    expect(store.loaded).toBe(true);
    expect(store.state).toEqual(deriveState([a, b, c]));
    expect(store.state.stats.currentWeek.completed).toBe(2); // same-day dedupe, as in the CLI
  });

  test('a later sync continues from the cursor and ignores events it already has', async () => {
    const a = session('2026-08-10', '2026-08-10');
    api.get.mockResolvedValueOnce({ events: [a], nextCursor: 1, hasMore: false });
    const store = useEventsStore();
    await store.sync();

    api.get.mockResolvedValueOnce({ events: [a], nextCursor: 1, hasMore: false });
    await store.sync();
    expect(api.get).toHaveBeenLastCalledWith('/v1/events?since=1');
    expect(store.events).toHaveLength(1);
  });

  test('sync failure is reported, not thrown', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    const store = useEventsStore();
    await store.sync();
    expect(store.error).toBe('offline');
    expect(store.loaded).toBe(false);
  });

  test('addEvent applies optimistically and pushes one valid event', async () => {
    let resolvePush;
    api.post.mockReturnValueOnce(new Promise(r => { resolvePush = r; }));
    const store = useEventsStore();

    const pending = store.addEvent('milestone_check', { skill: 'vue', month: 'm2', item: 'pinia' });
    expect(store.state.milestones.vue.m2.items.pinia).toBe(true); // before the server answers

    resolvePush({ accepted: [], duplicates: [] });
    const event = await pending;
    expect(api.post).toHaveBeenCalledWith('/v1/events', { events: [event] });
    expect(event).toMatchObject({ type: 'milestone_check', v: 1, payload: { skill: 'vue', month: 'm2', item: 'pinia' } });
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('addEvent rolls back and reports when the push fails', async () => {
    api.post.mockRejectedValueOnce(new Error('server down'));
    const store = useEventsStore();
    await expect(store.addEvent('milestone_check', { skill: 'vue', month: 'm2', item: 'pinia' })).rejects.toThrow();
    expect(store.events).toHaveLength(0);
    expect(store.state.milestones.vue.m2.items.pinia).toBe(false);
    expect(store.error).toMatch(/server down/);
  });

  test('invalid events are rejected before any network call', async () => {
    const store = useEventsStore();
    await expect(store.addEvent('milestone_check', { skill: 'vue', month: 'm2', item: 'toString' })).rejects.toThrow(/Invalid event/);
    expect(api.post).not.toHaveBeenCalled();
    expect(store.events).toHaveLength(0);
  });

  test('the pulled copy of an optimistic event is not added twice', async () => {
    api.post.mockResolvedValueOnce({ accepted: [], duplicates: [] });
    const store = useEventsStore();
    const event = await store.addEvent('milestone_check', { skill: 'rust', month: 'm1', item: 'bookCh6' });
    api.get.mockResolvedValueOnce({ events: [{ ...event, serverSeq: 1 }], nextCursor: 1, hasMore: false });
    await store.sync();
    expect(store.events).toHaveLength(1);
  });
  test('a synced session_delete removes the session and recomputes the stats', async () => {
    const a = session('2026-08-10', '2026-08-10');
    const b = session('2026-08-11', '2026-08-10');
    const del = { id: uuid(), type: 'session_delete', v: 2, occurredAt: '2026-08-12T10:00:00.000Z', payload: { targetId: b.id } };
    api.get.mockResolvedValueOnce({ events: [a, b, del], nextCursor: 3, hasMore: false });
    const store = useEventsStore();
    await store.sync();
    expect(store.state.sessions.map(s => s.id)).toEqual([a.id]);
    expect(store.state.stats.totalSessions).toBe(1);
    expect(store.state.stats.currentWeek.completed).toBe(1);
  });

  test('a synced session_edit replaces the message and marks the session edited', async () => {
    const a = session('2026-08-10', '2026-08-10');
    const edit = { id: uuid(), type: 'session_edit', v: 2, occurredAt: '2026-08-12T10:00:00.000Z', payload: { targetId: a.id, message: 'Fixed wording.' } };
    api.get.mockResolvedValueOnce({ events: [a, edit], nextCursor: 2, hasMore: false });
    const store = useEventsStore();
    await store.sync();
    expect(store.state.sessions[0]).toMatchObject({ message: 'Fixed wording.', edited: true });
    expect(store.state.stats.totalSessions).toBe(1);
  });
});
