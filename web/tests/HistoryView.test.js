import { describe, test, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { session, uuid } from './fixtures.js';

vi.mock('../src/api.js', () => ({ api: { get: vi.fn(), post: vi.fn(), del: vi.fn() } }));
const { api } = await import('../src/api.js');
const { default: HistoryView } = await import('../src/views/HistoryView.vue');
const { useEventsStore } = await import('../src/stores/events.js');

let store;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  api.post.mockResolvedValue({ accepted: [], duplicates: [] });
  store = useEventsStore();
});

function mountWith(events) {
  store.events = events;
  store.loaded = true;
  return mount(HistoryView, { attachTo: document.body });
}

function entryFor(wrapper, text) {
  return wrapper.findAll('[data-test="entry"]').find(e => e.text().includes(text));
}

function pushed() {
  return api.post.mock.calls.map(([, body]) => body.events[0]);
}

const editEvent = (targetId, message) =>
  ({ id: uuid(), type: 'session_edit', v: 2, occurredAt: '2026-08-13T10:00:00.000Z', payload: { targetId, message } });
const deleteEvent = targetId =>
  ({ id: uuid(), type: 'session_delete', v: 2, occurredAt: '2026-08-13T11:00:00.000Z', payload: { targetId } });

describe('HistoryView', () => {
  test('shows the edited message with an (edited) badge, and omits deleted sessions', () => {
    const a = session('2026-08-10', '2026-08-10', { message: 'Original text.' });
    const b = session('2026-08-11', '2026-08-10', { message: 'Logged by mistake.' });
    const c = session('2026-08-12', '2026-08-10', { message: 'Untouched.' });

    const wrapper = mountWith([a, b, c, editEvent(a.id, 'Corrected text.'), deleteEvent(b.id)]);
    expect(wrapper.findAll('[data-test="entry"]')).toHaveLength(2);
    const text = wrapper.text();
    expect(text).toContain('Corrected text.');
    expect(text).not.toContain('Original text.');
    expect(text).not.toContain('Logged by mistake.');
    expect(wrapper.findAll('[data-test="edited"]')).toHaveLength(1);
  });

  test('editing pushes one session_edit with newlines collapsed, and shows the new text', async () => {
    const a = session('2026-08-10', '2026-08-10', { message: 'Typo hree.' });
    const wrapper = mountWith([a]);

    await entryFor(wrapper, 'Typo hree.').get('[data-test="edit"]').trigger('click');
    const input = wrapper.get(`[data-edit-input="${a.id}"]`);
    expect(input.element.value).toBe('Typo hree.');
    await input.setValue('  Fixed the typo.\n  Second line.  ');
    await wrapper.get('[data-test="edit-form"]').trigger('submit');

    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await flushPromises();
    expect(pushed()[0]).toMatchObject({ type: 'session_edit', v: 2, payload: { targetId: a.id, message: 'Fixed the typo. Second line.' } });
    expect(wrapper.find('[data-test="edit-form"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Fixed the typo. Second line.');
    expect(wrapper.find('[data-test="edited"]').exists()).toBe(true);
  });

  test('an empty edit is refused and an unchanged one pushes nothing', async () => {
    const a = session('2026-08-10', '2026-08-10', { message: 'Keep me.' });
    const wrapper = mountWith([a]);

    await wrapper.get('[data-test="edit"]').trigger('click');
    await wrapper.get(`[data-edit-input="${a.id}"]`).setValue('   \n ');
    await wrapper.get('[data-test="edit-form"]').trigger('submit');
    expect(wrapper.text()).toContain("can't be empty");
    expect(api.post).not.toHaveBeenCalled();

    await wrapper.get(`[data-edit-input="${a.id}"]`).setValue('Keep me.');
    await wrapper.get('[data-test="edit-form"]').trigger('submit');
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="edit-form"]').exists()).toBe(false);
  });

  test('cancelling an edit pushes nothing and keeps the old text', async () => {
    const a = session('2026-08-10', '2026-08-10', { message: 'Old text.' });
    const wrapper = mountWith([a]);
    await wrapper.get('[data-test="edit"]').trigger('click');
    await wrapper.get(`[data-edit-input="${a.id}"]`).setValue('Something else.');
    await wrapper.get('[data-test="edit-cancel"]').trigger('click');
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Old text.');
  });

  test('a rejected edit is rolled back and the form stays open', async () => {
    api.post.mockRejectedValueOnce(new Error('server down'));
    const a = session('2026-08-10', '2026-08-10', { message: 'Old text.' });
    const wrapper = mountWith([a]);
    await wrapper.get('[data-test="edit"]').trigger('click');
    await wrapper.get(`[data-edit-input="${a.id}"]`).setValue('New text.');
    await wrapper.get('[data-test="edit-form"]').trigger('submit');
    await vi.waitFor(() => expect(store.error).toMatch(/server down/));
    await flushPromises();
    expect(store.state.sessions[0].message).toBe('Old text.');
    expect(wrapper.find('[data-test="edit-form"]').exists()).toBe(true);
  });

  test('deleting asks first, then pushes one session_delete and recomputes the stats', async () => {
    const a = session('2026-08-10', '2026-08-10', { message: 'Real session.' });
    const b = session('2026-08-11', '2026-08-10', { message: 'Logged by mistake.' });
    const wrapper = mountWith([a, b]);
    expect(store.state.stats.totalSessions).toBe(2);

    await entryFor(wrapper, 'Logged by mistake.').get('[data-test="delete"]').trigger('click');
    expect(wrapper.text()).toContain('Delete this log?');
    expect(wrapper.get('[data-test="delete-preview"]').text()).toContain('Logged by mistake.');
    expect(api.post).not.toHaveBeenCalled();

    await wrapper.get('[data-test="confirm"]').trigger('click');
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await flushPromises();
    expect(pushed()[0]).toMatchObject({ type: 'session_delete', v: 2, payload: { targetId: b.id } });
    expect(wrapper.findAll('[data-test="entry"]')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Logged by mistake.');
    expect(store.state.stats.totalSessions).toBe(1);
    expect(wrapper.text()).not.toContain('Delete this log?');
  });

  test('cancelling a delete pushes nothing', async () => {
    const a = session('2026-08-10', '2026-08-10');
    const wrapper = mountWith([a]);
    await wrapper.get('[data-test="delete"]').trigger('click');
    await wrapper.get('[data-test="cancel"]').trigger('click');
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.findAll('[data-test="entry"]')).toHaveLength(1);
  });

  test('sessions recorded before the baseline can be edited but not deleted', () => {
    const old = session('2026-08-03', '2026-08-03', { message: 'Before sync.' });
    const baseline = {
      id: uuid(), type: 'baseline', v: 1, occurredAt: '2026-08-05T00:00:00.000Z',
      payload: { stats: { totalSessions: 1, totalMinutesDeepWork: 20 }, milestones: {}, config: null }
    };
    const fresh = session('2026-08-10', '2026-08-10', { message: 'After sync.' });
    const wrapper = mountWith([old, baseline, fresh]);

    const before = entryFor(wrapper, 'Before sync.');
    expect(before.find('[data-test="delete"]').exists()).toBe(false);
    expect(before.find('[data-test="edit"]').exists()).toBe(true);
    expect(before.find('[data-test="baseline-note"]').exists()).toBe(true);
    expect(entryFor(wrapper, 'After sync.').find('[data-test="delete"]').exists()).toBe(true);
  });
});
