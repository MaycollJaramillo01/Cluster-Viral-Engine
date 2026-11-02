import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { AppError } from '@cluster/contracts';
import { mockModel, type EditorialModel } from '../src/research/model';
import * as research from '../src/research/store';
import { scriptContentSchema } from '../src/scripts/contract';
import * as scripts from '../src/scripts/store';
import { createTenantFixture, serverUrl } from './support';

const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;
const sentence = 'Este fragmento ficticio describe el puente de prueba con calma y sin añadir datos nuevos para el relato.';
const longText = Array(10).fill(sentence).join(' ');

test('F03 PostgreSQL real: versiones, conflicto optimista, regeneración y aprobación exacta', { skip: !serverUrl }, async t => {
  const f = await createTenantFixture();
  try {
    const editor = await f.member(f.orgA, 'editor', 'editor'), reviewer = await f.member(f.orgA, 'reviewer', 'reviewer'), outsider = await f.member(f.orgB, 'editor', 'outsider');
    const asEditor = <R>(op: Parameters<typeof f.db.organizationTransaction<R>>[3]) => f.db.organizationTransaction(editor.identity, f.orgA, 'project:write', op);
    const asReviewer = <R>(op: Parameters<typeof f.db.organizationTransaction<R>>[3]) => f.db.organizationTransaction(reviewer.identity, f.orgA, 'editorial:review', op);
    const researched = async () => {
      const project = await asEditor(async (c, x) => (await research.selectStory(c, x, (await research.createStory(c, x, { proposed_title: 'Caso ficticio', summary: '', hook: '', category: null, interest_reason: '', source_availability: '', visual_potential: '', risk_notes: '', editorial_risk: 'LOW' })).id)).project_id);
      const source = await asEditor((c, x) => research.addSource(c, x, project, { url: 'https://a.example/x', title: '', publisher: 'Archivo', author: null, publication_date: null, retrieved_at: '2026-10-31T00:00:00.000Z', source_type: 'PRIMARY', evidence_excerpt: 'Extracto.', license_note: '' }));
      const claim = await asEditor((c, x) => research.addClaim(c, x, project, { statement: 'El puente ficticio se inauguró.', classification: 'CONFIRMED', subject: '', event_date: null, legal_status: 'NONE', risk_categories: [], evidence: [{ source_id: source.id, relation: 'SUPPORTS', excerpt: null }] }));
      return { project, claim: claim.id as string };
    };
    const approved = async () => {
      const { project, claim } = await researched();
      const frozen = await asEditor((c, x) => research.freezeDossier(c, x, project));
      await asReviewer((c, x) => research.decideDossier(c, x, project, frozen.revision, { decision: 'APPROVED', target_sha256: frozen.content_sha256, note: '' }));
      return { project, claim };
    };
    const content = (claim: string, a = randomUUID(), b = randomUUID()) => scriptContentSchema.parse({ tone: 'Sobrio', target_seconds: 150, title_options: ['Título uno', 'Título dos', 'Título tres'], hooks: ['Gancho uno', 'Gancho dos', 'Gancho tres'], selected_hook: 0,
      sections: [{ key: a, beat: 'HOOK', text: longText, claim_ids: [claim] }, { key: b, beat: 'OUTCOME', text: longText, claim_ids: [claim] }] });

    await t.test('sin dossier aprobado no hay guion, ni siquiera con el proyecto en investigación', async () => {
      const { project, claim } = await researched();
      await assert.rejects(asEditor((c, x) => scripts.saveVersion(c, x, project, 0, content(claim), 'HUMAN')), code('CONFLICT'));
      await asEditor((c, x) => research.freezeDossier(c, x, project));
      await assert.rejects(asEditor((c, x) => scripts.saveVersion(c, x, project, 0, content(claim), 'HUMAN')), code('CONFLICT'));
    });
    await t.test('dos editores sobre la misma versión: uno gana con 409 para el otro y conserva el historial', async () => {
      const { project, claim } = await approved();
      const body = content(claim), key = body.sections[0].key;
      const first = await asEditor((c, x) => scripts.saveVersion(c, x, project, 0, body, 'HUMAN'));
      assert.equal(first.version, 1); assert.deepEqual(first.gate.blockers, []); assert(first.scene_count > 1);
      const edit = (text: string) => asEditor((c, x) => scripts.updateSection(c, x, project, key, { base_version: 1, text, claim_ids: [claim], non_factual: false }));
      const results = await Promise.allSettled([edit(`${longText} Primero.`), edit(`${longText} Segundo.`)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      assert(code('CONFLICT')(rejected.reason));
      const read = await f.db.organizationTransaction(editor.identity, f.orgA, 'organization:read', c => scripts.readScript(c, project));
      assert.equal(read.current_version, 2);
      assert.deepEqual(read.history.map((h: { version: number; status: string }) => [h.version, h.status]), [[2, 'DRAFT'], [1, 'SUPERSEDED']]);
      assert.equal((await f.db.organizationTransaction(editor.identity, f.orgA, 'organization:read', c => scripts.readScript(c, project, 1))).content.sections[0].text, longText);
      assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM audit_events WHERE action='SCRIPT_VERSION_CREATED'`)).rows[0].n >= 2, true);
      await assert.rejects(f.admin.query(`UPDATE script_versions SET narration='x' WHERE version=1`), /immutable/);
      await assert.rejects(f.db.organizationTransaction(outsider.identity, f.orgB, 'organization:read', c => scripts.readScript(c, project)), code('NOT_FOUND'));
    });
    await t.test('regenerar un párrafo conserva el hash de las otras escenas; reintento no repite la llamada', async () => {
      const { project, claim } = await approved();
      const body = content(claim), target = body.sections[0].key, other = body.sections[1].key;
      await asEditor((c, x) => scripts.saveVersion(c, x, project, 0, body, 'HUMAN'));
      let calls = 0;
      const model: EditorialModel = { ...mockModel, complete: prompt => { calls += 1; return mockModel.complete(prompt); } };
      const request = { idempotency_key: 'regenerar-seccion', base_version: 1, instruction: 'Más breve' };
      const done = await scripts.regenerateSection(f.db, editor.identity, f.orgA, project, target, request, model);
      assert.equal('version' in done && done.version, 2); assert.equal(calls, 1);
      assert.equal((await scripts.regenerateSection(f.db, editor.identity, f.orgA, project, target, request, model)).reused, true); assert.equal(calls, 1);
      const hashes = async (version: number, key: string) => (await f.admin.query(`SELECT s.content_sha256 FROM scenes s JOIN script_versions v ON v.id=s.script_version_id JOIN scripts r ON r.id=v.script_id WHERE r.project_id=$1 AND v.version=$2 AND s.scene_key LIKE $3 ORDER BY s.ordinal`, [project, version, `${key}:%`])).rows.map(r => r.content_sha256);
      assert.deepEqual(await hashes(2, other), await hashes(1, other));
      assert.notDeepEqual(await hashes(2, target), await hashes(1, target));
      assert.equal((await f.db.organizationTransaction(editor.identity, f.orgA, 'organization:read', c => scripts.readScript(c, project))).origin, 'MOCK');
      await assert.rejects(scripts.regenerateSection(f.db, editor.identity, f.orgA, project, target, { ...request, idempotency_key: 'version-vieja' }, model), code('CONFLICT'));
    });
    await t.test('generar por modelo: guarda marcado, no aprueba solo; claim inventado no crea versión', async () => {
      const { project, claim } = await approved();
      const invented: EditorialModel = { ...mockModel, complete: async prompt => (await mockModel.complete(prompt)).replace(/"claim_ids":\["[0-9a-f-]+"\]/, `"claim_ids":["${randomUUID()}"]`) };
      const rejected = await scripts.generateScript(f.db, editor.identity, f.orgA, project, { idempotency_key: 'guion-invalido', tone: 'Sobrio', target_seconds: 120 }, invented);
      assert.deepEqual('rejected' in rejected && rejected.rejected, ['UNKNOWN_CLAIM']);
      assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM scripts WHERE project_id=$1`, [project])).rows[0].n, 0);
      const generated = await scripts.generateScript(f.db, editor.identity, f.orgA, project, { idempotency_key: 'guion-valido', tone: 'Sobrio', target_seconds: 120 }, mockModel);
      assert.equal('status' in generated && generated.status, 'DRAFT');
      assert.equal((await f.admin.query(`SELECT status FROM projects WHERE id=$1`, [project])).rows[0].status, 'SCRIPTING');
      await assert.rejects(scripts.generateScript(f.db, outsider.identity, f.orgA, project, { idempotency_key: 'otro-tenant', tone: 'Sobrio', target_seconds: 120 }, mockModel), code('FORBIDDEN'));
      // Alguien guarda mientras el modelo responde: 409 y el job no queda RUNNING, sin perder lo que esa persona guardó.
      const racing: EditorialModel = { ...mockModel, complete: async prompt => { await asEditor((c, x) => scripts.saveVersion(c, x, project, 1, content(claim), 'HUMAN')); return mockModel.complete(prompt); } };
      await assert.rejects(scripts.generateScript(f.db, editor.identity, f.orgA, project, { idempotency_key: 'guion-en-carrera', tone: 'Sobrio', target_seconds: 120 }, racing), code('CONFLICT'));
      const job = (await f.admin.query(`SELECT status,last_error_code FROM jobs WHERE idempotency_key='guion-en-carrera'`)).rows[0];
      assert.deepEqual([job.status, job.last_error_code], ['DEAD', 'SAVE_REJECTED']);
      assert.equal((await f.admin.query(`SELECT current_version FROM scripts WHERE project_id=$1`, [project])).rows[0].current_version, 2);
    });
    await t.test('editor y reviewer completo: aprueba la versión exacta y una edición posterior invalida la aprobación', async () => {
      const { project, claim } = await approved();
      const body = content(claim), key = body.sections[0].key;
      const first = await asEditor((c, x) => scripts.saveVersion(c, x, project, 0, body, 'HUMAN'));
      await assert.rejects(asReviewer((c, x) => scripts.decideVersion(c, x, project, 1, { decision: 'APPROVED', target_sha256: first.content_sha256, note: '' })), code('CONFLICT'));
      await asEditor((c, x) => scripts.submitVersion(c, x, project, 1));
      await assert.rejects(f.db.organizationTransaction(editor.identity, f.orgA, 'editorial:review', async () => true), code('FORBIDDEN'));
      await assert.rejects(asReviewer((c, x) => scripts.decideVersion(c, x, project, 1, { decision: 'APPROVED', target_sha256: 'a'.repeat(64), note: '' })), code('CONFLICT'));
      const decide = () => asReviewer((c, x) => scripts.decideVersion(c, x, project, 1, { decision: 'APPROVED', target_sha256: first.content_sha256, note: '' }));
      const race = await Promise.allSettled([decide(), decide()]);
      assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal((await f.admin.query(`SELECT status FROM projects WHERE id=$1`, [project])).rows[0].status, 'ASSETING');
      assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM approvals WHERE project_id=$1 AND approval_type='SCRIPT'`, [project])).rows[0].n, 1);
      const edited = await asEditor((c, x) => scripts.updateSection(c, x, project, key, { base_version: 1, text: `${longText} Cambio.`, claim_ids: [claim], non_factual: false }));
      assert.equal(edited.version, 2);
      const rows = (await f.admin.query(`SELECT v.version,v.status FROM script_versions v JOIN scripts s ON s.id=v.script_id WHERE s.project_id=$1 ORDER BY v.version`, [project])).rows;
      assert.deepEqual(rows.map(r => r.status), ['SUPERSEDED', 'DRAFT']);
      assert.equal((await f.admin.query(`SELECT status FROM projects WHERE id=$1`, [project])).rows[0].status, 'SCRIPTING');
      await assert.rejects(asReviewer((c, x) => scripts.decideVersion(c, x, project, 1, { decision: 'APPROVED', target_sha256: first.content_sha256, note: '' })), code('CONFLICT'));
    });
    await t.test('guion con bloqueos no se aprueba; rechazar vuelve a guion y exige otra versión', async () => {
      const { project, claim } = await approved();
      const bad = scriptContentSchema.parse({ ...content(claim), sections: [{ key: randomUUID(), beat: 'DEVELOPMENT', text: 'Demasiado corto, con 999 muertos.', claim_ids: [claim] }] });
      const first = await asEditor((c, x) => scripts.saveVersion(c, x, project, 0, bad, 'HUMAN'));
      assert(first.gate.blockers.some((b: { code: string }) => b.code === 'DURATION_OUT_OF_RANGE'));
      await asEditor((c, x) => scripts.submitVersion(c, x, project, 1));
      await assert.rejects(asReviewer((c, x) => scripts.decideVersion(c, x, project, 1, { decision: 'APPROVED', target_sha256: first.content_sha256, note: '' })), code('BLOCKED_BY_POLICY'));
      const rejected = await asReviewer((c, x) => scripts.decideVersion(c, x, project, 1, { decision: 'REJECTED', target_sha256: first.content_sha256, note: 'Cifra sin fuente' }));
      assert.equal(rejected.project_status, 'SCRIPTING');
      assert.equal((await asEditor((c, x) => scripts.saveVersion(c, x, project, 1, content(claim), 'HUMAN'))).version, 2);
    });
    await t.test('rollback de 008 no toca auditoría ni aprobaciones', async () => {
      const client = await f.admin.connect();
      try {
        const count = async () => (await client.query('SELECT (SELECT count(*) FROM audit_events)::int + (SELECT count(*) FROM approvals)::int AS n')).rows[0].n;
        const before = await count();
        await client.query('BEGIN');
        await client.query(await readFile('../../db/rollback/008_scripts.sql', 'utf8'));
        assert.equal(await count(), before);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
  } finally { await f.close(); }
});
