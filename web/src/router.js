import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import HistoryView from './views/HistoryView.vue';
import MilestonesView from './views/MilestonesView.vue';
import SettingsView from './views/SettingsView.vue';

export const routes = [
  { path: '/login', component: LoginView, meta: { public: true, title: 'Sign in' } },
  { path: '/', component: DashboardView, meta: { title: 'Dashboard' } },
  { path: '/history', component: HistoryView, meta: { title: 'History' } },
  { path: '/milestones', component: MilestonesView, meta: { title: 'Milestones' } },
  { path: '/settings', component: SettingsView, meta: { title: 'Settings' } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];

/** Only same-app paths, never `//evil.example` or absolute URLs. */
export function safeRedirect(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function createAppRouter(history = createWebHistory()) {
  const router = createRouter({ history, routes });

  router.beforeEach(async to => {
    const auth = useAuthStore();
    if (!auth.checked) {
      // A network failure here just means "treat as signed out".
      await auth.fetchMe().catch(() => {});
    }
    if (to.meta.public) {
      return auth.isLoggedIn ? safeRedirect(to.query.redirect) : true;
    }
    if (!auth.isLoggedIn) {
      return to.fullPath === '/' ? '/login' : { path: '/login', query: { redirect: to.fullPath } };
    }
    return true;
  });

  router.afterEach(to => {
    document.title = to.meta.title ? `${to.meta.title} · devGrowth` : 'devGrowth';
  });

  return router;
}
