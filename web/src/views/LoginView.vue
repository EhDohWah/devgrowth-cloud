<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { safeRedirect } from '../router.js';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const mode = ref('login');
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    if (mode.value === 'login') await auth.login(email.value, password.value);
    else await auth.register(email.value, password.value);
    router.push(safeRedirect(route.query.redirect));
  } catch (err) {
    error.value = err.code === 'validation_error'
      ? 'Enter a valid email and a password of 8–72 characters.'
      : err.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login">
    <div class="card box">
      <div class="brand-lg">dev<strong>Growth</strong></div>
      <p class="muted">Your sessions, streaks and milestones from every device.</p>

      <div class="tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="mode === 'login'" :class="{ on: mode === 'login' }" @click="mode = 'login'; error = ''">Sign in</button>
        <button type="button" role="tab" :aria-selected="mode === 'register'" :class="{ on: mode === 'register' }" @click="mode = 'register'; error = ''">Create account</button>
      </div>

      <form class="stack form" @submit.prevent="submit">
        <label class="field">Email
          <input v-model.trim="email" type="email" autocomplete="email" required />
        </label>
        <label class="field">Password
          <input
            v-model="password"
            type="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            minlength="8"
            maxlength="72"
            required
          />
        </label>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <button type="submit" class="btn" :disabled="busy">
          {{ busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account' }}
        </button>
      </form>
      <p class="muted small hint">
        Use the same account as the CLI: <code>devgrowth login</code>.
      </p>
    </div>
  </div>
</template>

<style scoped>
.login { min-height: 80vh; display: grid; place-items: center; }
.box { width: min(400px, 100%); }
.brand-lg { font-size: 1.6rem; margin-bottom: 4px; }
.brand-lg strong { color: var(--accent); }
.tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: var(--surface-2); padding: 4px; border-radius: 10px; margin: 16px 0; }
.tabs button { font: inherit; font-weight: 600; border: 0; background: transparent; color: var(--text-secondary); padding: 8px; border-radius: 8px; cursor: pointer; }
.tabs button.on { background: var(--surface-1); color: var(--text-primary); box-shadow: var(--shadow); }
.form { gap: 14px; }
.hint { margin-top: 16px; }
</style>
