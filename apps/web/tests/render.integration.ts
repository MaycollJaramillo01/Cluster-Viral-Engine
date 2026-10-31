import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { bytesHash, localObjectStore } from '../src/media/objects';
import * as media from '../src/media/store';
import { mockTts } from '../src/media/tts';
import { sha256 } from '../src/phase00/contract';
import { renderManifestSchema } from '../src/render/manifest';
import { fakeRenderProvider, localRenderProvider, type RenderProvider } from '../src/render/provider';
import * as renders from '../src/render/store';
import { decodablePng } from '../src/render/synthetic';
import { processNext, type WorkerDeps } from '../src/render/worker';
import { code, mediaActors } from './media-fixture';
import { createTenantFixture, serverUrl } from './support';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const until = async (check: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 1000; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('UNTIL_TIMEOUT');
};

test('F05 PostgreSQL real: cola durable, leases, cancelación, aislamiento y rollback', { skip: !serverUrl }, async t => {
  const f = await createTenantFixture(), root = await mkdtemp(path.join(tmpdir(), 'cve-render-')), store = localObjectStore(root), workRoot = path.join(root, 'work');
  try {
    const { editor, outsider, asEditor, asReviewer, reader, synthesize, approved, research_, freshAsset } = await mediaActors(f, store);
    const analyst = await f.member(f.orgA, 'analyst', 'analyst');
    let seed = 2000;
    const deps = (provider: RenderProvider, over: Partial<WorkerDeps> = {}): WorkerDeps => ({ pool: f.runtime, store, provider, workerId: 'worker-a', workRoot, pollMs: 5, heartbeatMs: 20, leaseSeconds: 60, ...over });
    const ready = async (bytes?: Uint8Array) => {
      const { project, scenes } = await approved();
      await synthesize(project, mockTts());
      const asset = await freshAsset(project, seed++, bytes);
      for (const scene of scenes) await asEditor((c, x) => media.assignVisual(c, x, project, scene.key, asset.id));
      return { project, scenes, asset };
    };
    const repaint = async (project: string, scenes: { key: string }[]) => {
      const asset = await freshAsset(project, seed++);
      await asEditor((c, x) => media.assignVisual(c, x, project, scenes[0].key, asset.id));
      return asset;
    };
    const request = (project: string, title_index: number | null = null) => asEditor((c, x) => renders.requestRender(c, x, project, { title_index }));
    const projectStatus = async (project: string) => (await f.admin.query('SELECT status FROM projects WHERE id=$1', [project])).rows[0].status as string;
    const state = async (id: string) => (await f.admin.query('SELECT r.*,j.status AS job_status,j.attempt,j.last_error_code,j.scheduled_at FROM renders r JOIN jobs j ON j.id=r.job_id WHERE r.id=$1', [id])).rows[0];
    const stored = async (project: string) => { try { return await readdir(path.join(root, 'org', f.orgA, 'project', project, 'renders')); } catch { return []; } };
    const expire = (id: string) => f.admin.query(`UPDATE jobs SET lease_expires_at=now()-interval '1 second' WHERE id=(SELECT job_id FROM renders WHERE id=$1)`, [id]);
    const claim = (worker = 'caido', lease = 60) => f.runtime.query('SELECT * FROM claim_render_job($1,$2)', [worker, lease]);
    const events = async (id: string) => (await f.admin.query('SELECT event_type FROM outbox_events WHERE aggregate_id=$1 ORDER BY created_at', [id])).rows.map(row => row.event_type as string);
    const audited = async (id: string) => (await f.admin.query('SELECT action,actor_user_id,actor_service FROM audit_events WHERE entity_id=$1 ORDER BY created_at', [id])).rows;
    const empty = (id: string) => readdir(path.join(workRoot, id)).then(() => false, () => true);

    await t.test('pedidos concurrentes crean un render y un job; el manifest queda fijo y el resultado llega a revisión', async () => {
      const { project, asset } = await ready();
      const asked = await Promise.all([request(project), request(project), request(project)]);
      assert.equal(new Set(asked.map(r => r.id)).size, 1);
      assert.equal(asked.filter(r => r.created).length, 1);
      const id = asked[0].id, before = await state(id);
      assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM jobs WHERE project_id=$1 AND job_type='RENDER'`, [project])).rows[0].n, 1);
      assert.equal(sha256(before.manifest), before.manifest_sha256);
      assert.equal(renderManifestSchema.parse(before.manifest).scenes[0].visual.asset_id, asset.id);
      assert.deepEqual(before.manifest.credits, ['Foto: Autora, CC BY']);
      assert.deepEqual([before.status, before.job_status, before.requested_by, before.script_version_id !== null], ['QUEUED', 'QUEUED', editor.actorId, true]);
      assert.equal(await projectStatus(project), 'RENDERING');
      await assert.rejects(reader(c => renders.renderUrls(c, project, id, 'x'.repeat(40))), code('CONFLICT'));

      const fake = fakeRenderProvider(), done = await processNext(deps(fake));
      assert.deepEqual(done, { render_id: id, outcome: 'SUCCEEDED' });
      const after = await state(id), master = after.output_object_key as string;
      assert.deepEqual([after.status, after.job_status, after.provider, after.attempt, after.metrics.stale, after.duration_ms], ['SUCCEEDED', 'SUCCEEDED', 'fake', 1, false, before.manifest.total_ms]);
      assert.equal(bytesHash((await store.get(master))!), after.artifact_sha256);
      assert.equal(after.qa.passed, true);
      assert(after.qa.needs_human.includes('subtitle_legibility'));
      assert.equal((await stored(project)).length, 4);
      assert.equal(await empty(id), true, 'directorio de trabajo limpio');
      assert.equal(await projectStatus(project), 'VIDEO_REVIEW');
      assert.deepEqual(await events(id), ['RENDER_REQUESTED', 'RENDER_SUCCEEDED']);
      assert.deepEqual((await audited(id)).map(a => [a.action, a.actor_user_id, a.actor_service]), [['RENDER_REQUESTED', editor.actorId, null], ['RENDER_STARTED', null, 'render-worker'], ['RENDER_SUCCEEDED', null, 'render-worker']]);
      const usage = (await f.admin.query(`SELECT provider,operation,unit_name,input_units::float8 AS units,estimated_cost_usd::float8 AS cost FROM provider_usage WHERE project_id=$1 AND operation='render'`, [project])).rows;
      assert.deepEqual(usage, [{ provider: 'fake', operation: 'render', unit_name: 'cpu_seconds', units: 1, cost: 0 }]);
      assert.equal(await processNext(deps(fake)), null);

      // Sin cambios, pedirlo otra vez no renderiza; con otro título es otro manifest. Un índice sin opción se rechaza.
      const again = await request(project);
      assert.deepEqual([again.id, again.created, again.status], [id, false, 'SUCCEEDED']);
      await assert.rejects(request(project, 9), code('INVALID_INPUT'));
      assert.equal(await projectStatus(project), 'VIDEO_REVIEW');
      const titled = await request(project, 0);
      assert.notEqual(titled.id, id);
      assert.equal((await state(titled.id)).manifest.title, 'Título uno');
      assert.match((await state(titled.id)).manifest.captions.ass, /Title,,0,0,0,,\{\\fad\(300,300\)\}Título uno/);
      assert.equal((await processNext(deps(fake)))!.outcome, 'SUCCEEDED');
      const urls = await reader(c => renders.renderUrls(c, project, titled.id, 'x'.repeat(40)));
      assert.deepEqual(Object.keys(urls), ['master', 'preview', 'poster', 'captions']);
      assert.match(urls.master.url, /^\/api\/objects\?key=org%2F.*-master\.mp4&expires=\d+&signature=/);
      const listed = await reader(c => renders.listRenders(c, project, 10));
      assert.equal(listed.renders.length, 2);
      assert.equal(listed.renders.every(r => !('manifest' in r)), true);
      assert.equal((await reader(c => renders.readRender(c, project, id))).manifest_sha256, before.manifest_sha256);
    });
    await t.test('bloqueos: guion, material, derechos y presupuesto; aprobar no se puede pedir por aquí', async () => {
      const unapproved = await research_();
      await assert.rejects(request(unapproved.project), code('CONFLICT'));
      const { project, scenes } = await approved();
      await assert.rejects(request(project), code('BLOCKED_BY_POLICY'));
      await synthesize(project, mockTts());
      await assert.rejects(request(project), code('BLOCKED_BY_POLICY'), 'voz sin material');
      const asset = await freshAsset(project, seed++);
      for (const scene of scenes) await asEditor((c, x) => media.assignVisual(c, x, project, scene.key, asset.id));
      await f.admin.query(`UPDATE asset_licenses SET expires_at=now()-interval '1 second' WHERE asset_id=$1`, [asset.id]);
      await assert.rejects(request(project), code('BLOCKED_BY_POLICY'), 'licencia vencida');
      await f.admin.query(`UPDATE asset_licenses SET expires_at=NULL WHERE asset_id=$1`, [asset.id]);
      await asReviewer((c, x) => media.decideAsset(c, x, project, asset.id, { decision: 'REJECTED', target_sha256: asset.content_sha256, note: 'Retirado' }));
      await assert.rejects(request(project), code('BLOCKED_BY_POLICY'), 'material rechazado');
      assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM renders WHERE project_id=$1', [project])).rows[0].n, 0);
      const second = await ready();
      await f.admin.query('UPDATE organizations SET monthly_budget_usd=0 WHERE id=$1', [f.orgA]);
      await f.admin.query(`INSERT INTO provider_usage(organization_id,project_id,provider,operation,estimated_cost_usd) VALUES($1,$2,'prueba','prueba',1)`, [f.orgA, second.project]);
      await assert.rejects(request(second.project), code('BLOCKED_BY_POLICY'), 'tope de gasto');
      await f.admin.query('UPDATE organizations SET monthly_budget_usd=100 WHERE id=$1', [f.orgA]);
      await f.admin.query(`DELETE FROM provider_usage WHERE provider='prueba'`);
      for (const body of [{ approved: true }, { title_index: 0, approved: true }, { title_index: 10 }, { title_index: -1 }, { manifest: {} }]) assert.equal(renders.renderInput.safeParse(body).success, false, JSON.stringify(body));
    });
    await t.test('aislamiento: otra organización y lecturas sin organización no ven nada; solo escribe quien puede', async () => {
      const { project } = await ready(), { id } = await request(project);
      const foreign = <R>(op: Parameters<typeof f.db.organizationTransaction<R>>[3]) => f.db.organizationTransaction(outsider.identity, f.orgB, 'project:write', op);
      await assert.rejects(foreign((c, x) => renders.requestRender(c, x, project, { title_index: null })), code('NOT_FOUND'));
      await assert.rejects(foreign(c => renders.readRender(c, project, id)), code('NOT_FOUND'));
      await assert.rejects(foreign((c, x) => renders.cancelRender(c, x, project, id)), code('NOT_FOUND'));
      await assert.rejects(foreign(c => renders.renderUrls(c, project, id, 'x'.repeat(40))), code('NOT_FOUND'));
      assert.deepEqual((await foreign(c => renders.listRenders(c, project, 10))).renders, []);
      assert.equal((await foreign(c => c.query('SELECT count(*)::int AS n FROM renders'))).rows[0].n, 0);
      assert.equal((await foreign(c => c.query(`SELECT count(*)::int AS n FROM jobs WHERE job_type='RENDER'`))).rows[0].n, 0);
      await assert.rejects(f.db.organizationTransaction(outsider.identity, f.orgA, 'organization:read', c => renders.readRender(c, project, id)), code('FORBIDDEN'));
      await assert.rejects(f.db.organizationTransaction(analyst.identity, f.orgA, 'project:write', (c, x) => renders.requestRender(c, x, project, { title_index: null })), code('FORBIDDEN'));
      assert.equal((await f.db.organizationTransaction(analyst.identity, f.orgA, 'organization:read', c => renders.readRender(c, project, id))).id, id);
      // El rol de runtime solo cruza organizaciones por la función de reclamo, que devuelve identificadores.
      assert.equal((await f.runtime.query('SELECT count(*)::int AS n FROM renders')).rows[0].n, 0);
      assert.equal((await f.runtime.query(`SELECT count(*)::int AS n FROM jobs`)).rows[0].n, 0);
      await assert.rejects(f.runtime.query(`INSERT INTO renders(organization_id,project_id,manifest_sha256,manifest,job_id,requested_by) VALUES($1,$2,$3,'{}',$4,$5)`, [f.orgB, project, 'c'.repeat(64), randomUUID(), outsider.actorId]));
      // Un payload manipulado que apunte a otra organización no llega a leer nada: la fila no existe bajo RLS y el trabajo muere.
      const other = await f.admin.query(`INSERT INTO jobs(organization_id,job_type,idempotency_key,payload,status) VALUES($1,'RENDER',$2,$3,'QUEUED') RETURNING id`, [f.orgB, randomUUID(), JSON.stringify({ render_id: id })]);
      const fake = fakeRenderProvider(), first = await processNext(deps(fake, { workerId: 'aislado' }));
      assert.equal(first!.outcome, 'SUCCEEDED');
      const second = await processNext(deps(fake, { workerId: 'aislado' }));
      assert.equal(second!.outcome, 'FAILED');
      assert.deepEqual(fake.calls, [id]);
      assert.equal((await f.admin.query('SELECT status,last_error_code FROM jobs WHERE id=$1', [other.rows[0].id])).rows[0].last_error_code, 'RENDER_NOT_FOUND');
      assert.equal((await state(id)).status, 'SUCCEEDED');
    });
    await t.test('dos workers a la vez se reparten la cola sin repetir', async () => {
      const one = await ready(), two = await ready(), a = await request(one.project), b = await request(two.project);
      const fake = fakeRenderProvider(() => ({ hold: true }));
      const first = processNext(deps(fake, { workerId: 'a' })), second = processNext(deps(fake, { workerId: 'b' }));
      await until(() => fake.calls.length === 2);
      assert.deepEqual([...fake.calls].sort(), [a.id, b.id].sort());
      assert.equal(await processNext(deps(fake, { workerId: 'c' })), null);
      await Promise.all(fake.calls.map(id => fake.release(id)));
      assert.deepEqual([(await first)!.outcome, (await second)!.outcome], ['SUCCEEDED', 'SUCCEEDED']);
      const owners = await f.admin.query('SELECT locked_by FROM jobs WHERE id=ANY($1) ORDER BY locked_by', [[(await state(a.id)).job_id, (await state(b.id)).job_id]]);
      assert.deepEqual(owners.rows.map(row => row.locked_by), ['a', 'b']);
    });
    await t.test('una caída no pierde el trabajo: el lease vencido lo recupera otro worker y el latido lo mantiene', async () => {
      const { project } = await ready(), { id } = await request(project);
      assert.equal((await claim()).rows[0].render_id, id);
      assert.equal((await claim('otro')).rowCount, 0, 'lease vigente');
      const fake = fakeRenderProvider();
      assert.equal(await processNext(deps(fake)), null);
      await expire(id);
      assert.equal((await processNext(deps(fake)))!.outcome, 'SUCCEEDED');
      assert.deepEqual([(await state(id)).attempt, await projectStatus(project)], [2, 'VIDEO_REVIEW']);

      const longer = await ready(), slow = await request(longer.project), held = fakeRenderProvider(() => ({ hold: true }));
      const running = processNext(deps(held, { leaseSeconds: 1, heartbeatMs: 50 }));
      await until(() => held.calls.length === 1);
      await new Promise(resolve => setTimeout(resolve, 1600));
      assert.equal((await claim('otro')).rowCount, 0, 'el latido renueva el lease');
      await held.release(slow.id);
      assert.deepEqual([(await running)!.outcome, (await state(slow.id)).attempt], ['SUCCEEDED', 1]);
    });
    await t.test('agotados los intentos por caídas va a DEAD, el proyecto vuelve a medios y se puede pedir de nuevo', async () => {
      const { project } = await ready(), { id } = await request(project);
      for (let attempt = 1; attempt <= 3; attempt++) {
        assert.equal((await claim()).rows[0].attempt, attempt);
        await expire(id);
      }
      const fake = fakeRenderProvider();
      assert.deepEqual(await processNext(deps(fake)), { render_id: id, outcome: 'FAILED' });
      const dead = await state(id);
      assert.deepEqual([dead.status, dead.error_code, dead.job_status, dead.last_error_code, dead.finished_at !== null], ['FAILED', 'LEASE_EXPIRED', 'DEAD', 'LEASE_EXPIRED', true]);
      assert.deepEqual(fake.calls, []);
      assert.equal(await projectStatus(project), 'ASSETING');
      assert.deepEqual(await events(id), ['RENDER_REQUESTED', 'RENDER_FAILED']);
      assert.equal(await processNext(deps(fake)), null);
      const retry = await request(project);
      assert.deepEqual([retry.id, retry.created, retry.status], [id, true, 'QUEUED']);
      assert.deepEqual([(await state(id)).attempt, (await state(id)).job_status, (await state(id)).error_code, await projectStatus(project)], [0, 'QUEUED', null, 'RENDERING']);
      assert.equal((await processNext(deps(fake)))!.outcome, 'SUCCEEDED');
      assert.equal(await projectStatus(project), 'VIDEO_REVIEW');
    });
    await t.test('los fallos transitorios esperan con retroceso y al tercero muere; lo que no cambia al repetir muere a la primera', async () => {
      const { project } = await ready(), { id } = await request(project);
      const flaky = fakeRenderProvider((_, call) => call === 0 ? { fail: 'PROCESS_FAILED' } : {});
      assert.equal((await processNext(deps(flaky)))!.outcome, 'RETRY');
      const waiting = await state(id);
      assert.deepEqual([waiting.status, waiting.error_code, waiting.job_status, waiting.attempt], ['QUEUED', 'PROCESS_FAILED', 'RETRY_WAIT', 1]);
      assert(waiting.scheduled_at > new Date(Date.now() + 20000));
      assert.equal(await empty(id), true);
      assert.equal(await processNext(deps(flaky)), null, 'aún no toca');
      await f.admin.query('UPDATE jobs SET scheduled_at=now() WHERE id=$1', [waiting.job_id]);
      assert.equal((await processNext(deps(flaky)))!.outcome, 'SUCCEEDED');
      assert.deepEqual([(await state(id)).attempt, (await state(id)).error_code], [2, null]);

      const broken = await ready(), failing = await request(broken.project), always = fakeRenderProvider(() => ({ fail: 'PROCESS_FAILED' }));
      for (const expected of ['RETRY', 'RETRY', 'FAILED']) {
        assert.equal((await processNext(deps(always)))!.outcome, expected);
        await f.admin.query(`UPDATE jobs SET scheduled_at=now() WHERE id=$1 AND status='RETRY_WAIT'`, [(await state(failing.id)).job_id]);
      }
      assert.deepEqual([(await state(failing.id)).status, (await state(failing.id)).job_status, await projectStatus(broken.project)], ['FAILED', 'DEAD', 'ASSETING']);

      // Salida con defectos: no se reintenta ni se guarda nada.
      const defective = await ready(), qa = await request(defective.project), defect = fakeRenderProvider(() => ({ defect: true }));
      assert.equal((await processNext(deps(defect)))!.outcome, 'FAILED');
      assert.deepEqual([(await state(qa.id)).error_code, (await state(qa.id)).job_status, (await state(qa.id)).attempt, (await stored(defective.project)).length, await projectStatus(defective.project)], ['QA_FAILED', 'DEAD', 1, 0, 'ASSETING']);

      // Material alterado o ausente: el worker lo descubre antes de ejecutar nada.
      for (const [damage, expected] of [[(key: string) => store.put(key, new Uint8Array([1, 2, 3])), 'INPUT_HASH_MISMATCH'], [(key: string) => store.remove(key), 'INPUT_MISSING']] as const) {
        const tampered = await ready(), asked = await request(tampered.project), key = (await state(asked.id)).manifest.scenes[0].voice.object_key, idle = fakeRenderProvider();
        await damage(key);
        assert.equal((await processNext(deps(idle)))!.outcome, 'FAILED');
        assert.deepEqual([(await state(asked.id)).error_code, (await state(asked.id)).attempt, idle.calls.length], [expected, 1, 0]);
      }
      const corrupt = await ready(), bad = await request(corrupt.project);
      await f.admin.query(`UPDATE renders SET manifest='{"schema_version":1}' WHERE id=$1`, [bad.id]);
      assert.equal((await processNext(deps(fakeRenderProvider())))!.outcome, 'FAILED');
      assert.equal((await state(bad.id)).error_code, 'MANIFEST_INVALID');
    });
    await t.test('un worker que perdió el lease no pisa al que lo relevó ni deja objetos', async () => {
      const { project } = await ready(), { id } = await request(project);
      const a = fakeRenderProvider(() => ({ hold: true })), b = fakeRenderProvider(() => ({ hold: true })), quiet = { heartbeatMs: 3600000 };
      const zombie = processNext(deps(a, { ...quiet, workerId: 'zombi', workRoot: path.join(root, 'work-a') }));
      await until(() => a.calls.length === 1);
      await expire(id);
      const relief = processNext(deps(b, { ...quiet, workerId: 'relevo', workRoot: path.join(root, 'work-b') }));
      await until(() => b.calls.length === 1);
      await a.release(id);
      assert.equal((await zombie)!.outcome, 'LEASE_LOST');
      assert.deepEqual(await stored(project), [], 'el zombi no deja objetos');
      assert.deepEqual([(await state(id)).status, (await state(id)).attempt], ['RUNNING', 2]);
      await b.release(id);
      assert.equal((await relief)!.outcome, 'SUCCEEDED');
      assert.equal((await stored(project)).length, 4);
      assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM provider_usage WHERE project_id=$1 AND operation='render'`, [project])).rows[0].n, 1);
      assert.equal((await audited(id)).filter(row => row.action === 'RENDER_SUCCEEDED').length, 1);

      // Con latido activo lo descubre antes de terminar y detiene su proceso.
      const second = await ready(), other = await request(second.project), c = fakeRenderProvider(() => ({ hold: true }));
      const beaten = processNext(deps(c, { workerId: 'zombi', workRoot: path.join(root, 'work-c'), heartbeatMs: 3600000 }));
      await until(() => c.calls.length === 1);
      await expire(other.id);
      assert.equal((await processNext(deps(fakeRenderProvider(), { workerId: 'relevo', workRoot: path.join(root, 'work-b') })))!.outcome, 'SUCCEEDED');
      const objects = await stored(second.project);
      await c.release(other.id);
      assert.equal((await beaten)!.outcome, 'LEASE_LOST');
      assert.deepEqual(await stored(second.project), objects, 'lo confirmado por el relevo sigue ahí');
      const third = await ready(), watched = await request(third.project), d = fakeRenderProvider(() => ({ hold: true }));
      const noticing = processNext(deps(d, { workerId: 'zombi', workRoot: path.join(root, 'work-d') }));
      await until(() => d.calls.length === 1);
      await f.admin.query(`UPDATE jobs SET locked_by='otro' WHERE id=$1`, [(await state(watched.id)).job_id]);
      assert.equal((await noticing)!.outcome, 'LEASE_LOST');
      assert.equal(await empty(watched.id), true);
      await f.admin.query(`UPDATE jobs SET status='CANCELLED' WHERE id=$1`, [(await state(watched.id)).job_id]);
      await f.admin.query(`UPDATE renders SET status='CANCELLED' WHERE id=$1`, [watched.id]);
    });
    await t.test('sin huérfanos: un fallo al subir no deja nada y una caída a mitad la limpia el siguiente intento', async () => {
      const failing = await ready(), one = await request(failing.project);
      let puts = 0;
      const flaky = { ...store, put: async (key: string, bytes: Uint8Array) => { if (++puts === 2) throw new Error('disco lleno'); return store.put(key, bytes); } };
      assert.equal((await processNext(deps(fakeRenderProvider(), { store: flaky })))!.outcome, 'RETRY');
      assert.deepEqual([await stored(failing.project), (await state(one.id)).error_code], [[], 'WORKER_ERROR']);
      await f.admin.query('UPDATE jobs SET scheduled_at=now() WHERE id=$1', [(await state(one.id)).job_id]);
      assert.equal((await processNext(deps(fakeRenderProvider())))!.outcome, 'SUCCEEDED');
      assert.equal((await stored(failing.project)).length, 4);
      assert.equal((await state(one.id)).metrics.pending_object_keys, undefined);

      const crashing = await ready(), two = await request(crashing.project);
      let started = 0;
      const hanging = { ...store, put: (key: string, bytes: Uint8Array) => ++started === 2 ? new Promise<void>(() => undefined) : store.put(key, bytes) };
      void processNext(deps(fakeRenderProvider(), { store: hanging, workerId: 'caido', workRoot: path.join(root, 'work-h') }));
      await until(() => started === 2);
      const orphans = await stored(crashing.project);
      assert.equal(orphans.length, 1);
      assert.equal((await state(two.id)).metrics.pending_object_keys.length, 4);
      await expire(two.id);
      assert.equal((await processNext(deps(fakeRenderProvider())))!.outcome, 'SUCCEEDED');
      const left = await stored(crashing.project);
      assert.equal(left.length, 4);
      assert(!left.includes(orphans[0]));
    });
    await t.test('cancelar: en cola al momento; en ejecución detiene el proceso y limpia; también en el último instante', async () => {
      const queued = await ready(), one = await request(queued.project);
      const cancel = (project: string, id: string) => asEditor((c, x) => renders.cancelRender(c, x, project, id));
      assert.deepEqual(await cancel(queued.project, one.id), { id: one.id, status: 'CANCELLED' });
      assert.deepEqual([(await state(one.id)).status, (await state(one.id)).job_status, await projectStatus(queued.project)], ['CANCELLED', 'CANCELLED', 'ASSETING']);
      assert.equal(await processNext(deps(fakeRenderProvider())), null);
      await assert.rejects(cancel(queued.project, one.id), code('CONFLICT'));
      await assert.rejects(cancel(queued.project, randomUUID()), code('NOT_FOUND'));
      // Lo cancelado se puede volver a pedir y es el mismo render.
      const back = await request(queued.project);
      assert.deepEqual([back.id, back.created], [one.id, true]);
      assert.equal((await processNext(deps(fakeRenderProvider())))!.outcome, 'SUCCEEDED');
      await assert.rejects(cancel(queued.project, one.id), code('CONFLICT'));

      const active = await ready(), two = await request(active.project), held = fakeRenderProvider(() => ({ hold: true }));
      const running = processNext(deps(held));
      await until(() => held.calls.length === 1);
      assert.deepEqual(await cancel(active.project, two.id), { id: two.id, status: 'CANCELLING' });
      assert.equal((await running)!.outcome, 'CANCELLED');
      assert.deepEqual([(await state(two.id)).status, (await state(two.id)).job_status, await projectStatus(active.project), (await stored(active.project)).length, await empty(two.id)], ['CANCELLED', 'CANCELLED', 'ASSETING', 0, true]);
      assert(await events(two.id).then(list => list.includes('RENDER_CANCELLED')));

      // La cancelación llega después del último latido, con el resultado ya subido: gana la cancelación y no quedan objetos.
      const late = await ready(), three = await request(late.project), last = fakeRenderProvider(() => ({ hold: true }));
      const closing = processNext(deps(last, { heartbeatMs: 3600000 }));
      await until(() => last.calls.length === 1);
      await cancel(late.project, three.id);
      await last.release(three.id);
      assert.equal((await closing)!.outcome, 'CANCELLED');
      assert.deepEqual([(await state(three.id)).status, (await stored(late.project)).length, (await state(three.id)).artifact_sha256], ['CANCELLED', 0, null]);
    });
    await t.test('material cambiado durante el render: el resultado no entra en revisión; lo pedido después reemplaza a lo anterior', async () => {
      const { project, scenes } = await ready(), { id } = await request(project), held = fakeRenderProvider(() => ({ hold: true }));
      const running = processNext(deps(held));
      await until(() => held.calls.length === 1);
      await repaint(project, scenes);
      assert.equal(await projectStatus(project), 'ASSETING');
      await held.release(id);
      assert.equal((await running)!.outcome, 'SUCCEEDED');
      assert.deepEqual([(await state(id)).status, (await state(id)).metrics.stale, await projectStatus(project)], ['SUCCEEDED', true, 'ASSETING']);
      const fresh = await request(project);
      assert.notEqual(fresh.id, id);
      assert.equal((await processNext(deps(fakeRenderProvider())))!.outcome, 'SUCCEEDED');
      assert.equal(await projectStatus(project), 'VIDEO_REVIEW');

      // Si se pide de nuevo mientras otro espera, el anterior se cancela y el proyecto sigue en RENDERING hasta que termine el último.
      const next = await ready(), first = await request(next.project);
      const original = (await f.admin.query(`SELECT scene_key,visual_asset_id FROM scene_media WHERE project_id=$1 AND scene_key=$2`, [next.project, next.scenes[0].key])).rows[0];
      await repaint(next.project, next.scenes);
      const second = await request(next.project);
      assert.notEqual(second.id, first.id);
      assert((await state(first.id)).cancel_requested_at);
      assert.equal((await processNext(deps(fakeRenderProvider())))!.outcome, 'CANCELLED');
      assert.equal(await projectStatus(next.project), 'RENDERING');
      assert.equal((await processNext(deps(fakeRenderProvider())))!.outcome, 'SUCCEEDED');
      assert.equal(await projectStatus(next.project), 'VIDEO_REVIEW');

      // Volver al material anterior antes de que el worker lo vea anula esa cancelación.
      const third = await repaint(next.project, next.scenes), asked = await request(next.project);
      await asEditor((c, x) => media.assignVisual(c, x, next.project, next.scenes[0].key, original.visual_asset_id));
      const firstAgain = await request(next.project);
      assert.deepEqual([firstAgain.id, firstAgain.created], [first.id, true], 'el cancelado se reencola');
      assert((await state(asked.id)).cancel_requested_at, third.id);
      await asEditor((c, x) => media.assignVisual(c, x, next.project, next.scenes[0].key, third.id));
      const reverted = await request(next.project);
      assert.equal(reverted.id, asked.id);
      assert.equal((await state(asked.id)).cancel_requested_at, null);
      assert((await state(first.id)).cancel_requested_at);
      const results = [await processNext(deps(fakeRenderProvider())), await processNext(deps(fakeRenderProvider()))];
      assert.deepEqual(results.map(r => r!.outcome).sort(), ['CANCELLED', 'SUCCEEDED']);
      assert.equal(await projectStatus(next.project), 'VIDEO_REVIEW');
    });
    await t.test('el rol de runtime no reescribe manifest ni borra; un éxito incompleto no se puede guardar', async () => {
      const { project } = await ready(), { id } = await request(project);
      for (const sql of [`UPDATE renders SET manifest='{}' WHERE id=$1`, `UPDATE renders SET manifest_sha256=repeat('b',64) WHERE id=$1`, `UPDATE renders SET requested_by=NULL WHERE id=$1`, `UPDATE renders SET job_id=NULL WHERE id=$1`, 'DELETE FROM renders WHERE id=$1'])
        await assert.rejects(asEditor(c => c.query(sql, [id])), /permission denied/, sql);
      await assert.rejects(asEditor(c => c.query(`UPDATE renders SET status='SUCCEEDED' WHERE id=$1`, [id])), /renders_success_complete/);
      await assert.rejects(f.runtime.query(`DROP FUNCTION claim_render_job(text,integer)`));
      assert.equal((await f.admin.query(`SELECT has_function_privilege('public','claim_render_job(text,integer)','EXECUTE') AS open`)).rows[0].open, false);
      await asEditor((c, x) => renders.cancelRender(c, x, project, id));
    });
    await t.test('el reclamo funciona con un dueño sin BYPASSRLS: sin su política la cola queda ciega', async () => {
      const { project } = await ready(), { id } = await request(project), owner = `cve_owner_${process.pid}`, q = (sql: string) => f.admin.query(sql);
      await q(`CREATE ROLE "${owner}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      try {
        await q(`GRANT USAGE ON SCHEMA public TO "${owner}"`);
        await q(`ALTER TABLE jobs OWNER TO "${owner}"`);
        await q(`ALTER FUNCTION claim_render_job(text,integer) OWNER TO "${owner}"`);
        await q(`DROP POLICY jobs_render_dispatch ON jobs`);
        assert.equal((await claim()).rowCount, 0, 'con RLS forzada, sin política el dueño no ve filas');
        await q(`CREATE POLICY jobs_render_dispatch ON jobs FOR ALL TO "${owner}" USING (job_type='RENDER') WITH CHECK (job_type='RENDER')`);
        assert.equal((await claim()).rows[0].render_id, id);
      } finally {
        await q(`DROP POLICY IF EXISTS jobs_render_dispatch ON jobs`);
        await q(`ALTER FUNCTION claim_render_job(text,integer) OWNER TO CURRENT_USER`);
        await q(`ALTER TABLE jobs OWNER TO CURRENT_USER`);
        await q(`CREATE POLICY jobs_render_dispatch ON jobs FOR ALL TO CURRENT_USER USING (job_type='RENDER') WITH CHECK (job_type='RENDER')`);
        await q(`REVOKE ALL ON SCHEMA public FROM "${owner}"`);
        await q(`DROP ROLE "${owner}"`);
      }
      await f.admin.query(`UPDATE jobs SET status='CANCELLED',lease_expires_at=NULL WHERE id=$1`, [(await state(id)).job_id]);
      await f.admin.query(`UPDATE renders SET status='CANCELLED' WHERE id=$1`, [id]);
    });
    await t.test('FFmpeg real de principio a fin: del guion aprobado a revisión de video, con hash y control de calidad', { skip: !hasFfmpeg }, async () => {
      const { project } = await ready(decodablePng(5, 1600, 900)), { id } = await request(project, 0), logs: Record<string, unknown>[] = [];
      const done = await processNext(deps(localRenderProvider(), { threads: 4, pollMs: 100, heartbeatMs: 2000, log: event => logs.push(event) }));
      assert.deepEqual(done, { render_id: id, outcome: 'SUCCEEDED' }, JSON.stringify(logs));
      const row = await state(id), master = (await store.get(row.output_object_key))!;
      assert.equal(row.provider, 'local-ffmpeg');
      assert.equal(bytesHash(master), row.artifact_sha256);
      assert.equal(row.qa.passed, true, JSON.stringify(row.qa.checks));
      assert.equal(await projectStatus(project), 'VIDEO_REVIEW');
      assert(row.metrics.cpu_ms > 0 && row.metrics.max_rss_kib > 0 && row.metrics.wall_ms > 0);
      assert.equal((await store.get(row.captions_object_key))!.toString().startsWith('1\n'), true);
      if (process.env.PHASE05_EVIDENCE_DIR) await writeFile(path.join(process.env.PHASE05_EVIDENCE_DIR, 'real-render.json'), `${JSON.stringify({ note: 'Material y voz sintéticos (mock BLOCKED_EXTERNAL); mide la canalización, no la calidad editorial.', provider: row.provider, duration_ms: row.duration_ms, artifact_sha256: row.artifact_sha256, output_bytes: master.length, qa: row.qa, metrics: row.metrics, stale: row.metrics.stale }, null, 2)}\n`);
    });
    await t.test('rollback de 010: quita lo de render, conserva auditoría y se puede volver a aplicar', async () => {
      const c = await f.admin.connect();
      try {
        const audits = (await c.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n, usage = (await c.query('SELECT count(*)::int AS n FROM provider_usage')).rows[0].n, outbox = (await c.query('SELECT count(*)::int AS n FROM outbox_events')).rows[0].n;
        await c.query('BEGIN');
        await c.query(await readFile('../../db/rollback/010_render.sql', 'utf8'));
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='renders' AND column_name='manifest'`)).rows[0].n, 0);
        assert.equal((await c.query(`SELECT to_regprocedure('claim_render_job(text,integer)') AS f`)).rows[0].f, null);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname='jobs_render_dispatch'`)).rows[0].n, 0);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM jobs WHERE job_type='RENDER'`)).rows[0].n, 0);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM schema_migrations WHERE version='010_render'`)).rows[0].n, 0);
        assert.deepEqual([(await c.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n, (await c.query('SELECT count(*)::int AS n FROM provider_usage')).rows[0].n, (await c.query('SELECT count(*)::int AS n FROM outbox_events')).rows[0].n], [audits, usage, outbox]);
        await c.query(await readFile('../../db/migrations/010_render.sql', 'utf8'));
        assert.notEqual((await c.query(`SELECT to_regprocedure('claim_render_job(text,integer)') AS f`)).rows[0].f, null);
        await c.query('ROLLBACK');
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM schema_migrations WHERE version='010_render'`)).rows[0].n, 1);
      } finally { await c.query('ROLLBACK'); c.release(); }
    });
  } finally {
    await f.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
