import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { SCHEMA_VERSION } from 'devgrowth-core/events';
import { api } from '../api.js';
import { deviceLabel } from '../deviceLabel.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const device = ref(null);
  const serverSchemaVersion = ref(null);
  // True once we've asked the server who we are, so the router guard asks only once.
  const checked = ref(false);

  const isLoggedIn = computed(() => user.value !== null);
  // The server knows event types this build doesn't; derived numbers may be incomplete.
  const updateAvailable = computed(() =>
    serverSchemaVersion.value !== null && serverSchemaVersion.value > SCHEMA_VERSION);

  function clear() {
    user.value = null;
    device.value = null;
  }

  async function fetchMe() {
    try {
      const me = await api.get('/v1/me');
      user.value = me.user;
      device.value = me.device;
      serverSchemaVersion.value = me.schemaVersion;
    } catch (err) {
      clear();
      if (err.status !== 401) throw err;
    } finally {
      checked.value = true;
    }
  }

  async function signIn(path, email, password) {
    await api.post(path, { email, password, deviceName: deviceLabel(), kind: 'web' });
    await fetchMe();
  }

  const login = (email, password) => signIn('/v1/auth/login', email, password);
  const register = (email, password) => signIn('/v1/auth/register', email, password);

  async function logout() {
    try {
      await api.post('/v1/auth/logout');
    } catch (err) {
      if (err.status !== 401) throw err; // already signed out is fine
    }
    clear();
  }

  return { user, device, serverSchemaVersion, checked, isLoggedIn, updateAvailable, clear, fetchMe, login, register, logout };
});
