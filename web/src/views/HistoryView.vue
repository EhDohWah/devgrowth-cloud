<script setup>
import { computed, nextTick, ref } from 'vue';
import { useEventsStore } from '../stores/events.js';
import ConfirmDialog from '../components/ConfirmDialog.vue';
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

// Same rule as the CLI's logger.normalizeMessage: a log is one line in the
// Markdown week files, so newlines are collapsed before the edit is recorded.
function normalizeMessage(message) {
  return String(message).replace(/\s*\r?\n\s*/g, ' ').trim();
}

const editingId = ref(null);
const draft = ref('');
const editError = ref('');
const saving = ref(false);

async function startEdit(s) {
  editingId.value = s.id;
  draft.value = s.message;
  editError.value = '';
  await nextTick();
  document.querySelector(`[data-edit-input="${s.id}"]`)?.focus();
}

function cancelEdit() {
  editingId.value = null;
  editError.value = '';
}

async function saveEdit(s) {
  const message = normalizeMessage(draft.value);
  if (!message) {
    editError.value = "The message can't be empty.";
    return;
  }
  if (message === s.message) {
    cancelEdit();
    return;
  }
  saving.value = true;
  try {
    await events.addEvent('session_edit', { targetId: s.id, message });
    cancelEdit();
  } catch {
    // The store rolls back and shows the error banner; keep the draft open.
  } finally {
    saving.value = false;
  }
}

const pendingDelete = ref(null);
const deleting = ref(false);

async function confirmDelete() {
  const target = pendingDelete.value;
  deleting.value = true;
  try {
    await events.addEvent('session_delete', { targetId: target.id });
  } catch {
    // The store rolls back and shows the error banner.
  } finally {
    deleting.value = false;
    pendingDelete.value = null;
  }
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
          <form v-if="editingId === s.id" class="edit" data-test="edit-form" @submit.prevent="saveEdit(s)">
            <label class="sr-only" :for="`edit-${s.id}`">Log message</label>
            <textarea
              :id="`edit-${s.id}`"
              v-model="draft"
              :data-edit-input="s.id"
              rows="3"
              maxlength="2000"
              @keydown.esc="cancelEdit"
              @keydown.enter.exact.prevent="saveEdit(s)"
            />
            <p v-if="editError" class="error-text" role="alert">{{ editError }}</p>
            <div class="row-actions">
              <button type="button" class="btn btn-ghost" data-test="edit-cancel" @click="cancelEdit">Cancel</button>
              <button type="submit" class="btn" data-test="edit-save" :disabled="saving">Save</button>
            </div>
          </form>
          <template v-else>
            <!-- User-written text: always rendered as text, never as HTML. -->
            <p class="message">{{ s.message }}<span v-if="s.edited" class="muted small edited" data-test="edited"> (edited)</span></p>
            <div class="row-actions">
              <button type="button" class="link-btn" data-test="edit" :aria-label="`Edit log from ${dayLabel(s.sessionDate)}`" @click="startEdit(s)">Edit</button>
              <button
                v-if="!s.inBaseline"
                type="button"
                class="link-btn danger"
                data-test="delete"
                :aria-label="`Delete log from ${dayLabel(s.sessionDate)}`"
                @click="pendingDelete = s"
              >Delete</button>
              <span v-else class="muted small" data-test="baseline-note" title="Its totals were imported when this account was first synced, so it can't be subtracted.">Recorded before sync · can't delete</span>
            </div>
          </template>
        </li>
      </ul>
    </section>

    <ConfirmDialog
      :open="pendingDelete !== null"
      title="Delete this log?"
      message="Your stats are recalculated without it, on every device. This can't be undone."
      confirm-label="Delete"
      danger
      :busy="deleting"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    >
      <blockquote v-if="pendingDelete" class="quote" data-test="delete-preview">
        <span class="muted small">{{ dayLabel(pendingDelete.sessionDate) }} · <span class="skill">{{ pendingDelete.skill }}</span></span>
        <span class="message">{{ pendingDelete.message }}</span>
      </blockquote>
    </ConfirmDialog>
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
.row-actions { display: flex; gap: 12px; align-items: center; justify-content: flex-end; margin-top: 6px; flex-wrap: wrap; }
.link-btn {
  font: inherit; font-size: 0.875rem; background: none; border: 0; padding: 2px 4px; border-radius: 6px;
  color: var(--accent); cursor: pointer;
}
.link-btn:hover { text-decoration: underline; }
.link-btn.danger { color: var(--bad); }
.edit { margin-top: 8px; display: grid; gap: 6px; }
.edit textarea {
  font: inherit; width: 100%; box-sizing: border-box; resize: vertical; padding: 8px 10px;
  color: var(--text-primary); background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px;
}
.edit .row-actions { margin-top: 0; }
.quote { margin: 12px 0 0; padding: 8px 12px; border-left: 3px solid var(--border); background: var(--surface-2); border-radius: 6px; display: grid; gap: 2px; }
</style>
