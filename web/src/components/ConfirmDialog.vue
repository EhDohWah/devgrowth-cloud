<script setup>
import { nextTick, ref, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirm' },
  danger: { type: Boolean, default: false },
  busy: { type: Boolean, default: false }
});
const emit = defineEmits(['confirm', 'cancel']);
const confirmButton = ref(null);

watch(() => props.open, async open => {
  if (open) {
    await nextTick();
    confirmButton.value?.focus();
  }
});
</script>

<template>
  <div v-if="open" class="backdrop" @click.self="emit('cancel')" @keydown.esc="emit('cancel')">
    <div class="dialog card" role="dialog" aria-modal="true" :aria-label="title">
      <h2>{{ title }}</h2>
      <p v-if="message" class="muted">{{ message }}</p>
      <slot />
      <div class="actions">
        <button type="button" class="btn btn-ghost" data-test="cancel" @click="emit('cancel')">Cancel</button>
        <button
          ref="confirmButton"
          type="button"
          class="btn"
          :class="{ 'btn-danger': danger }"
          data-test="confirm"
          :disabled="busy"
          @click="emit('confirm')"
        >{{ confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed; inset: 0; background: rgb(0 0 0 / 0.45);
  display: grid; place-items: center; padding: 16px; z-index: 10;
}
.dialog { width: min(420px, 100%); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
