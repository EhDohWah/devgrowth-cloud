<script setup>
import { onBeforeUnmount, watch } from 'vue';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useEventsStore } from './stores/events.js';

const auth = useAuthStore();
const events = useEventsStore();
const router = useRouter();

const REFRESH_MS = 60_000;
let timer = null;

function onFocus() {
  events.sync();
}

function startSync() {
  events.sync();
  timer = setInterval(() => events.sync(), REFRESH_MS);
  window.addEventListener('focus', onFocus);
}

function stopSync() {
  clearInterval(timer);
  timer = null;
  window.removeEventListener('focus', onFocus);
}

watch(() => auth.isLoggedIn, loggedIn => {
  if (loggedIn) startSync();
  else { stopSync(); events.reset(); }
}, { immediate: true });

onBeforeUnmount(stopSync);

async function logout() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="shell">
    <header v-if="auth.isLoggedIn" class="topbar">
      <RouterLink to="/" class="brand" aria-label="devGrowth home">dev<strong>Growth</strong></RouterLink>
      <nav class="nav" aria-label="Main">
        <RouterLink to="/">Dashboard</RouterLink>
        <RouterLink to="/history">History</RouterLink>
        <RouterLink to="/milestones">Milestones</RouterLink>
        <RouterLink to="/settings">Settings</RouterLink>
      </nav>
      <div class="account">
        <span class="muted email" :title="auth.user.email">{{ auth.user.email }}</span>
        <button type="button" class="btn btn-ghost" @click="logout">Sign out</button>
      </div>
    </header>

    <div v-if="auth.updateAvailable" class="banner banner-warn" role="status">
      Your data includes changes from a newer version of devGrowth. Refresh this page, or update, to see everything.
    </div>
    <div v-if="auth.isLoggedIn && events.error" class="banner banner-error" role="alert">
      <span>{{ events.error }}</span>
      <button type="button" class="btn btn-ghost" @click="events.error = null">Dismiss</button>
    </div>

    <main class="main">
      <RouterView />
    </main>
  </div>
</template>
