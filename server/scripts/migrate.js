import 'dotenv/config';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const pool = createPool(process.env.DATABASE_URL);
try {
  const applied = await migrate(pool, { log: console.log });
  if (applied.length === 0) console.log('Database is up to date.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
