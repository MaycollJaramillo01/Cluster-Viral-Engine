import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { localObjectStore } from '../src/media/objects';
import * as media from '../src/media/store';
import { mockTts } from '../src/media/tts';
import { operationsReport, windowDays } from '../src/operations/store';
import { fakeRenderProvider } from '../src/render/provider';
import * as renders from '../src/render/store';
import { processNext } from '../src/render/worker';
import { code, mediaActors } from './media-fixture';
import { createTenantFixture, serverUrl } from './support';

test('F07 PostgreSQL real: los indicadores salen de lo registrado, lo no medido es null y quedan en su organización', { skip: !serverUrl }, async () => {
  const f = await createTenantFixture(), root = await mkdtemp(path.join(tmpdir(), 'cve-operations-')), store = localObjectStore(root);
  try {
    const { asEditor, asReviewer, outsider, synthesize, approved, freshAsset } = await mediaActors(f, store);
    const analyst = await f.member(f.orgA, 'analyst', 'analyst');
    const worker = { pool: f.runtime, store, workerId: 'worker-a', workRoot: path.join(root, 'work'), pollMs: 5, heartbeatMs: 20, leaseSeconds: 60 };
    const report = (days = 30) => f.db.organizationTransaction(analyst.identity, f.orgA, 'organization:read', (c, x) => operationsReport(c, x.organizationId, days));
    const ready = async (seed: number) => {
      const { project, scenes } = await approved();
      await synthesize(project, mockTts());
      const asset = await freshAsset(project, seed);
      for (const scene of scenes) await asEditor((c, x) => media.assignVisual(c, x, project, scene.key, asset.id));
      return project;
    };
    const request = (project: string) => asEditor((c, x) => renders.requestRender(c, x, project, { title_index: null }));
    const cost = (project: string, job: string | null, usd: number) => f.admin.query(`INSERT INTO provider_usage(organization_id,project_id,job_id,provider,operation,estimated_cost_usd) VALUES($1,$2,$3,'prueba','prueba',$4)`, [f.orgA, project, job, usd]);

    for (const days of ['0', '367', '1.5', 'x']) assert.throws(() => windowDays(new URLSearchParams({ days })), code('INVALID_INPUT'), days);
    assert.deepEqual([windowDays(new URLSearchParams()), windowDays(new URLSearchParams({ days: '7' }))], [30, 7]);

    const empty = await report();
    assert.deepEqual(empty.lead_time, { n: 0, p50_seconds: null, p95_seconds: null }, 'sin datos es desconocido, no cero');
    assert.deepEqual([empty.renders.total, empty.decisions, empty.costs, empty.failed_jobs_cost_usd], [0, [], [], 0]);

    // Un render con defectos muere por QA y el coste del trabajo muerto se cuenta como coste de fallo.
    const failedProject = await ready(7000), failedRender = await request(failedProject);
    assert.equal((await processNext({ ...worker, provider: fakeRenderProvider(() => ({ defect: true })) }))?.outcome, 'FAILED');
    const failedJob = (await f.admin.query('SELECT job_id FROM renders WHERE id=$1', [failedRender.id])).rows[0].job_id as string;
    await cost(failedProject, failedJob, 0.25);

    // Otro falla una vez, se reintenta, se rechaza y al final se aprueba.
    const project = await ready(7001), { id } = await request(project);
    assert.equal((await processNext({ ...worker, provider: fakeRenderProvider(() => ({ fail: 'PROCESS_FAILED' })) }))?.outcome, 'RETRY');
    await f.admin.query(`UPDATE jobs SET scheduled_at=now() WHERE project_id=$1 AND job_type='RENDER'`, [project]);
    assert.equal((await processNext({ ...worker, provider: fakeRenderProvider() }))?.outcome, 'SUCCEEDED');
    const { artifact_sha256: artifact } = (await f.admin.query(`UPDATE renders SET provider='docker' WHERE id=$1 RETURNING artifact_sha256`, [id])).rows[0] as { artifact_sha256: string };
    await asReviewer((c, x) => renders.decideRender(c, x, project, id, { decision: 'REJECTED', target_sha256: artifact, note: 'Falta contexto' }));
    await request(project);
    await asReviewer((c, x) => renders.decideRender(c, x, project, id, { decision: 'APPROVED', target_sha256: artifact, note: '' }));

    const full = await report();
    assert.deepEqual(full.renders, { total: 2, succeeded: 1, failed: 1, cancelled: 0, retried: 1, cpu_seconds: 1 });
    assert.deepEqual(full.failure_causes, [{ error_code: 'QA_FAILED', n: 1 }]);
    assert.equal(full.lead_time.n, 1);
    assert.equal(full.review_wait.n, 1);
    for (const timing of [full.lead_time, full.review_wait]) assert((timing.p50_seconds as number) > 0 && (timing.p95_seconds as number) >= (timing.p50_seconds as number), JSON.stringify(timing));
    const decided = (type: string, decision: string) => full.decisions.find(row => row.approval_type === type && row.decision === decision)?.n;
    assert.deepEqual([decided('RENDER', 'APPROVED'), decided('RENDER', 'REJECTED'), decided('SCRIPT', 'APPROVED'), decided('RESEARCH', 'APPROVED')], [1, 1, 2, 2]);
    assert.deepEqual(full.costs.map(row => row.operation), ['render', 'tts.synthesize', 'prueba']);
    assert.equal(full.failed_jobs_cost_usd, 0.25);
    // Lo que no se registra no se inventa: null, nunca cero.
    assert.deepEqual([full.human_minutes, full.failed_render_cpu_seconds, full.audience], [null, null, null]);
    assert.equal(full.budget.spent_usd, 0.25);

    // Coste por video: la estimación ya cuenta, y lo final sigue abierto mientras quede algo sin liquidar.
    const usage = await f.db.organizationTransaction(analyst.identity, f.orgA, 'organization:read', (c, x) => media.usageReport(c, x.organizationId));
    const video = (id_: string) => usage.by_project.find(row => row.project_id === id_);
    assert.deepEqual(video(failedProject), { project_id: failedProject, estimated_usd: 0.25, actual_usd: 0, unsettled: 1 });
    assert.deepEqual(video(project), { project_id: project, estimated_usd: 0, actual_usd: 0, unsettled: 0 });

    // La ventana filtra de verdad.
    await f.admin.query(`UPDATE renders SET created_at=now()-interval '40 days' WHERE id=$1`, [failedRender.id]);
    assert.deepEqual([(await report(30)).renders.total, (await report(30)).failure_causes, (await report(60)).renders.total], [1, [], 2]);

    // Otra organización no ve nada, aunque sea la misma consulta.
    const foreign = await f.db.organizationTransaction(outsider.identity, f.orgB, 'organization:read', (c, x) => operationsReport(c, x.organizationId, 366));
    assert.deepEqual([foreign.renders.total, foreign.lead_time.n, foreign.decisions, foreign.costs, foreign.failure_causes, foreign.failed_jobs_cost_usd, foreign.budget.spent_usd], [0, 0, [], [], [], 0, 0]);
    assert.deepEqual((await f.db.organizationTransaction(outsider.identity, f.orgB, 'organization:read', (c, x) => media.usageReport(c, x.organizationId))).by_project, []);
    await assert.rejects(f.db.organizationTransaction(outsider.identity, f.orgA, 'organization:read', async () => true), code('FORBIDDEN'));
  } finally {
    await f.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
