<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  hint: { type: String, default: '' },
  hero: { type: Boolean, default: false }
});
</script>

<template>
  <div class="card tile" :class="{ hero }">
    <div class="tile-label">{{ label }}</div>
    <div class="tile-value">{{ value }}</div>
    <div v-if="hint" class="tile-hint muted small">{{ hint }}</div>
  </div>
</template>

<style scoped>
.tile { display: grid; gap: 2px; align-content: start; }
.tile-label { font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; }
.tile-value { font-size: 2rem; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.hero .tile-value { font-size: 3rem; line-height: 1.1; }
</style>
