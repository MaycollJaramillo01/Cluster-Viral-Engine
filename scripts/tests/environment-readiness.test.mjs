import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectDatabase, inspectMigrations, migrationChecksums, migrationsMatch } from '../lib/environment-readiness.mjs';
import { fileURLToPath } from 'node:url';

function database({ role = {}, schema = {}, history = [], failure, rollbackFails = false, grants = true } = {}) {
  const queries = [], releases = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql === 'ROLLBACK' && rollbackFails) throw new Error('private driver detail');
      if (sql.includes('FROM pg_roles')) {
        if (failure) throw new Error(failure);
        return { rows: [{ rolsuper: false, rolbypassrls: false, owns: false, ...role }] };
      }
      if (sql.includes('AS rls_count')) return { rows: [{ rls_count: 5, app_read: true, auth_read: false, audit_mutable: false, ...schema }] };
      if (sql.includes('AS privileges_valid')) return { rows: [{ privileges_valid: grants }] };
      return { rows: history };
    },
    release(destroy) { releases.push(destroy); },
  };
  return { pool: { async connect() { return client; } }, queries, releases };
}

test('real migration files have unique checksums; missing, extra, duplicate and altered history is rejected', async () => {
  const expected = await migrationChecksums(fileURLToPath(new URL('../../db/migrations/', import.meta.url)));
  assert.equal(new Set(expected.map(row => row.checksum_sha256)).size, expected.length);
  assert.equal(migrationsMatch(expected, expected), true);
  for (const history of [[], expected.slice(1), [...expected, expected[0]],
    expected.map((row, i) => i ? row : { ...row, checksum_sha256: 'different' })]) {
    assert.equal(migrationsMatch(expected, history), false);
  }
  const db = database({ history: expected });
  assert.equal((await inspectMigrations(db.pool, expected)).status, 'READY');
  assert(db.queries.includes('BEGIN READ ONLY'));
  assert.equal(db.queries.at(-1), 'ROLLBACK');
});

test('safe runtime and identity roles pass without granting migration-history access', async () => {
  for (const kind of ['runtime', 'identity']) {
    const db = database({ schema: kind === 'identity' ? { app_read: false, auth_read: true } : {} });
    assert.equal((await inspectDatabase(db.pool, kind)).status, 'READY');
    assert.equal(db.queries.at(-1), 'ROLLBACK');
    assert(!db.queries.some(sql => sql.includes('FROM schema_migrations')));
    assert.deepEqual(db.releases, [false]);
  }
});

test('owner, inherited owner, superuser, bypass-RLS, missing RLS and overlapping roles are blocked', async () => {
  for (const options of [{ role: { owns: true } }, { role: { rolsuper: true } }, { role: { rolbypassrls: true } },
    { schema: { rls_count: 4 } }, { schema: { auth_read: true } }, { schema: { app_read: false } }, { schema: { audit_mutable: true } }, { grants: false }]) {
    const db = database(options);
    assert.equal((await inspectDatabase(db.pool, 'runtime')).status, 'BLOCKED');
    assert.equal(db.queries.at(-1), 'ROLLBACK');
  }
  const db = database();
  assert.equal((await inspectDatabase(db.pool, 'identity')).status, 'BLOCKED');
});

test('connection failures are redacted and failed rollback destroys the pooled connection', async () => {
  const secret = 'postgresql://private:do-not-print@db/hidden';
  const db = database({ failure: secret, rollbackFails: true });
  const report = await inspectDatabase(db.pool, 'runtime');
  assert.equal(report.status, 'BLOCKED');
  assert(!JSON.stringify(report).includes(secret));
  assert.deepEqual(db.releases, [true]);
  const offline = { async connect() { throw new Error(secret); } };
  assert.equal((await inspectDatabase(offline, 'runtime')).status, 'BLOCKED');
  assert.equal((await inspectMigrations(offline, [])).status, 'BLOCKED');
  const history = database({ history: [{ version: 'test', checksum_sha256: 'test' }], rollbackFails: true });
  assert.equal((await inspectMigrations(history.pool, [{ version: 'test', checksum_sha256: 'test' }])).status, 'BLOCKED');
  assert.deepEqual(history.releases, [true]);
});
