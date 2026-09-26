import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// While devgrowth-core is `npm link`ed from the CLI repo it lives outside this
// project, and the dev server refuses to serve files outside its allow list.
function linkedCoreDir() {
  try {
    return realpathSync(fileURLToPath(new URL('../node_modules/devgrowth-core', import.meta.url)));
  } catch {
    return null;
  }
}

const API = process.env.DEVGROWTH_API || 'http://localhost:3000';

export default defineConfig({
  plugins: [vue()],
  server: {
    // Same-origin in dev too, so the session cookie works without CORS.
    proxy: { '/v1': API, '/health': API },
    fs: { allow: ['..', linkedCoreDir()].filter(Boolean) }
  },
  test: {
    environment: 'jsdom'
  }
});
