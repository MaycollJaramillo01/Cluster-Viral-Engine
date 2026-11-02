import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { AppError } from '@cluster/contracts';
import { assetMetadataInput, voiceInput } from '../src/media/contract';
import { localObjectStore } from '../src/media/objects';
import * as media from '../src/media/store';
import { mockTts, TtsError, type TtsProvider } from '../src/media/tts';
import * as scripts from '../src/scripts/store';
import { code, counted, limits, mediaActors, openLicense, png, target, visual } from './media-fixture';
import { createTenantFixture, serverUrl } from './support';

test('F04 PostgreSQL real: biblioteca, licencias, voz por escena, coste y resiliencia', { skip: !serverUrl }, async t => {
  const f = await createTenantFixture(), root = await mkdtemp(path.join(tmpdir(), 'cve-media-')), store = localObjectStore(root);
  try {
    const { editor, reviewer, outsider, asEditor, asReviewer, reader, synthesize, upload, research_, approveVersion, approved, blockers, freshAsset } = await mediaActors(f, store);

    await t.test('carga validada e idempotente; otra organización no ve nada y el rol de runtime no reescribe bytes', async () => {
      const { project } = await research_();
      const first = await upload(project, visual(), png(1));
      assert.equal(first.created, true);
      assert.match(first.object_key, new RegExp(`^org/${f.orgA}/project/${project}/assets/${first.content_sha256}\\.png$`));
      assert.deepEqual([first.kind, first.mime_type, first.width, first.height, first.approval_status], ['IMAGE', 'image/png', 1080, 1920, 'PENDING']);
      assert.equal(first.size_bytes, '40');
      assert.deepEqual(new Uint8Array((await store.get(first.object_key))!), png(1));
      const results = await Promise.all([upload(project, visual('Otra'), png(2)), upload(project, visual('Otra'), png(2)), upload(project, visual('Otra'), png(2))]);
      assert.equal(new Set(results.map(r => r.id)).size, 1);
      assert.equal(results.filter(r => r.created).length, 1);
      await assert.rejects(upload(project, visual(), new Uint8Array(Buffer.from('<html></html>'))), code('INVALID_INPUT'));
      await assert.rejects(upload(project, assetMetadataInput.parse({ name: 'Pista', purpose: 'MUSIC', source_name: 'Sello', duration_ms: 1000 }), png(3)), code('INVALID_INPUT'));
      await assert.rejects(media.uploadAsset(f.db, outsider.identity, f.orgA, project, visual(), png(4), store, limits), code('FORBIDDEN'));
      await assert.rejects(media.uploadAsset(f.db, outsider.identity, f.orgB, project, visual(), png(4), store, limits), code('NOT_FOUND'));
      await assert.rejects(f.db.organizationTransaction(outsider.identity, f.orgB, 'organization:read', c => media.readAsset(c, project, first.id)), code('NOT_FOUND'));
      assert.deepEqual((await f.db.organizationTransaction(outsider.identity, f.orgB, 'organization:read', c => media.listAssets(c, project, { limit: 10 }))).assets, []);
      assert.equal((await reader(c => media.listAssets(c, project, { purpose: 'VISUAL', limit: 10 }))).assets.length, 2);
      const signed = await reader(c => media.assetUrl(c, project, first.id, 'x'.repeat(40)));
      assert.match(signed.url, /^\/api\/objects\?key=org%2F/);
      await assert.rejects(asEditor(c => c.query(`UPDATE assets SET content_sha256=$1 WHERE id=$2`, ['b'.repeat(64), first.id])), /permission denied/);
      await assert.rejects(asEditor(c => c.query(`DELETE FROM assets WHERE id=$1`, [first.id])), /permission denied/);
      assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM audit_events WHERE action='ASSET_UPLOADED' AND organization_id=$1`, [f.orgA])).rows[0].n >= 2, true);
    });
    await t.test('derechos: sin licencia no se aprueba; hash exacto; solo reviewer; licencia nueva o vencida anula la aprobación', async () => {
      const { project } = await research_(), asset = await upload(project, visual(), png(10));
      const decide = (over = {}) => asReviewer((c, x) => media.decideAsset(c, x, project, asset.id, { decision: 'APPROVED', target_sha256: asset.content_sha256, note: '', ...over }));
      await assert.rejects(decide(), code('BLOCKED_BY_POLICY'));
      await asEditor((c, x) => media.addLicense(c, x, project, asset.id, openLicense({ commercial_use_allowed: false })));
      await assert.rejects(decide(), code('BLOCKED_BY_POLICY'));
      await asEditor((c, x) => media.addLicense(c, x, project, asset.id, openLicense({ expires_at: '2020-01-01T00:00:00Z' })));
      await assert.rejects(decide(), code('BLOCKED_BY_POLICY'));
      await asEditor((c, x) => media.addLicense(c, x, project, asset.id, openLicense({ expires_at: new Date(Date.now() + 3600000).toISOString() })));
      await assert.rejects(decide({ target_sha256: 'a'.repeat(64) }), code('CONFLICT'));
      await assert.rejects(f.db.organizationTransaction(editor.identity, f.orgA, 'editorial:review', async () => true), code('FORBIDDEN'));
      const race = await Promise.allSettled([decide(), decide()]);
      assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
      const row = await reader(c => media.readAsset(c, project, asset.id));
      assert.deepEqual([row.approval_status, row.reviewed_by, row.issues.length, row.licenses.length], ['APPROVED', reviewer.actorId, 0, 3]);
      assert.equal(row.licenses.at(-1).reviewed_by, reviewer.actorId);
      // Vencida después de aprobada: se detecta al leer, sin esperar a un cambio en la base.
      await f.admin.query(`UPDATE asset_licenses SET expires_at=now()-interval '1 second' WHERE asset_id=$1`, [asset.id]);
      assert.deepEqual((await reader(c => media.readAsset(c, project, asset.id))).issues.map((i: { code: string }) => i.code), ['LICENSE_EXPIRED']);
      await asEditor((c, x) => media.addLicense(c, x, project, asset.id, openLicense()));
      assert.equal((await reader(c => media.readAsset(c, project, asset.id))).approval_status, 'PENDING');
      await decide();
      await asReviewer((c, x) => media.decideAsset(c, x, project, asset.id, { decision: 'REJECTED', target_sha256: asset.content_sha256, note: 'Derechos retirados' }));
      await assert.rejects(decide(), code('CONFLICT'));
      const proof = await upload(project, assetMetadataInput.parse({ name: 'Autorización', purpose: 'PROOF', source_name: 'Autora' }), new Uint8Array(Buffer.from('%PDF-1.7 autorización')));
      const byProof = await asEditor((c, x) => media.addLicense(c, x, project, asset.id, openLicense({ license_url: null, proof_asset_id: proof.id })));
      assert.equal(byProof.proof_object_key, proof.object_key);
      await assert.rejects(asEditor((c, x) => media.addLicense(c, x, project, asset.id, openLicense({ license_url: null, proof_asset_id: asset.id }))), code('INVALID_INPUT'));
    });
    await t.test('voz exige guion aprobado; caché por huella: reemplazar imagen no invoca TTS y corregir una escena regenera solo esa', async () => {
      const unapproved = await research_();
      await assert.rejects(synthesize(unapproved.project, mockTts()), code('CONFLICT'));
      await assert.rejects(reader(c => media.readMedia(c, unapproved.project)), code('CONFLICT'));
      const { project, claim, body, scenes } = await approved(), first = counted();
      const done = await synthesize(project, first.provider);
      assert.equal(done.complete, true);
      assert.equal(first.calls.length, scenes.length);
      assert.equal(new Set(done.results.map(r => r.status)).size, 1);
      assert.equal(done.results[0].status, 'GENERATED');
      assert.equal(done.results[0].timing_source, 'SYNTHETIC');
      const audio = await f.admin.query(`SELECT g.object_key,g.content_sha256,g.chars_billed,g.provider FROM voice_generations g JOIN scene_media m ON m.voice_generation_id=g.id WHERE m.project_id=$1`, [project]);
      assert.equal(audio.rowCount, scenes.length);
      assert.equal(audio.rows[0].provider, 'mock-elevenlabs');
      assert((await store.get(audio.rows[0].object_key))!.length > 44);

      const second = counted();
      assert.deepEqual([...new Set((await synthesize(project, second.provider)).results.map(r => r.status))], ['CACHED']);
      assert.equal(second.calls.length, 0);

      const before = (await f.admin.query(`SELECT voice_generation_id FROM scene_media WHERE project_id=$1 ORDER BY scene_key`, [project])).rows;
      const a = await freshAsset(project, 20), b = await freshAsset(project, 21);
      await asEditor((c, x) => media.assignVisual(c, x, project, scenes[0].key, a.id));
      await asEditor((c, x) => media.assignVisual(c, x, project, scenes[0].key, b.id));
      assert.deepEqual((await f.admin.query(`SELECT voice_generation_id FROM scene_media WHERE project_id=$1 ORDER BY scene_key`, [project])).rows, before);
      assert.equal((await f.admin.query(`SELECT visual_asset_id FROM scene_media WHERE project_id=$1 AND scene_key=$2`, [project, scenes[0].key])).rows[0].visual_asset_id, b.id);
      assert.deepEqual((await reader(c => media.listAssets(c, project, { limit: 50 }))).assets.find(row => row.id === b.id).scene_keys, [scenes[0].key]);
      const third = counted();
      await synthesize(project, third.provider);
      assert.equal(third.calls.length, 0);

      // Otra voz cambia la huella de todas las escenas; volver a la primera no paga de nuevo.
      const other = counted();
      await synthesize(project, other.provider, { voice_id: 'voz_2' });
      assert.equal(other.calls.length, scenes.length);
      const back = counted();
      await synthesize(project, back.provider);
      assert.equal(back.calls.length, 0);
      const single = counted();
      const corrected = await synthesize(project, single.provider, { settings: { speed: 1.1 }, scene_keys: [scenes[1].key] });
      assert.deepEqual([corrected.results.length, single.calls.length], [1, 1]);
      await assert.rejects(synthesize(project, mockTts(), { scene_keys: ['no-existe:0'] }), code('NOT_FOUND'));
      await synthesize(project, counted().provider);

      // Corregir una palabra: tras reaprobar, solo la escena afectada paga TTS y la imagen sigue asignada.
      const key = body.sections[0].key, edited = await asEditor((c, x) => scripts.updateSection(c, x, project, key, { base_version: 1, text: body.sections[0].text.replace('calma', 'prudencia'), claim_ids: [claim], non_factual: false }));
      await assert.rejects(synthesize(project, mockTts()), code('CONFLICT'));
      await approveVersion(project, edited.version, edited.content_sha256);
      assert.deepEqual([...new Set(await blockers(project))].filter(c => c === 'VOICE_STALE'), ['VOICE_STALE']);
      const changed = (await reader(c => media.approvedScenes(c, project))).scenes;
      const fixed = counted();
      await synthesize(project, fixed.provider);
      assert.equal(fixed.calls.length, changed.filter(s => s.narration.includes('prudencia')).length);
      assert.equal((await f.admin.query(`SELECT visual_asset_id FROM scene_media WHERE project_id=$1 AND scene_key=$2`, [project, scenes[0].key])).rows[0].visual_asset_id, b.id);
      assert(!(await blockers(project)).includes('VOICE_STALE'));

      // La huella incluye la organización: otro proyecto de la misma no vuelve a pagar el mismo texto, y otra organización no ve el audio.
      const sibling = await approved(body.sections.map(section => section.text)), shared = counted();
      assert.deepEqual([...new Set((await synthesize(sibling.project, shared.provider)).results.map(r => r.status))], ['CACHED']);
      assert.equal(shared.calls.length, 0);
      assert.equal((await f.db.organizationTransaction(outsider.identity, f.orgB, 'organization:read', c => c.query('SELECT count(*)::int AS n FROM voice_generations'))).rows[0].n, 0);
    });
    await t.test('resiliencia: duplicado concurrente, 429, fallo parcial y respuesta perdida no duplican coste', async () => {
      const { project, scenes } = await approved();
      const priced = (synth: TtsProvider['synthesize'], rate = 0.1): TtsProvider => ({ ...mockTts(rate), synthesize: synth });
      const base = mockTts();
      const ledger = async () => (await f.admin.query(`SELECT count(*)::int AS rows, count(*) FILTER (WHERE actual_cost_usd IS NULL)::int AS open, COALESCE(sum(actual_cost_usd),0)::float8 AS paid FROM provider_usage WHERE project_id=$1`, [project])).rows[0];
      // Mismo mensaje dos veces a la vez: una sola llamada por escena.
      const slow = counted(priced(async request => { await new Promise(resolve => setTimeout(resolve, 30)); return base.synthesize(request); }));
      const [a, b] = await Promise.all([synthesize(project, slow.provider, { scene_keys: [scenes[0].key] }), synthesize(project, slow.provider, { scene_keys: [scenes[0].key] })]);
      assert.equal(slow.calls.length, 1);
      assert.deepEqual([a, b].map(r => r.results[0].status).sort(), ['FAILED', 'GENERATED']);
      assert.equal([a, b].find(r => r.results[0].status === 'FAILED')!.results[0].code, 'CONFLICT');
      assert.deepEqual([(await ledger()).rows, (await ledger()).open], [1, 0]);
      // Fallo parcial con 429 en la tercera escena: se detiene, no cobra el fallo y el reintento solo genera lo que falta.
      let attempts = 0;
      const flaky = counted(priced(async request => { attempts += 1; if (attempts === 2) throw new TtsError('RATE_LIMITED', 0); return base.synthesize(request); }));
      const partial = await synthesize(project, flaky.provider);
      assert.equal(partial.complete, false);
      assert.deepEqual(partial.results.slice(0, 4).map(r => r.status), ['CACHED', 'GENERATED', 'FAILED', 'SKIPPED']);
      assert.equal(partial.results[2].code, 'RATE_LIMITED');
      const failedJob = (await f.admin.query(`SELECT status,attempt,last_error_code FROM jobs WHERE job_type='TTS' AND project_id=$1 AND status<>'SUCCEEDED'`, [project])).rows;
      assert.deepEqual(failedJob, [{ status: 'RETRY_WAIT', attempt: 1, last_error_code: 'RATE_LIMITED' }]);
      assert.equal((await ledger()).open, 0);
      const resume = counted(priced(request => base.synthesize(request)));
      const finished = await synthesize(project, resume.provider);
      assert.equal(finished.complete, true);
      assert.equal(resume.calls.length, scenes.length - 2);
      assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM voice_generations WHERE project_id=$1`, [project])).rows[0].n, scenes.length);
      const paidTexts = (await f.admin.query(`SELECT sum(input_units)::float8 AS units FROM provider_usage WHERE project_id=$1 AND actual_cost_usd>0`, [project])).rows[0].units;
      assert.equal(paidTexts, scenes.reduce((sum, s) => sum + s.narration.length, 0));

      // Respuesta perdida: pudo cobrarse. La estimación sigue contando y repetir exige confirmación explícita.
      const other = { voice_id: 'voz_perdida', scene_keys: [scenes[0].key] };
      const lost = counted(priced(async () => { throw new TtsError('NO_RESPONSE'); }));
      assert.equal((await synthesize(project, lost.provider, other)).results[0].code, 'NO_RESPONSE');
      const open = (await f.admin.query(`SELECT estimated_cost_usd::float8,actual_cost_usd FROM provider_usage WHERE project_id=$1 AND actual_cost_usd IS NULL`, [project])).rows;
      assert.equal(open.length, 1); assert(open[0].estimated_cost_usd > 0);
      assert.deepEqual((await f.admin.query(`SELECT status,last_error_code FROM jobs WHERE job_type='TTS' AND project_id=$1 AND status<>'SUCCEEDED'`, [project])).rows, [{ status: 'DEAD', last_error_code: 'NO_RESPONSE' }]);
      const again = counted(priced(request => base.synthesize(request)));
      assert.equal((await synthesize(project, again.provider, other)).results[0].code, 'CONFLICT');
      assert.equal(again.calls.length, 0);
      assert.equal((await synthesize(project, again.provider, { ...other, confirm_retry: true })).results[0].status, 'GENERATED');
      assert.equal(again.calls.length, 1);
      // Un proceso caído deja RUNNING: mientras el lease siga vivo nadie paga otra vez.
      const crashed = await synthesize(project, priced(async () => { throw new Error('caída'); }), { voice_id: 'voz_caida', scene_keys: [scenes[0].key] });
      assert.equal(crashed.results[0].code, 'NO_RESPONSE');
      // Error de almacenamiento tras cobrar: el trabajo queda DEAD y el coste estimado no se libera.
      const brokenStore = { ...store, put: async () => { throw new Error('disco lleno'); } };
      await assert.rejects(media.synthesizeVoice(f.db, editor.identity, f.orgA, project, voiceInput.parse({ voice_id: 'voz_disco', model_id: 'modelo_1', scene_keys: [scenes[0].key] }), priced(request => base.synthesize(request)), brokenStore, limits), /disco lleno/);
      assert.equal((await f.admin.query(`SELECT j.status,j.last_error_code,u.actual_cost_usd FROM jobs j JOIN provider_usage u ON u.job_id=j.id WHERE j.last_error_code='SAVE_FAILED' AND j.project_id=$1`, [project])).rows[0].status, 'DEAD');
    });
    await t.test('presupuesto: preflight, tope por video, tope mensual, alerta al 80 % y ledger inmutable', async () => {
      const { project, scenes } = await approved();
      const chars = scenes.reduce((sum, s) => sum + s.narration.length, 0), rate = 1, provider = mockTts(rate), expected = chars / 1000 * rate;
      const preflight = await asEditor((c, x) => media.estimateVoice(c, x.organizationId, project, voiceInput.parse(target), provider, limits));
      assert.deepEqual([preflight.is_estimate, preflight.to_generate, preflight.cached, preflight.characters], [true, scenes.length, 0, chars]);
      assert.equal(Math.round(preflight.estimated_usd * 1000), Math.round(expected * 1000));
      assert.equal((await asEditor((c, x) => media.estimateVoice(c, x.organizationId, project, voiceInput.parse(target), provider, { maxUsdPerVideo: expected / 2 }))).blocked, true);

      const tight = counted(provider);
      const capped = await synthesize(project, tight.provider, {}, { maxUsdPerVideo: expected / 2 });
      assert.equal(capped.complete, false);
      const hit = capped.results.findIndex(r => r.status === 'FAILED');
      assert.equal(capped.results[hit].code, 'BLOCKED_BY_POLICY');
      assert.equal(tight.calls.length, hit);
      assert(capped.results.slice(hit + 1).every(r => r.status === 'SKIPPED'));

      await f.admin.query(`UPDATE organizations SET monthly_budget_usd=0 WHERE id=$1`, [f.orgA]);
      const none = counted(provider);
      assert.equal((await synthesize(project, none.provider)).results.find(r => r.status === 'FAILED')!.code, 'BLOCKED_BY_POLICY');
      assert.equal(none.calls.length, 0);
      // Lo gratuito (mock sin tarifa) no consume presupuesto y no se bloquea.
      assert.equal((await synthesize(project, mockTts(0), { voice_id: 'voz_gratis', scene_keys: [scenes[0].key] })).complete, true);
      const budget = Math.ceil(await (await f.admin.query(`SELECT COALESCE(sum(COALESCE(actual_cost_usd,estimated_cost_usd)),0)::float8 AS s FROM provider_usage WHERE organization_id=$1`, [f.orgA])).rows[0].s) + 1;
      await f.admin.query(`UPDATE organizations SET monthly_budget_usd=$2 WHERE id=$1`, [f.orgA, budget]);
      const before = (await f.admin.query(`SELECT count(*)::int AS n FROM outbox_events WHERE event_type='BUDGET_SOFT_LIMIT_REACHED' AND organization_id=$1`, [f.orgA])).rows[0].n;
      await synthesize(project, provider, {}, { maxUsdPerVideo: 1000 });
      const report = await reader((c, x) => media.usageReport(c, x.organizationId));
      assert(report.spent_usd <= report.budget_usd);
      assert.equal(report.soft_limit_reached, report.spent_usd >= report.budget_usd * 0.8);
      assert(report.rows.every((r: { operation: string; provider: string; unit_name: string }) => r.provider && r.operation && r.unit_name));
      if (report.soft_limit_reached) assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM outbox_events WHERE event_type='BUDGET_SOFT_LIMIT_REACHED' AND organization_id=$1`, [f.orgA])).rows[0].n, before + 1);
      await f.admin.query(`UPDATE organizations SET monthly_budget_usd=100 WHERE id=$1`, [f.orgA]);
      const usageId = report.rows[0].id;
      await assert.rejects(asEditor(c => c.query(`UPDATE provider_usage SET estimated_cost_usd=0 WHERE id=$1`, [usageId])), /permission denied/);
      await assert.rejects(asEditor(c => c.query(`DELETE FROM provider_usage WHERE id=$1`, [usageId])), /permission denied/);
      await assert.rejects(f.db.organizationTransaction(outsider.identity, f.orgB, 'organization:read', (c, x) => media.usageReport(c, x.organizationId)).then(r => { assert.equal(r.rows.length, 0); throw new AppError('NOT_FOUND', 404); }), code('NOT_FOUND'));
    });
    await t.test('gate de medios: música y material sin licencia bloquean; recreación IA rotulada y con gasto; cambio de material invalida revisión', async () => {
      const { project, scenes } = await approved();
      await synthesize(project, mockTts());
      const assets: Awaited<ReturnType<typeof freshAsset>>[] = [];
      for (const [index, scene] of scenes.entries()) {
        const asset = await freshAsset(project, 100 + index);
        assets.push(asset);
        await asEditor((c, x) => media.assignVisual(c, x, project, scene.key, asset.id));
      }
      assert.deepEqual(await blockers(project), []);
      const state = await reader(c => media.readMedia(c, project));
      assert.equal(state.duration_is_estimate, false);
      assert(state.total_ms >= 120000 && state.total_ms <= 240000);
      assert.equal(state.timeline.every(t => t.timing === 'SYNTHETIC'), true);
      assert(state.warnings.some(w => w.code === 'SYNTHETIC_TIMING'));

      const track = await upload(project, assetMetadataInput.parse({ name: 'Pista', purpose: 'MUSIC', source_name: 'Sello', duration_ms: 90000 }), new Uint8Array(Buffer.from('ID3 pista sintética')));
      await assert.rejects(asEditor((c, x) => media.assignMusic(c, x, project, assets[0].id)), code('INVALID_INPUT'));
      await asEditor((c, x) => media.assignMusic(c, x, project, track.id));
      assert.deepEqual((await blockers(project)).sort(), ['ASSET_NOT_APPROVED', 'NO_LICENSE']);
      await asEditor((c, x) => media.addLicense(c, x, project, track.id, openLicense()));
      await asReviewer((c, x) => media.decideAsset(c, x, project, track.id, { decision: 'APPROVED', target_sha256: track.content_sha256, note: '' }));
      assert.deepEqual(await blockers(project), []);
      await asEditor((c, x) => media.assignMusic(c, x, project, null));
      assert.equal((await reader(c => media.readMedia(c, project))).music_asset_id, null);

      const generated = await upload(project, visual('Recreación del puente', { is_ai_generated: true, ai_label: 'Recreación con IA', ai_prompt: 'Puente ficticio al amanecer', ai_provider: 'proveedor-ficticio', ai_cost_usd: 0.25 }), png(500));
      assert.equal(generated.is_ai_generated, true);
      const spent = (await f.admin.query(`SELECT provider,operation,actual_cost_usd::float8 AS cost FROM provider_usage WHERE project_id=$1 AND operation='image.generate'`, [project])).rows;
      assert.deepEqual(spent, [{ provider: 'proveedor-ficticio', operation: 'image.generate', cost: 0.25 }]);
      await assert.rejects(f.admin.query(`INSERT INTO assets(organization_id,project_id,kind,object_key,content_sha256,size_bytes,mime_type,is_ai_generated,name,purpose,source_name,created_by) VALUES($1,$2,'IMAGE','x','${'c'.repeat(64)}',1,'image/png',true,'x','VISUAL','x',$3)`, [f.orgA, project, editor.actorId]), /assets_ai_labelled/);
      await asEditor((c, x) => media.addLicense(c, x, project, generated.id, openLicense({ license_name: 'Generada por encargo', attribution_required: false, attribution_text: null })));
      await asReviewer((c, x) => media.decideAsset(c, x, project, generated.id, { decision: 'APPROVED', target_sha256: generated.content_sha256, note: '' }));
      await asEditor((c, x) => media.assignVisual(c, x, project, scenes[0].key, generated.id));
      const labelled = await reader(c => media.readMedia(c, project));
      assert.equal(labelled.timeline[0].overlay, 'Recreación con IA');
      assert.match(labelled.captions.ass, /Overlay,,0,0,0,,Recreación con IA/);

      // La FK compuesta impide usar material de otro proyecto aunque el código fallara.
      const other = await research_(), foreign = await upload(other.project, visual('Ajena'), png(600));
      await assert.rejects(asEditor((c, x) => media.assignVisual(c, x, project, scenes[0].key, foreign.id)), code('NOT_FOUND'));
      await assert.rejects(asEditor(c => c.query(`UPDATE scene_media SET visual_asset_id=$1 WHERE project_id=$2`, [foreign.id, project])), /foreign key/);
      await assert.rejects(asEditor(c => c.query(`INSERT INTO project_music(organization_id,project_id,asset_id) VALUES($1,$2,$3)`, [f.orgB, project, track.id])), /row-level security/);

      // Con el proyecto ya en revisión de video, cambiar material usado la invalida; un activo ajeno a las escenas, no.
      const setStatus = (status: string) => f.admin.query(`UPDATE projects SET status=$1 WHERE id=$2`, [status, project]);
      const status = async () => (await f.admin.query(`SELECT status FROM projects WHERE id=$1`, [project])).rows[0].status;
      await setStatus('VIDEO_REVIEW');
      const unused = await upload(project, visual('Sin usar'), png(700));
      await asEditor((c, x) => media.addLicense(c, x, project, unused.id, openLicense()));
      assert.equal(await status(), 'VIDEO_REVIEW');
      await asEditor((c, x) => media.addLicense(c, x, project, assets[1].id, openLicense()));
      assert.equal(await status(), 'ASSETING');
      assert((await blockers(project)).includes('ASSET_NOT_APPROVED'));
      await setStatus('VIDEO_REVIEW');
      await asEditor((c, x) => media.assignVisual(c, x, project, scenes[1].key, assets[2].id));
      assert.equal(await status(), 'ASSETING');
      await setStatus('VIDEO_REVIEW');
      await asReviewer((c, x) => media.decideAsset(c, x, project, assets[2].id, { decision: 'REJECTED', target_sha256: assets[2].content_sha256, note: 'Sin derechos' }));
      assert.equal(await status(), 'ASSETING');
    });
    await t.test('rollback de 009 no toca auditoría ni aprobaciones, y runtime no elude RLS', async () => {
      assert.equal((await f.runtime.query('SELECT count(*)::int AS n FROM scene_media')).rows[0].n, 0);
      const client = await f.admin.connect();
      try {
        const count = async () => (await client.query('SELECT (SELECT count(*) FROM audit_events)::int + (SELECT count(*) FROM approvals)::int + (SELECT count(*) FROM provider_usage)::int AS n')).rows[0].n;
        const before = await count();
        await client.query('BEGIN');
        await client.query(await readFile('../../db/rollback/009_media.sql', 'utf8'));
        assert.equal(await count(), before);
        assert.equal((await client.query(`SELECT to_regclass('scene_media') AS name`)).rows[0].name, null);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
  } finally { await f.close(); await rm(root, { recursive: true, force: true }); }
});
