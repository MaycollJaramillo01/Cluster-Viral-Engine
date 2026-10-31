import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';
import path from 'node:path';
import { migrate } from './migrations';
import { validateMigrationUrl } from './config';
import { applyGrants } from './development';

async function main() {
  loadEnvConfig(process.cwd());
  const environment = process.env.APP_ENV;
  if (!['local', 'development', 'preview', 'production'].includes(environment ?? '')) throw new Error('APP_ENV_REQUIRED');
  if (environment === 'production' && !process.argv.includes('--production-reviewed')) throw new Error('PRODUCTION_REVIEW_FLAG_REQUIRED');
  const url = validateMigrationUrl(process.env.DATABASE_URL_UNPOOLED ?? '', environment!);
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000, options: '-c lock_timeout=5000 -c statement_timeout=30000' });
  try {
    console.log(JSON.stringify(await migrate(pool, path.resolve(process.cwd(), '../../db/migrations'))));
    // Fuera de local los roles los provisiona un operador con db/runtime-grants.sql.
    if (environment === 'local') await applyGrants(pool, decodeURIComponent(new URL(process.env.DATABASE_URL!).username), decodeURIComponent(new URL(process.env.AUTH_DATABASE_URL!).username));
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error && error.message.startsWith('MIGRATION_') ? error.message : 'MIGRATION_FAILED_CHECK_CONFIGURATION'); process.exitCode = 1; });
