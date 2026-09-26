<script setup>
import { computed } from 'vue';
import { DEFAULT_CONFIG, getCurrentWeekProgress } from 'devgrowth-core/derive';
import { getSessionDate, getWeekStart, getWeekNumber, toDateKey, formatShortDate } from 'devgrowth-core/schedule';
import { DAY_KEYS, DAY_NAMES, addDays } from '../dates.js';

const props = defineProps({
  config: { type: Object, default: null },
  sessions: { type: Array, required: true },
  stats: { type: Object, required: true },
  now: { type: Date, default: () => new Date() }
});

// Same session-day rule as the CLI: 00:00–03:59 still belongs to yesterday.
const sessionNow = computed(() => getSessionDate(props.now));
const weekStart = computed(() => getWeekStart(sessionNow.value));
const todayKey = computed(() => toDateKey(sessionNow.value));
const progress = computed(() => getCurrentWeekProgress(props.stats, props.now));

const STATUS = {
  Completed: { icon: '✅', label: 'Logged' },
  Light: { icon: '🟡', label: 'Light session' },
  Interrupted: { icon: '⏹️', label: 'Interrupted' },
  today: { icon: '👉', label: 'Today' },
  missed: { icon: '–', label: 'Not logged' },
  off: { icon: '☕', label: 'Off day' },
  upcoming: { icon: '○', label: 'Upcoming' }
};
const RANK = { Completed: 3, Light: 2, Interrupted: 1 };

const days = computed(() => DAY_KEYS.map((key, i) => {
  const date = addDays(weekStart.value, i);
  const dateKey = toDateKey(date);
  // No config synced yet → the defaults `devgrowth init` writes, as Settings does.
  const plan = (props.config ?? DEFAULT_CONFIG).schedule?.[key] ?? null;
  const logged = props.sessions.filter(s => s.sessionDate === dateKey);
  let status;
  if (logged.length > 0) {
    status = logged.map(s => s.status).sort((a, b) => (RANK[b] ?? 0) - (RANK[a] ?? 0))[0];
  } else if (dateKey === todayKey.value) {
    status = 'today';
  } else if (plan && ['rest', 'review'].includes(plan.skill)) {
    status = 'off';
  } else {
    status = dateKey < todayKey.value ? 'missed' : 'upcoming';
  }
  return { key, name: DAY_NAMES[i], date: formatShortDate(date), plan, status, ...STATUS[status], isToday: dateKey === todayKey.value };
}));

const title = computed(() => {
  const end = addDays(weekStart.value, 6);
  return `Week ${getWeekNumber(sessionNow.value)} · ${formatShortDate(weekStart.value)} – ${formatShortDate(end)}`;
});
</script>

<template>
  <section class="card" aria-labelledby="week-title">
    <div class="head">
      <h2 id="week-title">{{ title }}</h2>
      <p class="progress" data-test="progress">
        <strong>{{ progress.completed }}/{{ progress.total }}</strong> sessions this week
      </p>
    </div>
    <ol class="days">
      <li v-for="day in days" :key="day.key" class="day" :class="[`s-${day.status}`, { today: day.isToday }]" :data-day="day.key">
        <div class="day-name">{{ day.name }} <span class="muted small">{{ day.date }}</span></div>
        <div class="skill">{{ day.plan?.skill ?? '—' }}</div>
        <div class="focus muted small">{{ day.plan?.focus ?? '' }}</div>
        <div class="status small" data-test="status"><span aria-hidden="true">{{ day.icon }}</span> {{ day.label }}</div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.progress { color: var(--text-secondary); }
.progress strong { color: var(--text-primary); font-size: 1.1rem; }
.days { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.day { border: 1px solid var(--border); border-radius: 8px; padding: 10px; display: grid; gap: 2px; align-content: start; min-width: 0; }
.day.today { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.day-name { font-weight: 600; }
.skill { text-transform: capitalize; font-weight: 500; }
.focus { min-height: 1.3em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { margin-top: 6px; color: var(--text-secondary); }
.s-Completed .status, .s-Light .status { color: var(--text-primary); font-weight: 500; }
@media (max-width: 860px) {
  .days { grid-template-columns: 1fr; }
  .day { grid-template-columns: 7rem 1fr auto; align-items: center; column-gap: 12px; }
  .focus { display: none; }
  .status { margin-top: 0; }
}
</style>
