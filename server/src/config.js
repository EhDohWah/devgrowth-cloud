import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

/** Read the server's settings from environment variables (see .env.example). */
export function loadConfig(env = process.env) {
  return {
    databaseUrl: env.DATABASE_URL,
    port: Number(env.PORT || 3000),
    host: env.HOST || '127.0.0.1',
    bcryptRounds: Number(env.BCRYPT_ROUNDS || 12),
    cookieSecure: bool(env.COOKIE_SECURE, false),
    trustProxy: bool(env.TRUST_PROXY, false),
    // Relative paths resolve against server/, not the shell's cwd.
    webDist: path.resolve(SERVER_ROOT, env.WEB_DIST || '../web/dist'),
    logger: true
  };
}
