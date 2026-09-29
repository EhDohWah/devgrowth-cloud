import { describe, test, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { session, uuid } from './fixtures.js';
import HistoryView from '../src/views/HistoryView.vue';
import { useEventsStore } from '../src/stores/events.js';

function mountWith(events) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useEventsStore();
  store.events = events;
  store.loaded = true;
  return mount(HistoryView, { global: { plugins: [pinia] } });
}

describe('HistoryView', () => {
  test('shows the edited message with an (edited) badge, and omits deleted sessions', () => {
    const a = session('2026-08-10', '2026-08-10', { message: 'Original text.' });
    const b = session('2026-08-11', '2026-08-10', { message: 'Logged by mistake.' });
    const c = session('2026-08-12', '2026-08-10', { message: 'Untouched.' });
    const edit = { id: uuid(), type: 'session_edit', v: 2, occurredAt: '2026-08-13T10:00:00.000Z', payload: { targetId: a.id, message: 'Corrected text.' } };
    const del = { id: uuid(), type: 'session_delete', v: 2, occurredAt: '2026-08-13T11:00:00.000Z', payload: { targetId: b.id } };

    const wrapper = mountWith([a, b, c, edit, del]);
    const entries = wrapper.findAll('[data-test="entry"]');
    expect(entries).toHaveLength(2);
    const text = wrapper.text();
    expect(text).toContain('Corrected text.');
    expect(text).not.toContain('Original text.');
    expect(text).not.toContain('Logged by mistake.');
    expect(wrapper.findAll('[data-test="edited"]')).toHaveLength(1);
  });
});
