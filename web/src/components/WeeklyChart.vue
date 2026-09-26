<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getSessionDate, getWeekStart, toDateKey } from 'devgrowth-core/schedule';
import { addDays, shortDateFromKey } from '../dates.js';

const props = defineProps({
  sessions: { type: Array, required: true },
  now: { type: Date, default: () => new Date() },
  weeks: { type: Number, default: 12 }
});

const STREAK_TARGET = 4;

// Days logged per week (distinct session days), oldest → newest, current week last.
const data = computed(() => {
  const current = getWeekStart(getSessionDate(props.now));
  const daysByWeek = new Map();
  for (const s of props.sessions) {
    if (!daysByWeek.has(s.weekOf)) daysByWeek.set(s.weekOf, new Set());
    daysByWeek.get(s.weekOf).add(s.sessionDate);
  }
  return Array.from({ length: props.weeks }, (_, i) => {
    const weekOf = toDateKey(addDays(current, -7 * (props.weeks - 1 - i)));
    return { weekOf, label: shortDateFromKey(weekOf), days: daysByWeek.get(weekOf)?.size ?? 0, current: i === props.weeks - 1 };
  });
});

// Render at the container's real pixel width so text never scales down on phones.
const root = ref(null);
const width = ref(640);
let observer = null;
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !root.value) return;
  observer = new ResizeObserver(([entry]) => { width.value = Math.max(280, Math.floor(entry.contentRect.width)); });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

const HEIGHT = 220;
const M = { top: 12, right: 12, bottom: 28, left: 28 };
const geo = computed(() => {
  const yMax = Math.max(5, ...data.value.map(d => d.days));
  const innerW = width.value - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const slot = innerW / data.value.length;
  const barW = Math.max(6, Math.min(32, slot * 0.6));
  const y = v => M.top + innerH - (v / yMax) * innerH;
  const ticks = Array.from({ length: yMax + 1 }, (_, i) => i);
  const labelEvery = slot < 40 ? 2 : 1;
  const bars = data.value.map((d, i) => {
    const cx = M.left + slot * i + slot / 2;
    const top = y(d.days);
    const h = y(0) - top;
    return { ...d, i, cx, x: cx - barW / 2, top, h, slotX: M.left + slot * i, showLabel: (data.value.length - 1 - i) % labelEvery === 0 };
  });
  return { yMax, innerW, slot, barW, y, ticks, bars, baseline: y(0) };
});

// Column with 4px rounded top corners, square at the baseline.
function barPath(b, w) {
  const r = Math.min(4, b.h, w / 2);
  const x = b.x;
  const bottom = b.top + b.h;
  return `M${x},${bottom} V${b.top + r} Q${x},${b.top} ${x + r},${b.top} H${x + w - r} Q${x + w},${b.top} ${x + w},${b.top + r} V${bottom} Z`;
}

const active = ref(null);
const showTable = ref(false);
const tooltip = computed(() => {
  if (active.value === null) return null;
  const b = geo.value.bars[active.value];
  const left = Math.min(Math.max(b.cx, 70), width.value - 70);
  return { b, left, top: Math.max(b.top - 8, 24) };
});

function describe(b) {
  return `Week of ${b.label}: ${b.days} of 5 days logged${b.current ? ' (in progress)' : ''}`;
}
</script>

