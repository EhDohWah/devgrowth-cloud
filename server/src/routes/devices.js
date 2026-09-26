import { HttpError } from '../errors.js';
import { SESSION_COOKIE } from '../auth.js';

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

function toIso(value) {
  return value ? value.toISOString() : null;
}

export default async function deviceRoutes(app, { pool, authenticate }) {
  // Active devices only: revoked and expired sessions are not shown.
  app.get('/v1/devices', { preHandler: authenticate }, async request => {
    const { rows } = await pool.query(
      `SELECT id, name, kind, created_at, last_seen_at, expires_at
         FROM devices
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at`,
      [request.user.id]
    );
    return {
      devices: rows.map(row => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        createdAt: toIso(row.created_at),
        lastSeenAt: toIso(row.last_seen_at),
        expiresAt: toIso(row.expires_at),
        current: row.id === request.device.id
      }))
    };
  });

  app.delete('/v1/devices/:id', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', pattern: UUID_PATTERN } }
      }
    }
  }, async (request, reply) => {
    // Scoped to the caller's own devices: another user's id is simply "not found".
    const { rowCount } = await pool.query(
      `UPDATE devices SET revoked_at = now()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [request.params.id, request.user.id]
    );
    if (rowCount === 0) {
      throw new HttpError(404, 'not_found', 'Device not found');
    }
    if (request.params.id.toLowerCase() === request.device.id) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
    }
    reply.code(204);
  });
}
