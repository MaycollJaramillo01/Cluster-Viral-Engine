import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

// One dedicated connection owns the advisory lock and every migration transaction.
export async function migrate(pool: Pool, directory: string): Promise<{ applied: string[]; skipped: string[] }> {
  const client = await pool.connect();
  const result: { applied: string[]; skipped: string[] } = { applied: [], skipped: [] };
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock(736520101)'); locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now(),checksum_sha256 text)`);
    await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_sha256 text');
    const files = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const name of files) {
      const version = name.slice(0, -4), sql = await readFile(path.join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const old = await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1', [version]);
      if (old.rowCount) {
        if (old.rows[0].checksum_sha256 !== checksum) throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${version}`);
        result.skipped.push(version); continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations(version,checksum_sha256) VALUES($1,$2)
          ON CONFLICT(version) DO UPDATE SET checksum_sha256=excluded.checksum_sha256`, [version, checksum]);
        await client.query('COMMIT'); result.applied.push(version);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
    return result;
  } finally {
    try { if (locked) await client.query('SELECT pg_advisory_unlock(736520101)'); }
    finally { client.release(); }
  }
}
