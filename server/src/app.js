import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { HttpError, errorBody } from './errors.js';
import { createAuthenticate } from './auth.js';
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';
import eventRoutes from './routes/events.js';

const DEFAULTS = {
  bcryptRounds: 12,
  cookieSecure: false,
  trustProxy: false,
  webDist: null,
  logger: false,
  // Per IP, applied to register and login only.
  authRateLimit: { max: 10, timeWindow: '1 minute' }
};

/**
 * Build the Fastify app without listening, so tests can call `app.inject()`.
 * `pool` is a pg Pool; the caller owns its lifecycle.
 */
export async function buildApp({ pool, config = {} }) {
  const cfg = { ...DEFAULTS, ...config };
  const app = Fastify({ logger: cfg.logger, trustProxy: cfg.trustProxy });

  app.decorateRequest('user', null);
  app.decorateRequest('device', null);

  // Every error leaves the API as { error: { code, message, details? } }.
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    if (err.validation) {
      return reply.code(400).send(errorBody('validation_error', err.message));
    }
    if (err.statusCode && err.statusCode < 500) {
      // Framework-level client errors: malformed JSON, body too large, ...
      return reply.code(err.statusCode).send(errorBody(err.code || 'bad_request', err.message));
    }
    request.log.error(err);
    return reply.code(500).send(errorBody('internal_error', 'Internal server error'));
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new HttpError(429, 'rate_limited', `Too many attempts. Try again in ${context.after}.`)
  });

  const authenticate = createAuthenticate(pool);
  const routeOptions = { pool, authenticate, config: cfg };
  await app.register(authRoutes, routeOptions);
  await app.register(deviceRoutes, routeOptions);
  await app.register(eventRoutes, routeOptions);

  app.get('/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send(errorBody('db_unavailable', 'Database is unreachable'));
    }
  });

  // The dashboard (web/dist) is served from the same origin as the API, so the
  // session cookie works without CORS. Unknown non-API GETs fall back to
  // index.html so client-side routes like /history survive a page refresh.
  const serveWeb = Boolean(cfg.webDist) && existsSync(path.join(cfg.webDist, 'index.html'));
  if (serveWeb) {
    await app.register(fastifyStatic, { root: path.resolve(cfg.webDist) });
  }

  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url === '/v1' || request.url.startsWith('/v1/');
    if (serveWeb && !isApi && (request.method === 'GET' || request.method === 'HEAD')) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send(errorBody('not_found', `Route ${request.method} ${request.url.split('?')[0]} not found`));
  });

  return app;
}
