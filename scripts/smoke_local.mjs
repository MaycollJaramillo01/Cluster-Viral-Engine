import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = (await fs.readFile(path.join(root, '.local/dev-access.txt'), 'utf8')).split(/\r?\n/);
const email = lines.find(line => line.startsWith('Correo: '))?.slice(8);
const password = lines.find(line => line.startsWith('Contrase'))?.split(': ').slice(1).join(': ');
if (!email || !password) throw new Error('LOCAL_CREDENTIAL_FILE_REQUIRED');
const base = 'http://127.0.0.1:3000', checks = [];
let cookie = '';
async function request(route, expected, body, extra = {}) {
  const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
    headers: { origin: base, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const jar = new Map(cookie.split('; ').filter(Boolean).map(item => { const i = item.indexOf('='); return [item.slice(0, i), item.slice(i + 1)]; }));
  for (const set of response.headers.getSetCookie()) {
    const pair = set.split(';')[0], i = pair.indexOf('=');
    if (pair.slice(i + 1)) jar.set(pair.slice(0, i), pair.slice(i + 1)); else jar.delete(pair.slice(0, i));
  }
  cookie = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
  if (response.status !== expected) throw new Error(`${route}: expected ${expected}, got ${response.status}`);
  checks.push({ route, status: response.status, request_id: response.headers.get('x-request-id') });
  return response;
}
await request('/', 200); await request('/login', 200); await request('/api/health', 200); await request('/api/me', 401);
await request('/account', 307);
await request('/api/auth/sign-in/email', 200, { email, password, rememberMe: false });
const me = await (await request('/api/me', 200)).json();
await request(`/api/organizations/${me.memberships[0].organization_id}/context`, 200, undefined, { 'x-actor-id': randomUUID(), 'x-organization-id': randomUUID() });
await request(`/api/organizations/${randomUUID()}/context`, 403);
await request('/account', 200);
await request('/api/auth/sign-out', 200, {}); await request('/api/me', 401);
await request('/account', 307);
await fs.mkdir(path.join(root, 'docs/phase01/evidence'), { recursive: true });
await fs.writeFile(path.join(root, 'docs/phase01/evidence/http-smoke.json'), JSON.stringify({ target: 'LOCAL_POSTGRES', checks, credentials_logged: false }, null, 2) + '\n');
console.log(JSON.stringify({ checks: checks.length, all_passed: true, credentials_logged: false }));
