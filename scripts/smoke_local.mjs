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
async function request(route, expected, body, extra = {}, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + route, { method,
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
const org = `/api/organizations/${me.memberships[0].organization_id}`, tag = randomUUID();
await request(`${org}/discovery`, 200);
await request(`${org}/stories`, 403, { proposed_title: '[SMOKE] origen falso' }, { origin: 'https://evil.example' });
await request(`${org}/stories`, 400, { proposed_title: 'x', approved: true });
await request(`/api/organizations/${randomUUID()}/stories`, 403, { proposed_title: '[SMOKE] otra organización' });
await request(`${org}/stories/proposals`, 503, { idempotency_key: `smoke-${tag}`, topic: 'Tema sintético' });
const story = await (await request(`${org}/stories`, 201, { proposed_title: `[SMOKE] ${tag}`, editorial_risk: 'LOW' })).json();
await request(`${org}/stories?limit=5`, 200);
const { project_id: project } = await (await request(`${org}/stories/${story.id}/select`, 201, {})).json();
await request(`${org}/references`, 201, { url: `https://youtu.be/${tag}?si=x` });
const projectPath = `${org}/projects/${project}`;
await request(`${projectPath}/research-plan`, 201, {});
const source = await (await request(`${projectPath}/sources`, 201, { url: `https://a.example/${tag}`, publisher: 'Fuente sintética', retrieved_at: new Date().toISOString(), source_type: 'SECONDARY', evidence_excerpt: 'Extracto sintético.' })).json();
await request(`${projectPath}/claims`, 201, { statement: 'Afirmación sintética de prueba.', classification: 'UNVERIFIED', evidence: [{ source_id: source.id, relation: 'SUPPORTS' }] });
const dossier = await (await request(`${projectPath}/dossiers`, 201, {})).json();
await request(`${projectPath}/dossiers/${dossier.revision}`, 200);
// La cuenta local es editor: no puede decidir sobre un dossier aunque envíe el hash correcto.
await request(`${projectPath}/dossiers/${dossier.revision}/decision`, 403, { decision: 'APPROVED', target_sha256: dossier.content_sha256 });
// Sin dossier aprobado no hay guion: la cuenta editor recibe 409 aunque el cuerpo sea válido. El flujo aprobado se prueba contra PostgreSQL.
const scriptPath = `${projectPath}/script`, sectionKey = randomUUID();
const scriptContent = { tone: 'Sobrio', target_seconds: 120, title_options: ['[SMOKE] título 1', '[SMOKE] título 2', '[SMOKE] título 3'], hooks: ['[SMOKE] gancho 1', '[SMOKE] gancho 2', '[SMOKE] gancho 3'], selected_hook: 0,
  sections: [{ key: sectionKey, beat: 'HOOK', text: '[SMOKE] Texto sintético.', claim_ids: [], non_factual: true }] };
await request(scriptPath, 404);
await request(scriptPath, 400, { base_version: 0, content: { ...scriptContent, approved: true } });
await request(scriptPath, 409, { base_version: 0, content: scriptContent });
await request(`/api/organizations/${randomUUID()}/projects/${project}/script`, 403, { base_version: 0, content: scriptContent });
await request(`${scriptPath}/generate`, 503, { idempotency_key: `smoke-${tag}`, tone: 'Sobrio', target_seconds: 120 });
await request(`${scriptPath}/sections/${sectionKey}`, 409, { base_version: 1, text: '[SMOKE] Otro texto.', claim_ids: [], non_factual: true }, {}, 'PUT');
await request(`${scriptPath}/sections/${sectionKey}/regenerate`, 503, { idempotency_key: `smoke-${tag}`, base_version: 1 });
await request(`${scriptPath}/versions/1`, 404);
await request(`${scriptPath}/versions/1/submit`, 409, {});
await request(`${scriptPath}/versions/1/decision`, 403, { decision: 'APPROVED', target_sha256: 'a'.repeat(64) });
await request('/api/auth/sign-out', 200, {}); await request('/api/me', 401);
await request(`${org}/stories`, 401);
await request('/account', 307);
await fs.mkdir(path.join(root, 'docs/phase01/evidence'), { recursive: true });
await fs.writeFile(path.join(root, 'docs/phase01/evidence/http-smoke.json'), JSON.stringify({ target: 'LOCAL_POSTGRES', checks, credentials_logged: false }, null, 2) + '\n');
console.log(JSON.stringify({ checks: checks.length, all_passed: true, credentials_logged: false }));
