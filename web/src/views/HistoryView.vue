<script setup>
import { computed, ref } from 'vue';
import { useEventsStore } from '../stores/events.js';
import { shortDateFromKey, fromDateKey, DAY_NAMES } from '../dates.js';

const events = useEventsStore();
const skill = ref('');
const week = ref('');
const search = ref('');

const STATUS_ICON = { Completed: '✅', Light: '🟡', Interrupted: '⏹️' };

const sessions = computed(() => [...events.state.sessions].sort((a, b) =>
  b.sessionDate.localeCompare(a.sessionDate) || b.occurredAt.localeCompare(a.occurredAt)));

const skills = computed(() => [...new Set(sessions.value.map(s => s.skill))].sort());
const weeks = computed(() => [...new Set(sessions.value.map(s => s.weekOf))]);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return sessions.value.filter(s =>
    (!skill.value || s.skill === skill.value)
    && (!week.value || s.weekOf === week.value)
    && (!q || s.message.toLowerCase().includes(q) || (s.resource ?? '').toLowerCase().includes(q)));
});

const groups = computed(() => {
  const byWeek = new Map();
  for (const s of filtered.value) {
    if (!byWeek.has(s.weekOf)) byWeek.set(s.weekOf, []);
    byWeek.get(s.weekOf).push(s);
  }
  return [...byWeek].map(([weekOf, items]) => ({ weekOf, items }));
});

function dayLabel(key) {
  const d = fromDateKey(key);
  return `${DAY_NAMES[(d.getDay() + 6) % 7]}, ${shortDateFromKey(key)}`;
}

function clear() {
  skill.value = '';
  week.value = '';
  search.value = '';
}
</script>

<template>
  <div class="stack">
    <div class="page-head">
      <div>
        <h1>History</h1>
        <p class="muted">{{ filtered.length }} of {{ sessions.length }} sessions</p>
      </div>
    </div>

    <div class="card filters">
      <label class="field">Skill
        <select v-model="skill" data-test="skill">
          <option value="">All skills</option>
          <option v-for="s in skills" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <label class="field">Week
        <select v-model="week" data-test="week">
          <option value="">All weeks</option>
          <option v-for="w in weeks" :key="w" :value="w">Week of {{ shortDateFromKey(w) }}</option>
        </select>
      </label>
      <label class="field grow">Search
        <input v-model="search" type="search" placeholder="Search your logs" data-test="search" />
      </label>
      <button type="button" class="btn btn-ghost" :disabled="!skill && !week && !search" @click="clear">Clear</button>
    </div>

    <p v-if="!events.loaded" class="muted">Loading…</p>
    <div v-else-if="filtered.length === 0" class="card empty muted">
      {{ sessions.length === 0 ? 'No sessions synced yet.' : 'No sessions match these filters.' }}
    </div>

    <section v-for="g in groups" :key="g.weekOf" class="card" :aria-label="`Week of ${shortDateFromKey(g.weekOf)}`">
      <h2>Week of {{ shortDateFromKey(g.weekOf) }}</h2>
      <ul class="entries">
        <li v-for="s in g.items" :key="s.id" class="entry" data-test="entry">
          <div class="meta">
            <span class="date">{{ dayLabel(s.sessionDate) }}</span>
            <span class="skill">{{ s.skill }}</span>
            <span class="muted small"><span aria-hidden="true">{{ STATUS_ICON[s.status] }}</span> {{ s.status }} · {{ s.duration }} min</span>
            <span v-if="s.resource" class="muted small">{{ s.resource }}</span>
          </div>
          <!-- User-written text: always rendered as text, never as HTML. -->
          <p class="message">{{ s.message }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.filters { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.filters .field { min-width: 150px; }
.filters .grow { flex: 1 1 220px; }
.entries { list-style: none; margin: 0; padding: 0; display: grid; }
.entry { padding: 12px 0; border-top: 1px solid var(--border); }
.entry:first-child { border-top: 0; padding-top: 0; }
.meta { display: flex; gap: 6px 14px; flex-wrap: wrap; align-items: baseline; }
.date { font-weight: 600; }
.skill { text-transform: capitalize; font-weight: 500; }
.message { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
