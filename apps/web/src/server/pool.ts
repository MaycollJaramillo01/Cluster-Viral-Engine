import { Pool } from 'pg';

// Neon PgBouncer rejects PostgreSQL GUCs in the startup options package.
// Server timeouts belong on the role or inside the current transaction.
export function createApplicationPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000, query_timeout: 7000 });
  pool.on('error', () => { /* Never log credentials or raw driver errors. */ });
  return pool;
}
