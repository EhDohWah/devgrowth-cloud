import { describe, test, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { deriveState } from 'devgrowth-core/derive';
import WeeklyChart from '../src/components/WeeklyChart.vue';
import { session } from './fixtures.js';

describe('WeeklyChart', () => {
  const now = new Date(2026, 7, 12, 21, 0); // week of Aug 10
  const { sessions } = deriveState([
    session('2026-08-03', '2026-08-03'),
    session('2026-08-04', '2026-08-03'),
    session('2026-08-04', '2026-08-03'), // same day twice → still 2 days
    session('2026-08-10', '2026-08-10')
  ]);

  test('counts distinct days per week and draws only non-zero weeks', () => {
    const wrapper = mount(WeeklyChart, { props: { sessions, now } });
    expect(wrapper.findAll('[data-test="bar"]')).toHaveLength(2);
    const labels = wrapper.findAll('.hit').map(h => h.attributes('aria-label'));
    expect(labels).toHaveLength(12);
    expect(labels.at(-2)).toBe('Week of Aug 3: 2 of 5 days logged');
    expect(labels.at(-1)).toBe('Week of Aug 10: 1 of 5 days logged (in progress)');
  });

  test('shows a tooltip on focus and offers a table view', async () => {
    const wrapper = mount(WeeklyChart, { props: { sessions, now } });
    await wrapper.findAll('.hit').at(-2).trigger('focus');
    expect(wrapper.get('.tooltip').text()).toContain('2 / 5 days logged');

    await wrapper.get('button').trigger('click');
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(12);
    expect(rows[0].text()).toContain('Aug 10');
    expect(rows[1].text()).toContain('2 / 5');
  });
});
