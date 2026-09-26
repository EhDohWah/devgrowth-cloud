import { describe, test, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { DEFAULT_CONFIG, deriveState } from 'devgrowth-core/derive';
import WeekGrid from '../src/components/WeekGrid.vue';
import { session } from './fixtures.js';

function mountAt(now, events) {
  const { stats, sessions } = deriveState(events);
  return mount(WeekGrid, { props: { config: DEFAULT_CONFIG, sessions, stats, now } });
}

const status = (wrapper, day) => wrapper.get(`[data-day="${day}"] [data-test="status"]`).text();

describe('WeekGrid', () => {
  test('marks logged, today, missed, upcoming and off days', () => {
    // Wed Aug 12 2026, 21:00 local
    const wrapper = mountAt(new Date(2026, 7, 12, 21, 0), [
      session('2026-08-10', '2026-08-10'),
      session('2026-08-11', '2026-08-10', { status: 'Light' })
    ]);
    expect(status(wrapper, 'mon')).toContain('Logged');
    expect(status(wrapper, 'tue')).toContain('Light session');
    expect(status(wrapper, 'wed')).toContain('Today');
    expect(status(wrapper, 'thu')).toContain('Upcoming');
    expect(status(wrapper, 'sat')).toContain('Off day');
    expect(wrapper.get('[data-test="progress"]').text()).toContain('2/5');
    expect(wrapper.text()).toContain('Week 33');
  });

  test('02:00 on Tuesday still counts as Monday (the CLI session-day rule)', () => {
    const wrapper = mountAt(new Date(2026, 7, 11, 2, 0), []);
    expect(status(wrapper, 'mon')).toContain('Today');
    expect(status(wrapper, 'tue')).toContain('Upcoming');
  });

  test('a stale, never-reviewed week does not leak into this week\'s progress', () => {
    const wrapper = mountAt(new Date(2026, 7, 19, 21, 0), [
      session('2026-08-10', '2026-08-10'),
      session('2026-08-11', '2026-08-10')
    ]);
    expect(wrapper.get('[data-test="progress"]').text()).toContain('0/5');
    expect(status(wrapper, 'mon')).toContain('Not logged');
  });
});

describe('WeekGrid without a synced config', () => {
  test('falls back to the default schedule instead of showing blanks', () => {
    const { stats, sessions } = deriveState([]);
    const wrapper = mount(WeekGrid, { props: { config: null, sessions, stats, now: new Date(2026, 7, 12, 21, 0) } });
    expect(wrapper.get('[data-day="mon"] .skill').text()).toBe('laravel');
    expect(wrapper.get('[data-day="sun"] [data-test="status"]').text()).toContain('Off day');
  });
});
