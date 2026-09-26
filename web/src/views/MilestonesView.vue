<script setup>
import { computed, ref } from 'vue';
import { useEventsStore } from '../stores/events.js';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const events = useEventsStore();
const SKILLS = ['laravel', 'vue', 'rust'];
const MONTH_LABEL = { m1: 'Month 1', m2: 'Month 2', m3: 'Month 3' };

/** "formRequests" → "Form requests", "tests30" → "Tests 30". */
function humanize(key) {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const cards = computed(() => SKILLS
  .filter(skill => events.state.milestones[skill])
  .map(skill => {
    const months = Object.entries(events.state.milestones[skill]).map(([month, m]) => ({
      month,
      label: MONTH_LABEL[month] ?? month,
      title: m.title,
      items: Object.entries(m.items).map(([item, done]) => ({ item, label: humanize(item), done }))
    }));
    const all = months.flatMap(m => m.items);
    const completed = all.filter(i => i.done).length;
    return { skill, months, completed, total: all.length, percent: all.length ? Math.round((completed / all.length) * 100) : 0 };
  }));

const pending = ref(null);
const saving = ref(false);

function ask(skill, month, item) {
  pending.value = { skill, month, item: item.item, label: item.label };
}

async function confirm() {
  const { skill, month, item } = pending.value;
  saving.value = true;
  try {
    await events.addEvent('milestone_check', { skill, month, item });
  } catch {
    // The store rolls back and shows the error banner.
  } finally {
    saving.value = false;
    pending.value = null;
  }
}
</script>

<template>
  <div class="stack">
    <div class="page-head">
      <div>
        <h1>Milestones</h1>
        <p class="muted">Tick an item when you've done it. Checks sync to all your devices.</p>
      </div>
    </div>

    <section v-for="card in cards" :key="card.skill" class="card" :aria-label="`${card.skill} milestones`" :data-skill="card.skill">
      <div class="card-head">
        <h2 class="skill">{{ card.skill }}</h2>
        <span class="muted small" data-test="progress">{{ card.completed }}/{{ card.total }} · {{ card.percent }}%</span>
      </div>
      <div class="bar" role="progressbar" :aria-valuenow="card.percent" aria-valuemin="0" aria-valuemax="100" :aria-label="`${card.skill} progress`">
        <div class="fill" :style="{ width: `${card.percent}%` }" />
      </div>
      <div class="grid-3 months">
        <div v-for="m in card.months" :key="m.month" class="month">
          <div class="month-head"><strong>{{ m.label }}</strong> <span class="muted small">{{ m.title }}</span></div>
          <ul>
            <li v-for="i in m.items" :key="i.item">
              <button
                type="button"
                class="item"
                :class="{ done: i.done }"
                :disabled="i.done"
                :aria-pressed="i.done"
                :data-item="`${card.skill}.${m.month}.${i.item}`"
                @click="ask(card.skill, m.month, i)"
              >
                <span class="box" aria-hidden="true">{{ i.done ? '✓' : '' }}</span>
                <span>{{ i.label }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <ConfirmDialog
      :open="pending !== null"
      title="Mark as done?"
      :message="pending ? `“${pending.label}” (${pending.skill}). This can't be undone, and it syncs to all your devices.` : ''"
      confirm-label="Mark done"
      :busy="saving"
      @confirm="confirm"
      @cancel="pending = null"
    />
  </div>
</template>

<style scoped>
.card-head { display: flex; justify-content: space-between; align-items: baseline; }
.skill { text-transform: capitalize; }
.bar { height: 8px; background: var(--surface-2); border-radius: 999px; overflow: hidden; margin-bottom: 16px; }
.fill { height: 100%; background: var(--series-1); border-radius: 999px; transition: width 200ms; }
.month-head { margin-bottom: 6px; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.item {
  font: inherit; width: 100%; display: flex; gap: 10px; align-items: center; text-align: left;
  background: transparent; color: var(--text-primary); border: 1px solid transparent; border-radius: 8px;
  padding: 6px 8px; cursor: pointer;
}
.item:hover:not(:disabled) { background: var(--surface-2); border-color: var(--border); }
.item.done { cursor: default; color: var(--text-secondary); }
.box {
  flex: none; width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid var(--text-muted);
  display: grid; place-items: center; font-size: 0.8rem; font-weight: 700;
}
.done .box { background: var(--good); border-color: var(--good); color: #fff; }
</style>
