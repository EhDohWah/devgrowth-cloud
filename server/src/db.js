import pg from 'pg';

export function createPool(connectionString) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env.');
  }
  return new pg.Pool({ connectionString });
}

/**
 * Run `fn(client)` inside a transaction on one pooled connection.
 * Commits if `fn` resolves, rolls back if it throws.
 */
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
