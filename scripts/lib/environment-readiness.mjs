import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function migrationChecksums(directory) {
  const names = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!names.length) throw new Error('NO_MIGRATIONS');
  return Promise.all(names.map(async name => ({ version: name.slice(0, -4),
    checksum_sha256: createHash('sha256').update(await readFile(path.join(directory, name))).digest('hex') })));
}

export function migrationsMatch(expected, actual) {
  if (!expected.length || expected.length !== actual.length) return false;
  const versions = new Map(actual.map(row => [row.version, row.checksum_sha256]));
  return versions.size === actual.length && expected.every(row => versions.get(row.version) === row.checksum_sha256);
}

// Never include driver messages, connection strings, account names or SQL in a report.
export async function inspectDatabase(pool, kind) {
  if (!['runtime', 'identity'].includes(kind)) throw new Error('INVALID_DATABASE_KIND');
  let client, begun = false, destroy = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY'); begun = true;
    await client.query("SET LOCAL statement_timeout='5000ms'");
    await client.query("SET LOCAL lock_timeout='2000ms'");
    const role = (await client.query(`SELECT rolsuper,rolbypassrls,
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p')
        AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns
      FROM pg_roles WHERE rolname=current_user`)).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls || role.owns) return { status: 'BLOCKED', code: 'UNSAFE_DATABASE_ROLE' };
    const schema = (await client.query(`SELECT
      (SELECT count(*)::int FROM pg_class WHERE oid IN
        ('app_users'::regclass,'memberships'::regclass,'organizations'::regclass,'projects'::regclass,'phase00_runs'::regclass)
        AND relrowsecurity AND relforcerowsecurity) AS rls_count,
      has_table_privilege(current_user,'app_users','SELECT') AS app_read,
      has_table_privilege(current_user,'auth_users','SELECT') AS auth_read,
      has_table_privilege(current_user,'audit_events','UPDATE') OR has_table_privilege(current_user,'audit_events','DELETE')
        OR has_table_privilege(current_user,'auth_events','UPDATE') OR has_table_privilege(current_user,'auth_events','DELETE') AS audit_mutable`)).rows[0];
    if (!schema || schema.rls_count !== 5 || schema.audit_mutable ||
      (kind === 'runtime' ? !schema.app_read || schema.auth_read : schema.app_read || !schema.auth_read)) {
      return { status: 'BLOCKED', code: 'DATABASE_PRIVILEGES_INVALID' };
    }
    const required = kind === 'runtime' ? [
      ...['app_users', 'memberships', 'organizations', 'projects', 'phase00_runs'].map(table => [table, 'SELECT']),
      ['phase00_runs', 'INSERT'], ['phase00_runs', 'UPDATE'], ['audit_events', 'INSERT'], ['outbox_events', 'INSERT'],
    ] : [
      ...['auth_users', 'auth_sessions', 'auth_accounts', 'auth_verifications', 'auth_two_factors', 'auth_rate_limits']
        .flatMap(table => ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map(privilege => [table, privilege])),
      ['auth_events', 'INSERT'],
    ];
    const grants = (await client.query(`SELECT bool_and(has_table_privilege(current_user,
      requirement->>0,requirement->>1)) AS privileges_valid
      FROM jsonb_array_elements($1::jsonb) requirement`, [JSON.stringify(required)])).rows[0];
    if (grants?.privileges_valid !== true) return { status: 'BLOCKED', code: 'REQUIRED_DATABASE_GRANTS_MISSING' };
    await client.query('ROLLBACK'); begun = false;
    return { status: 'READY', code: 'DATABASE_ROLE_VERIFIED' };
  } catch {
    return { status: 'BLOCKED', code: 'DATABASE_CHECK_FAILED' };
  } finally {
    if (client) {
      if (begun) { try { await client.query('ROLLBACK'); } catch { destroy = true; } }
      client.release(destroy);
    }
  }
}

export async function inspectMigrations(pool, expected) {
  let client, begun = false, destroy = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY'); begun = true;
    await client.query("SET LOCAL statement_timeout='5000ms'");
    const rows = (await client.query('SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version')).rows;
    await client.query('ROLLBACK'); begun = false;
    return migrationsMatch(expected, rows)
      ? { status: 'READY', code: 'MIGRATIONS_VERIFIED', count: rows.length }
      : { status: 'BLOCKED', code: 'MIGRATION_DRIFT' };
  } catch {
    return { status: 'BLOCKED', code: 'MIGRATION_CHECK_FAILED' };
  } finally {
    if (client) {
      if (begun) { try { await client.query('ROLLBACK'); } catch { destroy = true; } }
      client.release(destroy);
    }
  }
}
