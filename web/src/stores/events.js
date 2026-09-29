import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { deriveState } from 'devgrowth-core/derive';
import { assertValidEvent, eventVersion } from 'devgrowth-core/events';
import { api } from '../api.js';

/**
 * The dashboard's copy of the user's event log, and everything derived from it.
 * Like the CLI, it never trusts pre-computed stats: `state` is `deriveState`
 * over the full event list, so the numbers match `devgrowth status` exactly.
 */
export const useEventsStore = defineStore('events', () => {
  const events = shallowRef([]);
  const cursor = ref(0);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref(null);
  const knownIds = new Set();

  const state = computed(() => deriveState(events.value));
  const isEmpty = computed(() => loaded.value && events.value.length === 0);

  function merge(list) {
    const fresh = list.filter(event => !knownIds.has(event.id));
    if (fresh.length === 0) return;
    fresh.forEach(event => knownIds.add(event.id));
    events.value = [...events.value, ...fresh];
  }

  /** Pull everything after `cursor`, page by page. Safe to call repeatedly. */
  async function sync() {
    if (loading.value) return;
    loading.value = true;
    try {
      let hasMore = true;
      while (hasMore) {
        const page = await api.get(`/v1/events?since=${cursor.value}`);
        merge(page.events);
        cursor.value = page.nextCursor;
        hasMore = page.hasMore;
      }
      loaded.value = true;
      error.value = null;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Record a change as an event. It shows up immediately (optimistic) and is
   * rolled back if the server rejects it. Invalid events throw before any
   * network call, with the same validator the server uses.
   */
  async function addEvent(type, payload) {
    const event = assertValidEvent({
      id: crypto.randomUUID(),
      type,
      // The version that introduced this type, so an older server still accepts it.
      v: eventVersion(type),
      occurredAt: new Date().toISOString(),
      payload
    });
    knownIds.add(event.id);
    events.value = [...events.value, event];
    try {
      await api.post('/v1/events', { events: [event] });
      return event;
    } catch (err) {
      knownIds.delete(event.id);
      events.value = events.value.filter(e => e.id !== event.id);
      error.value = `Couldn't save your change: ${err.message}`;
      throw err;
    }
  }

  function reset() {
    events.value = [];
    knownIds.clear();
    cursor.value = 0;
    loaded.value = false;
    error.value = null;
  }

  return { events, cursor, loaded, loading, error, state, isEmpty, sync, addEvent, reset };
});
