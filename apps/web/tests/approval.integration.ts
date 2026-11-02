import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import { localObjectStore } from '../src/media/objects';
import * as media from '../src/media/store';
import { mockTts } from '../src/media/tts';
import { fakeRenderProvider } from '../src/render/provider';
import * as renders from '../src/render/store';
import { processNext } from '../src/render/worker';
import { scriptDecisionInput } from '../src/scripts/contract';
import * as scripts from '../src/scripts/store';
import { code, mediaActors, openLicense } from './media-fixture';
import { createTenantFixture, serverUrl } from './support';

const sqlState = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

test('F06 PostgreSQL real: un render se aprueba por sus bytes exactos y nada se publica', { skip: !serverUrl }, async t => {
  const f = await createTenantFixture(), root = await mkdtemp(path.join(tmpdir(), 'cve-approval-')), store = localObjectStore(root);
  try {
    const { editor, reviewer, asEditor, asReviewer, synthesize, approved, content, freshAsset } = await mediaActors(f, store);
    const analyst = await f.member(f.orgA, 'analyst', 'analyst'), foreign = await f.member(f.orgB, 'reviewer', 'foreign'), secret = 'x'.repeat(40);
    const worker = { pool: f.runtime, store, workerId: 'worker-a', workRoot: path.join(root, 'work'), pollMs: 5, heartbeatMs: 20, leaseSeconds: 60 };
    let seed = 5000;
    const ready = async () => {
      const { project, scenes, claim } = await approved();
      await synthesize(project, mockTts());
      const asset = await freshAsset(project, seed++);
      for (const scene of scenes) await asEditor((c, x) => media.assignVisual(c, x, project, scene.key, asset.id));
      return { project, scenes, claim, asset };
    };
    // Renderiza con el doble de pruebas y anota la fila como real: aprobar solo mira el nombre del proveedor y el hash. El camino con FFmpeg real está en render.integration.
    const rendered = async (project: string, title_index: number | null = null, real = true) => {
      const { id } = await asEditor((c, x) => renders.requestRender(c, x, project, { title_index }));
      assert.equal((await processNext({ ...worker, provider: fakeRenderProvider() }))?.outcome, 'SUCCEEDED');
      if (real) await f.admin.query(`UPDATE renders SET provider='docker' WHERE id=$1`, [id]);
      return (await f.admin.query('SELECT id,artifact_sha256,manifest_sha256 FROM renders WHERE id=$1', [id])).rows[0] as { id: string; artifact_sha256: string; manifest_sha256: string };
    };
    const decide = (project: string, render: { id: string; artifact_sha256: string }, over = {}) => asReviewer((c, x) => renders.decideRender(c, x, project, render.id, { decision: 'APPROVED', target_sha256: render.artifact_sha256, note: '', ...over }));
    const review = (project: string, id: string) => f.db.organizationTransaction(analyst.identity, f.orgA, 'organization:read', (c, x) => renders.reviewRender(c, x, project, id, secret));
    const blockerCodes = async (project: string, id: string) => (await review(project, id)).blockers.map(b => b.code);
    const projectStatus = async (project: string) => (await f.admin.query('SELECT status FROM projects WHERE id=$1', [project])).rows[0].status as string;

    await t.test('aprobar: hash exacto, papel correcto y una sola vez aunque lleguen a la vez', async () => {
      const { project } = await ready(), render = await rendered(project), valid = { decision: 'APPROVED' as const, target_sha256: render.artifact_sha256, note: '' };
      assert.equal(await projectStatus(project), 'VIDEO_REVIEW');
      for (const member of [editor, analyst, foreign]) await assert.rejects(f.db.organizationTransaction(member.identity, f.orgA, 'editorial:review', async () => true), code('FORBIDDEN'));
      await assert.rejects(f.db.organizationTransaction(foreign.identity, f.orgB, 'editorial:review', (c, x) => renders.decideRender(c, x, project, render.id, valid)), code('NOT_FOUND'));
      for (const body of [{ approved: true }, { ...valid, approved: true }, { decision: 'APPROVED' }, { decision: 'APPROVED', target_sha256: 'x' }, { decision: 'REJECTED', target_sha256: render.artifact_sha256 }]) assert.equal(scriptDecisionInput.safeParse(body).success, false, JSON.stringify(body));
      await assert.rejects(decide(project, render, { target_sha256: 'f'.repeat(64) }), code('CONFLICT'));
      await assert.rejects(decide(project, render, { target_sha256: render.manifest_sha256 }), code('CONFLICT'), 'el hash del manifest no son los bytes');
      await assert.rejects(decide(project, { id: randomUUID(), artifact_sha256: render.artifact_sha256 }), code('NOT_FOUND'));
      assert.equal(await projectStatus(project), 'VIDEO_REVIEW');

      const results = await Promise.allSettled([decide(project, render), decide(project, render), decide(project, render)]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      for (const result of results) if (result.status === 'rejected') assert(code('CONFLICT')(result.reason), String(result.reason));
      const rows = (await f.admin.query(`SELECT render_id,target_sha256,decision,decided_by,decided_at FROM approvals WHERE project_id=$1 AND approval_type='RENDER'`, [project])).rows;
      assert.equal(rows.length, 1);
      assert.deepEqual([rows[0].render_id, rows[0].target_sha256, rows[0].decision, rows[0].decided_by, rows[0].decided_at instanceof Date], [render.id, render.artifact_sha256, 'APPROVED', reviewer.actorId, true]);
      assert.equal(await projectStatus(project), 'APPROVED');
      const audited = (await f.admin.query(`SELECT actor_user_id,after_hash FROM audit_events WHERE entity_id=$1 AND action='RENDER_APPROVED'`, [render.id])).rows;
      assert.deepEqual(audited, [{ actor_user_id: reviewer.actorId, after_hash: render.artifact_sha256 }]);
      assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id=$1 AND event_type='RENDER_APPROVED'`, [render.id])).rows[0].n, 1);
      assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM publications WHERE project_id=$1', [project])).rows[0].n, 0, 'aprobar no publica');
    });
    await t.test('lo aprobado queda congelado: cambiarlo exige retirar la aprobación, y volver exige otra decisión humana', async () => {
      const { project, scenes, claim, asset } = await ready(), render = await rendered(project);
      await decide(project, render);
      await assert.rejects(decide(project, render), code('CONFLICT'), 'no se repite');
      await assert.rejects(asEditor((c, x) => media.assignVisual(c, x, project, scenes[0].key, asset.id)), code('CONFLICT'));
      await assert.rejects(asEditor((c, x) => media.assignMusic(c, x, project, null)), code('CONFLICT'));
      await assert.rejects(asEditor((c, x) => media.addLicense(c, x, project, asset.id, openLicense())), code('CONFLICT'));
      await assert.rejects(asEditor((c, x) => renders.requestRender(c, x, project, { title_index: null })), code('CONFLICT'));
      await assert.rejects(asEditor((c, x) => renders.cancelRender(c, x, project, render.id)), code('CONFLICT'));
      await assert.rejects(asEditor((c, x) => scripts.saveVersion(c, x, project, 1, content(claim), 'HUMAN')), code('CONFLICT'));
      assert.equal((await review(project, render.id)).approved, true);

      assert.equal((await decide(project, render, { decision: 'REJECTED', note: 'Se ve mal el mapa' })).project_status, 'ASSETING');
      assert.equal((await review(project, render.id).catch(error => error.code)), 'CONFLICT');
      const again = await asEditor((c, x) => renders.requestRender(c, x, project, { title_index: null }));
      assert.deepEqual([again.id, again.created, again.status], [render.id, false, 'SUCCEEDED']);
      assert.equal(await projectStatus(project), 'VIDEO_REVIEW');
      assert.equal((await review(project, render.id)).approved, false);
      await decide(project, render);
      const seen = await review(project, render.id);
      assert.deepEqual([seen.approved, seen.decisions.map(row => row.decision)], [true, ['APPROVED', 'REJECTED', 'APPROVED']]);
    });
    await t.test('entre dos renders vigentes solo se retira el aprobado', async () => {
      const { project } = await ready(), first = await rendered(project), second = await rendered(project, 0);
      await decide(project, second);
      await assert.rejects(decide(project, first), code('CONFLICT'));
      await assert.rejects(decide(project, first, { decision: 'REJECTED', note: 'No es el aprobado' }), code('CONFLICT'));
      assert.deepEqual([(await review(project, first.id)).approved, (await review(project, second.id)).approved], [false, true]);
    });
    await t.test('retirar un material aprobado anula la aprobación del render que lo usa', async () => {
      const { project, asset } = await ready(), render = await rendered(project);
      await decide(project, render);
      await asReviewer((c, x) => media.decideAsset(c, x, project, asset.id, { decision: 'REJECTED', target_sha256: asset.content_sha256, note: 'Derechos retirados' }));
      assert.equal(await projectStatus(project), 'ASSETING');
      await assert.rejects(decide(project, render), code('CONFLICT'));
    });
    await t.test('bloqueos releídos en la transacción: licencia, material, claims, QA, doble de pruebas y render cancelado', async () => {
      const expired = await ready(), lapsed = await rendered(expired.project);
      await f.admin.query(`UPDATE asset_licenses SET expires_at=now()-interval '1 second' WHERE asset_id=$1`, [expired.asset.id]);
      await assert.rejects(decide(expired.project, lapsed), code('BLOCKED_BY_POLICY'));
      assert((await blockerCodes(expired.project, lapsed.id)).includes('LICENSE_EXPIRED'));
      assert.equal(await projectStatus(expired.project), 'VIDEO_REVIEW');
      assert.equal((await decide(expired.project, lapsed, { decision: 'REJECTED', note: 'Licencia vencida' })).project_status, 'ASSETING', 'rechazar no pasa por el gate');

      const changed = await ready(), old = await rendered(changed.project), replacement = await freshAsset(changed.project, seed++);
      await asEditor((c, x) => media.assignVisual(c, x, changed.project, changed.scenes[0].key, replacement.id));
      const fresh = await rendered(changed.project);
      await assert.rejects(decide(changed.project, old), code('BLOCKED_BY_POLICY'));
      assert.deepEqual(await blockerCodes(changed.project, old.id), ['RENDER_STALE']);
      assert.equal((await decide(changed.project, fresh)).project_status, 'APPROVED');

      const tampered = await ready(), cited = await rendered(tampered.project), c = await f.admin.connect();
      try {
        // Solo una corrección a mano en la base puede llegar aquí: el expediente deja de respaldar el guion aprobado.
        await c.query('BEGIN');
        await c.query('SET LOCAL session_replication_role=replica');
        await c.query(`UPDATE dossier_revisions SET content=jsonb_set(content,'{claims}','[]'),content_sha256=$1 WHERE project_id=$2 AND status='APPROVED'`, ['e'.repeat(64), tampered.project]);
        await c.query('COMMIT');
      } finally { c.release(); }
      await assert.rejects(decide(tampered.project, cited), code('BLOCKED_BY_POLICY'));
      const claimBlockers = await blockerCodes(tampered.project, cited.id);
      assert(claimBlockers.includes('DOSSIER_CHANGED') && claimBlockers.length > 1, JSON.stringify(claimBlockers));

      const faulty = await ready(), defective = await rendered(faulty.project);
      await f.admin.query(`UPDATE renders SET qa=jsonb_set(qa,'{passed}','false') WHERE id=$1`, [defective.id]);
      await assert.rejects(decide(faulty.project, defective), code('BLOCKED_BY_POLICY'));
      assert.deepEqual(await blockerCodes(faulty.project, defective.id), ['RENDER_QA_FAILED']);

      const doubled = await ready(), fake = await rendered(doubled.project, null, false);
      await assert.rejects(decide(doubled.project, fake), code('BLOCKED_BY_POLICY'));
      assert.deepEqual(await blockerCodes(doubled.project, fake.id), ['RENDER_PROVIDER_FAKE']);

      const stopped = await ready(), kept = await rendered(stopped.project);
      const { id } = await asEditor((x, y) => renders.requestRender(x, y, stopped.project, { title_index: 0 }));
      await asEditor((x, y) => renders.cancelRender(x, y, stopped.project, id));
      await asEditor((x, y) => renders.requestRender(x, y, stopped.project, { title_index: null }));
      assert.equal(await projectStatus(stopped.project), 'VIDEO_REVIEW');
      await assert.rejects(decide(stopped.project, { id, artifact_sha256: kept.artifact_sha256 }), code('CONFLICT'), 'un render cancelado no tiene bytes');
      await assert.rejects(review(stopped.project, id), code('CONFLICT'));
    });
    await t.test('la base rechaza aprobar por fuera del flujo aunque falle el código', async () => {
      const { project } = await ready(), render = await rendered(project);
      const insert = (client: PoolClient, type: string, renderId: string | null, hash: string) => client.query(`INSERT INTO approvals(organization_id,project_id,render_id,target_sha256,approval_type,decision,decided_by) VALUES($1,$2,$3,$4,$5,'APPROVED',$6)`, [f.orgA, project, renderId, hash, type, reviewer.actorId]);
      const skipReview = (client: PoolClient) => client.query(`UPDATE projects SET status='APPROVED' WHERE id=$1`, [project]);
      await assert.rejects(asReviewer(c => insert(c, 'RENDER', render.id, 'f'.repeat(64))), sqlState('23503'), 'hash que no es el del render');
      await assert.rejects(asReviewer(c => insert(c, 'RENDER', null, render.artifact_sha256)), sqlState('23514'), 'sin render');
      await assert.rejects(asReviewer(c => insert(c, 'SCRIPT', render.id, render.artifact_sha256)), sqlState('23514'), 'render en otro tipo');
      await assert.rejects(asReviewer(skipReview), sqlState('23514'), 'sin aprobación');
      await assert.rejects(asReviewer(c => c.query(`INSERT INTO projects(organization_id,title,status) VALUES($1,'x','APPROVED')`, [f.orgA])), sqlState('23514'));
      await decide(project, render);
      await assert.rejects(asEditor(c => c.query('UPDATE renders SET artifact_sha256=$2 WHERE id=$1', [render.id, 'e'.repeat(64)])), sqlState('23503'), 'el hash aprobado no cambia');
      await assert.rejects(asReviewer(c => c.query(`UPDATE approvals SET decision='REJECTED' WHERE project_id=$1`, [project])), sqlState('42501'), 'una decisión no se edita');
      await assert.rejects(asReviewer(c => c.query('DELETE FROM approvals WHERE project_id=$1', [project])), sqlState('42501'), 'una decisión no se borra');
      await decide(project, render, { decision: 'REJECTED', note: 'Se retira' });
      await asEditor((c, x) => renders.requestRender(c, x, project, { title_index: null }));
      await assert.rejects(asReviewer(skipReview), sqlState('23514'), 'una aprobación anterior no vuelve a abrir la puerta');
    });
    await t.test('el paquete de revisión reúne video, claims, fuentes, derechos y coste, y queda en su organización', async () => {
      const { project, claim, asset } = await ready(), render = await rendered(project);
      const seen = await review(project, render.id);
      assert.deepEqual([seen.blockers, seen.approved, seen.project_status, seen.decisions], [[], false, 'VIDEO_REVIEW', []]);
      assert.deepEqual(Object.keys(seen.urls), ['master', 'preview', 'poster', 'captions']);
      assert.deepEqual(seen.claims.map(item => item.id), [claim]);
      assert.equal(seen.sources.length, 1);
      assert.deepEqual(seen.rights.map(item => [item.id, item.licenses.length]), [[asset.id, 1]]);
      assert(seen.needs_human.includes('subtitle_legibility'));
      assert.deepEqual(seen.usage.map(row => row.operation), ['render', 'tts.synthesize']);
      await assert.rejects(f.db.organizationTransaction(foreign.identity, f.orgB, 'organization:read', (c, x) => renders.reviewRender(c, x, project, render.id, secret)), code('NOT_FOUND'));
      await assert.rejects(review(project, randomUUID()), code('NOT_FOUND'));
      const early = await ready();
      await assert.rejects(review(early.project, randomUUID()), code('CONFLICT'));
    });
    await t.test('rollback de 011: lo aprobado vuelve a revisión, conserva la auditoría y se puede volver a aplicar', async () => {
      const { project } = await ready(), render = await rendered(project);
      await decide(project, render);
      const c = await f.admin.connect();
      try {
        const audits = (await c.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n;
        await c.query('BEGIN');
        await c.query(await readFile('../../db/rollback/011_render_approval.sql', 'utf8'));
        assert.equal((await c.query('SELECT status FROM projects WHERE id=$1', [project])).rows[0].status, 'VIDEO_REVIEW');
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM approvals WHERE approval_type='RENDER'`)).rows[0].n, 0);
        assert.equal((await c.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n, audits);
        assert.equal((await c.query(`SELECT to_regprocedure('require_render_approval()') AS f`)).rows[0].f, null);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN ('renders_artifact_key','approvals_render_target_fk','approvals_render_required')`)).rows[0].n, 0);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM schema_migrations WHERE version='011_render_approval'`)).rows[0].n, 0);
        await c.query(await readFile('../../db/migrations/011_render_approval.sql', 'utf8'));
        assert.notEqual((await c.query(`SELECT to_regprocedure('require_render_approval()') AS f`)).rows[0].f, null);
        await c.query('ROLLBACK');
        assert.equal((await c.query('SELECT status FROM projects WHERE id=$1', [project])).rows[0].status, 'APPROVED');
      } finally { await c.query('ROLLBACK'); c.release(); }
    });
  } finally {
    await f.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
