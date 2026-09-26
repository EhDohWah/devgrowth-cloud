<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { DEFAULT_CONFIG } from 'devgrowth-core/derive';
import { api } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useEventsStore } from '../stores/events.js';
import { DAY_KEYS, DAY_NAMES } from '../dates.js';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const events = useEventsStore();
const auth = useAuthStore();
const router = useRouter();

const clone = value => JSON.parse(JSON.stringify(value));
// No config synced yet → start from the same defaults `devgrowth init` writes.
const source = computed(() => events.state.config ?? DEFAULT_CONFIG);
const form = ref(clone(source.value));
const dirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(source.value));

// Another device changed the config: follow it, unless the user is mid-edit.
watch(source, next => { if (!dirty.value) form.value = clone(next); });

const saveError = ref('');
const saved = ref(false);
const saving = ref(false);

function validate(config) {
  const d = config.session?.durationMinutes;
  if (!Number.isInteger(d) || d < 1 || d > 240) return 'Session length must be a whole number of minutes (1–240).';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config.session?.startTime ?? '')) return 'Start time must be HH:MM (24-hour).';
  const r = config.notification?.reminderMinutesBefore;
  if (!Number.isInteger(r) || r < 0 || r > 120) return 'Reminder must be 0–120 minutes.';
  if (DAY_KEYS.some(k => !config.schedule?.[k]?.skill?.trim())) return 'Every day needs a skill (use "rest" for a day off).';
  return '';
}

async function save() {
  saved.value = false;
  const config = clone(form.value);
  // Empty optional fields are stored as null, as in the CLI's config.json.
  for (const key of DAY_KEYS) {
    const day = config.schedule[key];
    day.skill = day.skill.trim();
    for (const field of ['resource', 'url']) {
      if (typeof day[field] === 'string' && day[field].trim() === '') day[field] = null;
    }
  }
  saveError.value = validate(config);
  if (saveError.value) return;
  saving.value = true;
  try {
    // Snapshots are last-writer-wins, so always send the whole config.
    await events.addEvent('config_snapshot', { config });
    form.value = clone(source.value);
    saved.value = true;
  } catch (err) {
    saveError.value = err.message;
  } finally {
    saving.value = false;
  }
}

function reset() {
  form.value = clone(source.value);
  saveError.value = '';
}

// Devices
const devices = ref([]);
const devicesError = ref('');
const revoking = ref(null);
const busy = ref(false);

async function loadDevices() {
  try {
    devices.value = (await api.get('/v1/devices')).devices;
    devicesError.value = '';
  } catch (err) {
    devicesError.value = err.message;
  }
}

async function revoke() {
  const device = revoking.value;
  busy.value = true;
  try {
    await api.del(`/v1/devices/${device.id}`);
    if (device.current) {
      auth.clear();
      router.push('/login');
      return;
    }
    await loadDevices();
  } catch (err) {
    devicesError.value = err.message;
  } finally {
    busy.value = false;
    revoking.value = null;
  }
}

function lastSeen(device) {
  return device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'never';
}

onMounted(loadDevices);
</script>

