<script setup>
import { computed } from 'vue';
import { useEventsStore } from '../stores/events.js';
import StatTile from '../components/StatTile.vue';
import WeekGrid from '../components/WeekGrid.vue';
import WeeklyChart from '../components/WeeklyChart.vue';

const events = useEventsStore();
const stats = computed(() => events.state.stats);
const deepWorkHours = computed(() => {
  const hours = stats.value.totalMinutesDeepWork / 60;
  return hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1).replace(/\.0$/, '');
});
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<template>
  <div class="stack">
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p class="muted">Everything here is rebuilt from your synced sessions, the same way the CLI does it.</p>
      </div>
    </div>

    <p v-if="!events.loaded" class="muted">Loading your data…</p>

    <div v-else-if="events.isEmpty" class="card empty">
      <h2>No data yet</h2>
      <p class="muted">Sign in from your terminal with <code>devgrowth login</code>, then log a session. It will show up here.</p>
    </div>

    <template v-else>
      <div class="grid-4">
        <StatTile hero label="Current streak" :value="stats.currentStreakWeeks" :hint="plural(stats.currentStreakWeeks, 'week')" />
        <StatTile label="Longest streak" :value="stats.longestStreakWeeks" :hint="plural(stats.longestStreakWeeks, 'week')" />
        <StatTile label="Total sessions" :value="stats.totalSessions" hint="All devices" />
        <StatTile label="Deep work" :value="deepWorkHours" hint="hours, completed sessions" />
      </div>
      <WeekGrid :config="events.state.config" :sessions="events.state.sessions" :stats="stats" />
      <WeeklyChart :sessions="events.state.sessions" />
    </template>
  </div>
</template>
