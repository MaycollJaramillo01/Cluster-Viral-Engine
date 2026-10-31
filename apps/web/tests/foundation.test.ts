import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { AppError, can, roleSchema } from '@cluster/contracts';
import { parseConfig, validateMigrationUrl, environmentIsolation } from '../src/server/config';
import { assertSameOrigin, logEvent, requestHandler, readLimitedBody } from '../src/server/observability';

const config = {
  APP_ENV: 'local', DATABASE_URL: 'postgresql://runtime@127.0.0.1:55432/dev',
  AUTH_DATABASE_URL: 'postgresql://identity@127.0.0.1:55432/dev',
  BETTER_AUTH_URL: 'http://127.0.0.1:3000', BETTER_AUTH_SECRET: 'unit-only-configuration-secret'.repeat(2),
};
test('config fails closed, separates roles and environments, requires TLS and Neon pooler outside local', () => {
  assert.equal(parseConfig(config).APP_ENV, 'local');
  for (const patch of [{ BETTER_AUTH_SECRET: '' }, { AUTH_DATABASE_URL: config.DATABASE_URL },
    { BETTER_AUTH_URL: 'http://public.example' }, { APP_ENV: 'production' }]) assert.throws(() => parseConfig({ ...config, ...patch }), AppError);
  const cloud = { ...config, APP_ENV: 'preview', BETTER_AUTH_URL: 'https://project-preview.vercel.app',
    DATABASE_URL: 'postgresql://runtime@ep-preview-pooler.neon.tech/db?sslmode=verify-full',
    AUTH_DATABASE_URL: 'postgresql://identity@ep-preview-pooler.neon.tech/db?sslmode=verify-full' };
  assert.equal(parseConfig(cloud).APP_ENV, 'preview');
  assert.throws(() => parseConfig({ ...cloud, DATABASE_URL: cloud.DATABASE_URL.replace('verify-full', 'disable') }));
  assert.throws(() => validateMigrationUrl(cloud.DATABASE_URL, 'preview'));
  assert.equal(validateMigrationUrl('postgresql://migrator@ep-preview.neon.tech/db?sslmode=verify-full', 'preview').includes('-pooler'), false);
  assert.equal(environmentIsolation({ dev: config.DATABASE_URL, prod: config.DATABASE_URL }), false);
  assert.equal(environmentIsolation({ dev: 'postgresql://a@ep-test-pooler.neon.tech/db', prod: 'postgresql://b@ep-test.neon.tech:5432/%64b' }), false);
  assert.throws(() => parseConfig({ ...config, AUTH_DATABASE_URL: config.AUTH_DATABASE_URL.replace('55432', '55433') }));
  assert.equal(environmentIsolation({ dev: cloud.DATABASE_URL, preview: cloud.DATABASE_URL.replace('ep-preview', 'ep-other') }), true);
});
test('roles deny by default; editor cannot manage organization or approve; worker is not human', () => {
  assert.equal(can('editor', 'project:write'), true);
  assert.equal(can('editor', 'organization:manage'), false);
  assert.equal(can('editor', 'editorial:review'), false);
  assert.equal(can('reviewer', 'editorial:review'), true);
  assert.equal(can('analyst', 'project:write'), false);
  assert.equal(can('worker', 'organization:read'), false);
  assert.equal(roleSchema.safeParse('worker').success, false);
});
test('state-changing requests require exact server-configured origin', () => {
  for (const origin of [undefined, 'https://evil.example']) {
    const request = new Request('http://127.0.0.1:3000/api/me', { method: 'POST', headers: origin ? { origin } : {} });
    assert.throws(() => assertSameOrigin(request, config.BETTER_AUTH_URL), AppError);
  }
  assertSameOrigin(new Request('http://127.0.0.1:3000/api/me', { method: 'POST', headers: { origin: config.BETTER_AUTH_URL } }), config.BETTER_AUTH_URL);
});
test('logs allow only structured metadata; request failures never leak messages, credentials or headers', async () => {
  const lines: string[] = [], id = randomUUID();
  logEvent({ event: 'request.complete', requestId: id, status: 200, durationMs: 2, organizationId: 'not-an-id' }, line => lines.push(line));
  assert.equal(JSON.parse(lines[0]).request_id, id);
  assert.equal(JSON.parse(lines[0]).organization_id, undefined);
  const request = new Request('http://127.0.0.1:3000/api/me?token=never-log', { headers: { 'x-request-id': 'password=never-log' } });
  const response = await requestHandler(request, 'unit.error', async () => { throw new Error('postgresql://secret:never-log@host/db'); });
  const body = await response.text();
  assert.equal(response.status, 503); assert(!body.includes('never-log'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.notEqual(response.headers.get('x-request-id'), 'password=never-log');
});
test('auth payload limit applies even when Content-Length is absent or forged small', async () => {
  const allowed = await readLimitedBody(new Request('http://127.0.0.1:3000', { method: 'POST', body: 'small' }));
  assert.equal(new TextDecoder().decode(allowed), 'small');
  for (const headers of [{}, { 'content-length': '1' }] as HeadersInit[]) {
    await assert.rejects(readLimitedBody(new Request('http://127.0.0.1:3000', { method: 'POST', headers, body: 'x'.repeat(65537) })), e => e instanceof AppError && e.status === 413);
  }
});
