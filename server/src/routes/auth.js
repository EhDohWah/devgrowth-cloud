import bcrypt from 'bcryptjs';
import { SCHEMA_VERSION } from 'devgrowth-core/events';
import { withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { generateToken, hashToken } from '../tokens.js';
import { SESSION_COOKIE } from '../auth.js';

const WEB_SESSION_DAYS = 30;

const credentialsSchema = {
  type: 'object',
  required: ['email', 'password', 'deviceName'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
    // bcrypt only uses the first 72 bytes of a password.
    password: { type: 'string', minLength: 8, maxLength: 72 },
    deviceName: { type: 'string', minLength: 1, maxLength: 100 },
    kind: { type: 'string', enum: ['cli', 'web'], default: 'cli' }
  }
};

export default async function authRoutes(app, { pool, authenticate, config }) {
  const rateLimit = { rateLimit: config.authRateLimit };

  // Compared against when the email is unknown, so "no such user" and
  // "wrong password" take the same time and can't be told apart.
  const dummyHash = await bcrypt.hash('devgrowth-timing-equalizer', config.bcryptRounds);

  /**
   * Create a device row for this login. CLI clients get the token in the
   * response body; web clients get it only as an httpOnly cookie, so page
   * JavaScript can never read it.
   */
  async function startSession(db, reply, userId, deviceName, kind) {
    const token = generateToken();
    const { rows } = await db.query(
      `INSERT INTO devices (user_id, name, kind, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'web' THEN now() + make_interval(days => $5) END)
       RETURNING id`,
      [userId, deviceName, kind, hashToken(token), WEB_SESSION_DAYS]
    );
    const deviceId = rows[0].id;
    if (kind === 'web') {
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.cookieSecure,
        path: '/',
        maxAge: WEB_SESSION_DAYS * 24 * 60 * 60
      });
      return { userId, deviceId };
    }
    return { userId, deviceId, token };
  }

  app.post('/v1/auth/register', { schema: { body: credentialsSchema }, config: rateLimit }, async (request, reply) => {
    const { email, password, deviceName, kind } = request.body;
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const result = await withTransaction(pool, async client => {
      let userId;
      try {
        const { rows } = await client.query(
          'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
          [email, passwordHash]
        );
        userId = rows[0].id;
      } catch (err) {
        if (err.code === '23505') {
          throw new HttpError(409, 'email_taken', 'An account with this email already exists');
        }
        throw err;
      }
      return startSession(client, reply, userId, deviceName, kind);
    });
    reply.code(201);
    return result;
  });

  app.post('/v1/auth/login', { schema: { body: credentialsSchema }, config: rateLimit }, async (request, reply) => {
    const { email, password, deviceName, kind } = request.body;
    const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const ok = await bcrypt.compare(password, user?.password_hash ?? dummyHash);
    if (!user || !ok) {
      throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');
    }
    return startSession(pool, reply, user.id, deviceName, kind);
  });

  app.post('/v1/auth/logout', { preHandler: authenticate }, async (request, reply) => {
    await pool.query('UPDATE devices SET revoked_at = now() WHERE id = $1', [request.device.id]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.code(204);
  });

  app.get('/v1/me', { preHandler: authenticate }, async request => {
    const { rows } = await pool.query(
      'SELECT count(*)::int AS event_count FROM events WHERE user_id = $1',
      [request.user.id]
    );
    return {
      user: request.user,
      device: request.device,
      eventCount: rows[0].event_count,
      schemaVersion: SCHEMA_VERSION
    };
  });
}
