import pg from 'pg';
import { config } from './env.js';

export const db = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 4000,
  statement_timeout: 8000,
  application_name: 'ai-diagnostics-local'
});

db.on('error', () => {
  console.error(JSON.stringify({ event: 'database_pool_error' }));
});
