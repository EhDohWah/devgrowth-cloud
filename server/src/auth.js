import { HttpError } from './errors.js';
import { hashToken } from './tokens.js';

export const SESSION_COOKIE = 'dg_session';
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'devgrowth-web';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Build the `preHandler` that authenticates a request and sets
 * `request.user` ({ id, email }) and `request.device` ({ id, name, kind }).
 *
 * - CLI clients send `Authorization: Bearer <token>`.
 * - The dashboard sends the httpOnly `dg_session` cookie. Because browsers
 *   attach cookies automatically, unsafe methods must also carry
 *   `X-Requested-With: devgrowth-web`, which a cross-site form cannot set
 *   (a CSRF guard on top of SameSite=Strict).
 */
export function createAuthenticate(pool) {
  return async function authenticate(request) {
    let token = null;
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      token = header.slice('Bearer '.length).trim();
    } else if (request.cookies?.[SESSION_COOKIE]) {
      token = request.cookies[SESSION_COOKIE];
      if (!SAFE_METHODS.has(request.method) && request.headers[CSRF_HEADER] !== CSRF_VALUE) {
        throw new HttpError(403, 'csrf_required', `Cookie-authenticated requests must send ${CSRF_HEADER}: ${CSRF_VALUE}`);
      }
    }
    if (!token) {
      throw new HttpError(401, 'unauthorized', 'Authentication required');
    }

    const { rows } = await pool.query(
      `SELECT d.id, d.name, d.kind, u.id AS user_id, u.email
         FROM devices d
         JOIN users u ON u.id = d.user_id
        WHERE d.token_hash = $1
          AND d.revoked_at IS NULL
          AND (d.expires_at IS NULL OR d.expires_at > now())`,
      [hashToken(token)]
    );
    if (rows.length === 0) {
      throw new HttpError(401, 'unauthorized', 'Session is invalid, expired or revoked');
    }
    const row = rows[0];
    request.user = { id: row.user_id, email: row.email };
    request.device = { id: row.id, name: row.name, kind: row.kind };

    // Throttled so a burst of requests doesn't write on every call.
    await pool.query(
      `UPDATE devices SET last_seen_at = now()
        WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '1 minute')`,
      [row.id]
    );
  };
}