<template>
  <div class="stack">
    <div class="page-head">
      <div>
        <h1>Settings</h1>
        <p class="muted">Changes sync to the CLI on every device the next time it runs.</p>
      </div>
    </div>

    <form class="card stack" aria-labelledby="schedule-title" @submit.prevent="save">
      <h2 id="schedule-title">Weekly schedule</h2>
      <div class="schedule">
        <div class="row head muted small" aria-hidden="true">
          <span>Day</span><span>Skill</span><span>Focus</span><span>Resource</span><span>URL</span>
        </div>
        <fieldset v-for="(key, i) in DAY_KEYS" :key="key" class="row" :data-day="key">
          <legend class="day">{{ DAY_NAMES[i] }}</legend>
          <input v-model="form.schedule[key].skill" :aria-label="`${DAY_NAMES[i]} skill`" list="skills" />
          <input v-model="form.schedule[key].focus" :aria-label="`${DAY_NAMES[i]} focus`" />
          <input v-model="form.schedule[key].resource" :aria-label="`${DAY_NAMES[i]} resource`" placeholder="—" />
          <input v-model="form.schedule[key].url" type="url" :aria-label="`${DAY_NAMES[i]} URL`" placeholder="https://" />
        </fieldset>
        <datalist id="skills">
          <option value="laravel" /><option value="vue" /><option value="rust" /><option value="review" /><option value="rest" />
        </datalist>
      </div>

      <h2>Session</h2>
      <div class="grid-3">
        <label class="field">Start time
          <input v-model="form.session.startTime" type="time" data-test="startTime" />
        </label>
        <label class="field">Session length (minutes)
          <input v-model.number="form.session.durationMinutes" type="number" min="1" max="240" data-test="duration" />
        </label>
        <label class="field">Reminder (minutes before)
          <input v-model.number="form.notification.reminderMinutesBefore" type="number" min="0" max="120" />
        </label>
      </div>
      <label class="check">
        <input v-model="form.notification.enabled" type="checkbox" /> Desktop reminder before each session
      </label>

      <p v-if="saveError" class="error-text" role="alert">{{ saveError }}</p>
      <p v-else-if="saved && !dirty" class="muted" role="status">Saved. Your devices pick this up on their next sync.</p>
      <div class="actions">
        <button type="button" class="btn btn-ghost" :disabled="!dirty || saving" @click="reset">Reset</button>
        <button type="submit" class="btn" :disabled="!dirty || saving" data-test="save">{{ saving ? 'Saving…' : 'Save changes' }}</button>
      </div>
    </form>

    <section class="card" aria-labelledby="devices-title">
      <h2 id="devices-title">Signed-in devices</h2>
      <p v-if="devicesError" class="error-text" role="alert">{{ devicesError }}</p>
      <ul class="devices">
        <li v-for="d in devices" :key="d.id" class="device">
          <div>
            <div class="device-name">
              {{ d.name }}
              <span class="badge">{{ d.kind === 'cli' ? 'CLI' : 'Web' }}</span>
              <span v-if="d.current" class="badge badge-accent">This browser</span>
            </div>
            <div class="muted small">Last seen {{ lastSeen(d) }}</div>
          </div>
          <button type="button" class="btn btn-ghost" @click="revoking = d">{{ d.current ? 'Sign out' : 'Revoke' }}</button>
        </li>
      </ul>
    </section>

    <ConfirmDialog
      :open="revoking !== null"
      :title="revoking?.current ? 'Sign out of this browser?' : 'Revoke this device?'"
      :message="revoking ? `“${revoking.name}” will be signed out and must log in again to sync.` : ''"
      :confirm-label="revoking?.current ? 'Sign out' : 'Revoke'"
      danger
      :busy="busy"
      @confirm="revoke"
      @cancel="revoking = null"
    />
  </div>
</template>

<style scoped>
.schedule { display: grid; gap: 8px; }
.row { display: grid; grid-template-columns: 3rem 1fr 1.4fr 1.2fr 1.6fr; gap: 8px; align-items: center; border: 0; padding: 0; margin: 0; }
.row.head { padding-bottom: 0; }
.day { font-weight: 600; float: left; padding: 0; }
.check { display: flex; gap: 8px; align-items: center; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.devices { list-style: none; margin: 0; padding: 0; }
.device { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border); }
.device:first-child { border-top: 0; }
.device-name { font-weight: 600; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.badge { font-size: 0.75rem; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); color: var(--text-secondary); }
.badge-accent { background: color-mix(in srgb, var(--accent) 18%, var(--surface-1)); color: var(--text-primary); }
@media (max-width: 860px) {
  .row { grid-template-columns: 1fr 1fr; }
  .row.head { display: none; }
  .day { grid-column: 1 / -1; }
}
</style>