<template>
  <section class="card viz-root" aria-labelledby="chart-title">
    <div class="head">
      <div>
        <h2 id="chart-title">Days logged per week</h2>
        <p class="muted small">Last {{ weeks }} weeks · {{ STREAK_TARGET }}+ days keeps the streak alive</p>
      </div>
      <button type="button" class="btn btn-ghost" :aria-pressed="showTable" @click="showTable = !showTable">
        {{ showTable ? 'Show chart' : 'Show table' }}
      </button>
    </div>

    <div v-show="!showTable" ref="root" class="plot">
      <svg :width="width" :height="HEIGHT" role="img" :aria-label="`Column chart of days logged per week for the last ${weeks} weeks`">
        <defs>
          <pattern id="in-progress" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--series-1)" opacity="0.35" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--series-1)" stroke-width="3" />
          </pattern>
        </defs>
        <g class="grid">
          <g v-for="t in geo.ticks" :key="t">
            <line :x1="M.left" :x2="width - M.right" :y1="geo.y(t)" :y2="geo.y(t)" />
            <text :x="M.left - 8" :y="geo.y(t)" dy="0.32em" text-anchor="end">{{ t }}</text>
          </g>
        </g>
        <g class="target">
          <line :x1="M.left" :x2="width - M.right" :y1="geo.y(STREAK_TARGET)" :y2="geo.y(STREAK_TARGET)" />
          <text :x="width - M.right" :y="geo.y(STREAK_TARGET) - 6" text-anchor="end">streak target</text>
        </g>
        <g>
          <path
            v-for="b in geo.bars.filter(b => b.days > 0)"
            :key="b.weekOf"
            :d="barPath(b, geo.barW)"
            :fill="b.current ? 'url(#in-progress)' : 'var(--series-1)'"
            :class="{ dim: active !== null && active !== b.i }"
            data-test="bar"
          />
        </g>
        <g class="x-axis">
          <text
            v-for="b in geo.bars.filter(b => b.showLabel)"
            :key="b.weekOf"
            :x="b.cx"
            :y="geo.baseline + 18"
            text-anchor="middle"
          >{{ b.label }}</text>
        </g>
        <!-- Hit targets: the whole column slot, larger than the mark. -->
        <rect
          v-for="b in geo.bars"
          :key="`hit-${b.weekOf}`"
          class="hit"
          :x="b.slotX"
          :y="M.top"
          :width="geo.slot"
          :height="geo.baseline - M.top"
          tabindex="0"
          :aria-label="describe(b)"
          @mouseenter="active = b.i"
          @mouseleave="active = null"
          @focus="active = b.i"
          @blur="active = null"
        />
      </svg>
      <div v-if="tooltip" class="tooltip" role="status" :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }">
        <div class="tt-title">Week of {{ tooltip.b.label }}</div>
        <div><strong>{{ tooltip.b.days }}</strong> / 5 days logged</div>
        <div v-if="tooltip.b.current" class="muted">In progress</div>
      </div>
    </div>

    <table v-if="showTable" class="table">
      <thead><tr><th scope="col">Week of</th><th scope="col">Days logged</th></tr></thead>
      <tbody>
        <tr v-for="b in [...geo.bars].reverse()" :key="b.weekOf">
          <td>{{ b.label }}<span v-if="b.current" class="muted"> (in progress)</span></td>
          <td>{{ b.days }} / 5</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.head h2 { margin-bottom: 0; }
.plot { position: relative; width: 100%; overflow: hidden; padding-top: 4px; }
svg { display: block; overflow: visible; }
.grid line { stroke: var(--grid); stroke-width: 1; }
.grid text, .x-axis text { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.target line { stroke: var(--text-secondary); stroke-width: 1.5; stroke-dasharray: 4 4; }
.target text {
  fill: var(--text-secondary); font-size: 11px;
  paint-order: stroke; stroke: var(--surface-1); stroke-width: 4px; stroke-linejoin: round;
}
path { transition: opacity 120ms; }
path.dim { opacity: 0.45; }
.hit { fill: transparent; cursor: default; outline: none; }
.hit:focus-visible { stroke: var(--focus); stroke-width: 2; }
.tooltip {
  position: absolute; transform: translate(-50%, -100%); pointer-events: none; white-space: nowrap;
  background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px;
  font-size: 0.85rem; box-shadow: 0 4px 12px rgb(0 0 0 / 0.12);
}
.tt-title { font-weight: 600; }
.table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.table th, .table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.table th { color: var(--text-secondary); font-weight: 500; }
</style>
