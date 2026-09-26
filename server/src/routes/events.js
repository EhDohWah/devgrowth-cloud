import { validateEvent } from 'devgrowth-core/events';
import { withTransaction } from '../db.js';
import { HttpError } from '../errors.js';

export const MAX_PUSH = 500;
export const MAX_PULL = 1000;

export default async function eventRoutes(app, { pool, authenticate }) {
  app.post('/v1/events', {
    preHandler: authenticate,
    bodyLimit: 5 * 1024 * 1024,
    schema: {
      body: {
        type: 'object',
        required: ['events'],
        additionalProperties: false,
        properties: {
          events: { type: 'array', minItems: 1, maxItems: MAX_PUSH, items: { type: 'object' } }
        }
      }
    }
  }, async request => {
    const { events } = request.body;

    // All-or-nothing: one bad event rejects the whole batch, so a client
    // never has to work out which part of a push was stored.
    const invalid = [];
    events.forEach((event, index) => {
      const errors = validateEvent(event);
      if (errors.length > 0) invalid.push({ index, id: event.id ?? null, errors });
    });
    if (invalid.length > 0) {
      throw new HttpError(400, 'invalid_event', `${invalid.length} event(s) failed validation`, invalid);
    }

    const rows = events.map(e => ({
      id: e.id.toLowerCase(),
      type: e.type,
      v: e.v,
      payload: e.payload,
      occurred_at: e.occurredAt
    }));

    const inserted = await withTransaction(pool, async client => {
      // Serialize this user's pushes. server_seq is taken at insert time but
      // becomes visible at commit; without the lock, two concurrent pushes could
      // commit out of order and a puller whose cursor already passed the later
      // seq would never see the earlier one.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [request.user.id]);
      const result = await client.query(
        `INSERT INTO events (user_id, id, device_id, type, v, payload, occurred_at)
         SELECT $1, e.id, $2, e.type, e.v, e.payload, e.occurred_at
           FROM jsonb_to_recordset($3::jsonb)
             AS e(id uuid, type text, v integer, payload jsonb, occurred_at timestamptz)
         ON CONFLICT (user_id, id) DO NOTHING
         RETURNING id`,
        [request.user.id, request.device.id, JSON.stringify(rows)]
      );
      return new Set(result.rows.map(r => r.id));
    });

    // Duplicates are ids this user already pushed (e.g. a retry after a
    // timeout). They are not errors: the push is idempotent.
    const uniqueIds = [...new Set(rows.map(r => r.id))];
    return {
      accepted: uniqueIds.filter(id => inserted.has(id)),
      duplicates: uniqueIds.filter(id => !inserted.has(id))
    };
  });

  app.get('/v1/events', {
    preHandler: authenticate,
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          since: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: MAX_PULL, default: MAX_PULL }
        }
      }
    }
  }, async request => {
    const { since, limit } = request.query;
    const { rows } = await pool.query(
      `SELECT server_seq, id, device_id, type, v, payload, occurred_at
         FROM events
        WHERE user_id = $1 AND server_seq > $2
        ORDER BY server_seq
        LIMIT $3`,
      [request.user.id, since, limit + 1]
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const events = page.map(row => ({
      // bigserial comes back from pg as a string; it stays well below 2^53.
      serverSeq: Number(row.server_seq),
      id: row.id,
      deviceId: row.device_id,
      type: row.type,
      v: row.v,
      payload: row.payload,
      occurredAt: row.occurred_at.toISOString()
    }));
    return {
      events,
      nextCursor: events.length > 0 ? events[events.length - 1].serverSeq : since,
      hasMore
    };
  });
}
