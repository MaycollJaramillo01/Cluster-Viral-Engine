import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';
import { parseConfig, validateMigrationUrl } from '../apps/web/src/server/config';
import { migrationChecksums, inspectDatabase, inspectMigrations } from './lib/environment-readiness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvConfig(path.join(root, 'apps/web'));

async function main() {
  const config = parseConfig(process.env);
  const migrationUrl = validateMigrationUrl(process.env.DATABASE_URL_UNPOOLED ?? '', config.APP_ENV);
  const direct = new URL(migrationUrl), runtimeUrl = new URL(config.DATABASE_URL);
  if (direct.hostname !== runtimeUrl.hostname.replace('-pooler.', '.') || direct.pathname !== runtimeUrl.pathname ||
    (direct.port || '5432') !== (runtimeUrl.port || '5432') ||
    [runtimeUrl.username, new URL(config.AUTH_DATABASE_URL).username].includes(direct.username)) {
    throw new Error('MIGRATOR_MUST_TARGET_SAME_DATABASE_WITH_SEPARATE_ROLE');
  }
  const expected = await migrationChecksums(path.join(root, 'db/migrations'));
  const pools = [config.DATABASE_URL, config.AUTH_DATABASE_URL, migrationUrl].map(connectionString => new Pool({
    connectionString, max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
  }));
  try {
    const [runtime, identity, migrations] = await Promise.all([
      inspectDatabase(pools[0], 'runtime'), inspectDatabase(pools[1], 'identity'), inspectMigrations(pools[2], expected),
    ]);
    const ready = [runtime, identity, migrations].every(result => result.status === 'READY');
    console.log(JSON.stringify({ status: ready ? 'DATABASE_READY' : 'BLOCKED_EXTERNAL',
      environment: config.APP_ENV, runtime, identity, migrations,
      publication_enabled: false, editorial_gate: 'NOT_EVALUATED' }, null, 2));
    if (!ready) process.exitCode = 1;
  } finally { await Promise.all(pools.map(pool => pool.end())); }
}

main().catch(() => {
  console.error(JSON.stringify({ status: 'BLOCKED_EXTERNAL', code: 'ENVIRONMENT_CONFIGURATION_INVALID', publication_enabled: false }));
  process.exitCode = 1;
});
