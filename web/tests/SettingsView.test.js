import { describe, test, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { DEFAULT_CONFIG } from 'devgrowth-core/derive';

vi.mock('../src/api.js', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ devices: [{ id: 'd1', name: 'laptop', kind: 'cli', lastSeenAt: null, current: false }] }),
    post: vi.fn().mockResolvedValue({}),
    del: vi.fn()
  }
}));
const { api } = await import('../src/api.js');
const { default: SettingsView } = await import('../src/views/SettingsView.vue');

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/login', component: { template: '<div/>' } }] });
  const wrapper = mount(SettingsView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('SettingsView', () => {
  test('Save is disabled until something changes', async () => {
    const wrapper = await mountView();
    expect(wrapper.get('[data-test="save"]').attributes('disabled')).toBeDefined();
  });

  test('saving pushes a config_snapshot with the full config', async () => {
    const wrapper = await mountView();
    await wrapper.get('[data-test="duration"]').setValue(25);
    await wrapper.get('[data-day="wed"] input').setValue('go');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(api.post).toHaveBeenCalledTimes(1);
    const event = api.post.mock.calls[0][1].events[0];
    expect(event.type).toBe('config_snapshot');
    expect(event.payload.config).toEqual({
      ...DEFAULT_CONFIG,
      session: { ...DEFAULT_CONFIG.session, durationMinutes: 25 },
      schedule: { ...DEFAULT_CONFIG.schedule, wed: { ...DEFAULT_CONFIG.schedule.wed, skill: 'go' } }
    });
    expect(wrapper.text()).toContain('Saved.');
  });

  test('invalid input is caught before anything is pushed', async () => {
    const wrapper = await mountView();
    await wrapper.get('[data-test="duration"]').setValue(0);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Session length must be');
  });

  test('lists devices', async () => {
    const wrapper = await mountView();
    expect(api.get).toHaveBeenCalledWith('/v1/devices');
    expect(wrapper.text()).toContain('laptop');
  });
});
