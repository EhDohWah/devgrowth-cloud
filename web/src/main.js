import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { createAppRouter } from './router.js';
import { setUnauthorizedHandler } from './api.js';
import { useAuthStore } from './stores/auth.js';
import { useEventsStore } from './stores/events.js';
import './styles.css';

const app = createApp(App);
const pinia = createPinia();
const router = createAppRouter();
app.use(pinia).use(router);

// Session expired or was revoked from another device: drop local state and sign in again.
setUnauthorizedHandler(() => {
  useAuthStore().clear();
  useEventsStore().reset();
  if (router.currentRoute.value.path !== '/login') {
    router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
  }
});

app.mount('#app');
