import { describe, test, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../src/api.js', () => ({ api: { get: vi.fn(), post: vi.fn().mockResolvedValue({}), del: vi.fn() } }));
const { api } = await import('../src/api.js');
const { default: MilestonesView } = await import('../src/views/MilestonesView.vue');

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('MilestonesView', () => {
  test('confirming pushes exactly one milestone_check and disables the item', async () => {
    const wrapper = mount(MilestonesView);
    await wrapper.get('[data-item="laravel.m1.policies"]').trigger('click');
    expect(wrapper.text()).toContain('Mark as done?');
    await wrapper.get('[data-test="confirm"]').trigger('click');
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    const [path, body] = api.post.mock.calls[0];
    expect(path).toBe('/v1/events');
    expect(body.events[0]).toMatchObject({ type: 'milestone_check', payload: { skill: 'laravel', month: 'm1', item: 'policies' } });
    expect(wrapper.get('[data-item="laravel.m1.policies"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-skill="laravel"] [data-test="progress"]').text()).toBe('1/12 · 8%');
  });

  test('cancelling pushes nothing', async () => {
    const wrapper = mount(MilestonesView);
    await wrapper.get('[data-item="rust.m1.bookCh6"]').trigger('click');
    await wrapper.get('[data-test="cancel"]').trigger('click');
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('Mark as done?');
  });

  test('humanizes item keys', () => {
    const wrapper = mount(MilestonesView);
    expect(wrapper.get('[data-item="laravel.m1.formRequests"]').text()).toContain('Form requests');
    expect(wrapper.get('[data-item="laravel.m3.tests30"]').text()).toContain('Tests 30');
  });
});
