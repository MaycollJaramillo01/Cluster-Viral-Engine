import type { PoolClient } from 'pg';
import { AppError, type OrganizationContext, type VerifiedIdentity } from '@cluster/contracts';
import { sha256 } from '../phase00/contract';
import type { DossierContent } from '../research/contract';
import type { EditorialModel } from '../research/model';
import { finishJob, requireProject, reserveJob } from '../research/store';
import { audit, emit } from '../server/audit';
import type { TenantDatabase } from '../server/database';
import { scriptContentSchema, type ScriptContent, type ScriptDecision } from './contract';
import { acceptRegeneration, acceptScript, regenerationPrompt, scriptPrompt } from './model';
import { evaluateScript, narrationOf, planScenes, sceneHash } from './policy';

type Client = PoolClient;
type Context = OrganizationContext;
type Options = { requestId?: string };
// Editar devuelve el proyecto a guion, también desde etapas posteriores: la aprobación anterior deja de valer.
const editable = ['SCRIPTING', 'SCRIPT_REVIEW', 'ASSETING', 'VOICING', 'RENDERING', 'VIDEO_REVIEW'] as const;

export async function approvedDossier(client: Client, projectId: string) {
  const row = await client.query(`SELECT content,content_sha256 FROM dossier_revisions WHERE project_id=$1 AND status='APPROVED'`, [projectId]);
  if (!row.rowCount) throw new AppError('BLOCKED_BY_POLICY', 409);
  return { content: row.rows[0].content as DossierContent, sha256: row.rows[0].content_sha256 as string };
}
async function currentVersion(client: Client, projectId: string) {
  const script = await client.query('SELECT id,current_version FROM scripts WHERE project_id=$1', [projectId]);
  return script.rowCount ? { id: script.rows[0].id as string, version: script.rows[0].current_version as number } : null;
}
const loadVersion = async (client: Client, scriptId: string, version: number) => {
  const row = await client.query('SELECT id,version,status,content,content_sha256,dossier_sha256,origin,estimated_seconds,created_by,created_at FROM script_versions WHERE script_id=$1 AND version=$2', [scriptId, version]);
  if (!row.rowCount) throw new AppError('NOT_FOUND', 404);
  return row.rows[0];
};

// Control optimista: quien guarda declara sobre qué versión trabajó. El lock del proyecto serializa la comprobación.
export async function saveVersion(client: Client, context: Context, projectId: string, baseVersion: number, content: ScriptContent, origin: 'HUMAN' | 'MODEL' | 'MOCK', options: Options = {}) {
  await requireProject(client, projectId, editable);
  const dossier = await approvedDossier(client, projectId);
  let script = await currentVersion(client, projectId);
  if ((script?.version ?? 0) !== baseVersion) throw new AppError('CONFLICT', 409);
  if (!script) {
    const created = await client.query('INSERT INTO scripts(organization_id,project_id,locale) VALUES($1,$2,$3) RETURNING id', [context.organizationId, projectId, content.locale]);
    script = { id: created.rows[0].id, version: 0 };
  }
  const gate = evaluateScript(content, dossier.content), hash = sha256(content), next = baseVersion + 1;
  await client.query(`UPDATE script_versions SET status='SUPERSEDED' WHERE script_id=$1 AND status IN ('DRAFT','REVIEW','APPROVED')`, [script.id]);
  const row = await client.query(`INSERT INTO script_versions(organization_id,script_id,version,title_options,hooks,narration,estimated_seconds,source_claim_ids,content_sha256,created_by,content,dossier_sha256,origin)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,version,status,content_sha256`,
    [context.organizationId, script.id, next, JSON.stringify(content.title_options), JSON.stringify(content.hooks), narrationOf(content), gate.estimated_seconds,
      [...new Set(content.sections.flatMap(s => s.claim_ids))], hash, context.actorId, JSON.stringify(content), dossier.sha256, origin]);
  const scenes = planScenes(content);
  for (const [ordinal, scene] of scenes.entries()) await client.query(`INSERT INTO scenes(organization_id,script_version_id,ordinal,narration_text,duration_ms,manifest,scene_key,content_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [context.organizationId, row.rows[0].id, ordinal, scene.narration, scene.duration_ms, JSON.stringify(scene), scene.key, sceneHash(scene)]);
  await client.query('UPDATE scripts SET current_version=$1 WHERE id=$2', [next, script.id]);
  await client.query(`UPDATE projects SET status='SCRIPTING',updated_at=now(),revision=revision+1 WHERE id=$1`, [projectId]);
  await audit(client, context, 'SCRIPT_VERSION_CREATED', 'script_version', row.rows[0].id, { ...options, afterHash: hash });
  return { ...row.rows[0], scene_count: scenes.length, gate };
}
export async function updateSection(client: Client, context: Context, projectId: string, sectionKey: string, input: { base_version: number; text: string; claim_ids: string[]; non_factual: boolean }, options: Options = {}) {
  await requireProject(client, projectId, editable);
  const script = await currentVersion(client, projectId);
  if (!script) throw new AppError('NOT_FOUND', 404);
  if (script.version !== input.base_version) throw new AppError('CONFLICT', 409);
  const content = (await loadVersion(client, script.id, script.version)).content as ScriptContent;
  if (!content.sections.some(s => s.key === sectionKey)) throw new AppError('NOT_FOUND', 404);
  const updated = { ...content, sections: content.sections.map(s => s.key === sectionKey ? { ...s, text: input.text, claim_ids: input.claim_ids, non_factual: input.non_factual } : s) };
  return saveVersion(client, context, projectId, input.base_version, scriptContentSchema.parse(updated), 'HUMAN', options);
}
export async function readScript(client: Client, projectId: string, requested?: number) {
  const script = await currentVersion(client, projectId);
  if (!script) throw new AppError('NOT_FOUND', 404);
  const version = await loadVersion(client, script.id, requested ?? script.version);
  const dossier = await approvedDossier(client, projectId);
  const scenes = await client.query('SELECT ordinal,scene_key,manifest,content_sha256 FROM scenes WHERE script_version_id=$1 ORDER BY ordinal', [version.id]);
  const history = await client.query('SELECT version,status,origin,content_sha256,created_by,created_at FROM script_versions WHERE script_id=$1 ORDER BY version DESC LIMIT 100', [script.id]);
  return { ...version, current_version: script.version, gate: evaluateScript(version.content, dossier.content), scenes: scenes.rows, history: history.rows };
}
export async function submitVersion(client: Client, context: Context, projectId: string, versionNumber: number, options: Options = {}) {
  await requireProject(client, projectId, ['SCRIPTING']);
  const script = await currentVersion(client, projectId);
  if (!script || script.version !== versionNumber) throw new AppError('CONFLICT', 409);
  const version = await loadVersion(client, script.id, versionNumber);
  if (version.status !== 'DRAFT') throw new AppError('CONFLICT', 409);
  await client.query(`UPDATE script_versions SET status='REVIEW' WHERE id=$1`, [version.id]);
  await client.query(`UPDATE projects SET status='SCRIPT_REVIEW',updated_at=now(),revision=revision+1 WHERE id=$1`, [projectId]);
  await audit(client, context, 'SCRIPT_SUBMITTED', 'script_version', version.id, { ...options, afterHash: version.content_sha256 });
  await emit(client, context, 'script_version', version.id, 'SCRIPT_READY_FOR_REVIEW', { project_id: projectId, version: versionNumber });
  return { version: versionNumber, status: 'REVIEW', content_sha256: version.content_sha256 };
}
export async function decideVersion(client: Client, context: Context, projectId: string, versionNumber: number, input: ScriptDecision, options: Options = {}) {
  await requireProject(client, projectId, ['SCRIPT_REVIEW']);
  const script = await currentVersion(client, projectId);
  if (!script) throw new AppError('NOT_FOUND', 404);
  const version = await loadVersion(client, script.id, versionNumber);
  if (version.status !== 'REVIEW' || version.content_sha256 !== input.target_sha256 || script.version !== versionNumber) throw new AppError('CONFLICT', 409);
  const dossier = await approvedDossier(client, projectId);
  if (dossier.sha256 !== version.dossier_sha256) throw new AppError('CONFLICT', 409);
  if (input.decision === 'APPROVED' && evaluateScript(version.content, dossier.content).blockers.length) throw new AppError('BLOCKED_BY_POLICY', 409);
  await client.query(`INSERT INTO approvals(organization_id,project_id,target_sha256,approval_type,decision,decided_by,note) VALUES($1,$2,$3,'SCRIPT',$4,$5,$6)`,
    [context.organizationId, projectId, input.target_sha256, input.decision, context.actorId, input.note || null]);
  await client.query('UPDATE script_versions SET status=$1 WHERE id=$2', [input.decision, version.id]);
  const projectStatus = input.decision === 'APPROVED' ? 'ASSETING' : 'SCRIPTING';
  await client.query(`UPDATE projects SET status=$1,updated_at=now(),revision=revision+1 WHERE id=$2`, [projectStatus, projectId]);
  await audit(client, context, `SCRIPT_${input.decision}`, 'script_version', version.id, { ...options, afterHash: input.target_sha256, reason: input.note || undefined });
  await emit(client, context, 'script_version', version.id, `SCRIPT_${input.decision}`, { project_id: projectId, version: versionNumber });
  return { version: versionNumber, status: input.decision, project_status: projectStatus };
}

const failModel = (db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, jobId: string, code: string, rejected: unknown[] = []) =>
  db.organizationTransaction(identity, organizationId, 'project:write', client => finishJob(client, jobId, 'DEAD', code, rejected));
async function runModel(db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, jobId: string, model: EditorialModel, prompt: Parameters<EditorialModel['complete']>[0]) {
  try { return await model.complete(prompt); }
  catch { await failModel(db, identity, organizationId, jobId, 'MODEL_ERROR'); throw new AppError('BLOCKED_EXTERNAL', 503); }
}
// Si otra persona guardó mientras el modelo respondía, el 409 llega aquí: el job no puede quedar RUNNING para siempre.
async function saveGenerated(db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, projectId: string, jobId: string, base: number, content: ScriptContent, origin: EditorialModel['origin'], options: Options) {
  try {
    return await db.organizationTransaction(identity, organizationId, 'project:write', async (client, context) => {
      const saved = await saveVersion(client, context, projectId, base, content, origin, options);
      await finishJob(client, jobId, 'SUCCEEDED', null);
      return { job_id: jobId, reused: false, rejected: [] as string[], ...saved };
    });
  } catch (error) { await failModel(db, identity, organizationId, jobId, 'SAVE_REJECTED'); throw error; }
}
export async function generateScript(db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, projectId: string, request: { idempotency_key: string; tone: string; target_seconds: number }, model: EditorialModel, options: Options = {}) {
  const input = { projectId, tone: request.tone, target_seconds: request.target_seconds };
  const reserved = await db.organizationTransaction(identity, organizationId, 'project:write', async (client, context) => {
    await requireProject(client, projectId, editable);
    const dossier = await approvedDossier(client, projectId);
    return { dossier, base: (await currentVersion(client, projectId))?.version ?? 0, job: await reserveJob(client, context, 'SCRIPT_GENERATION', request.idempotency_key, sha256({ ...input, dossier: dossier.sha256 }), projectId) };
  });
  if (!reserved.job.claimed) {
    if (reserved.job.status !== 'SUCCEEDED') throw new AppError('CONFLICT', 409);
    return { job_id: reserved.job.id, reused: true };
  }
  const raw = await runModel(db, identity, organizationId, reserved.job.id, model, scriptPrompt(reserved.dossier.content, request));
  const { content, rejected } = acceptScript(raw, reserved.dossier.content);
  if (!content) {
    await failModel(db, identity, organizationId, reserved.job.id, 'MODEL_OUTPUT_REJECTED', rejected);
    return { job_id: reserved.job.id, reused: false, rejected };
  }
  return saveGenerated(db, identity, organizationId, projectId, reserved.job.id, reserved.base, content, model.origin, options);
}
export async function regenerateSection(db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, projectId: string, sectionKey: string, request: { idempotency_key: string; base_version: number; instruction: string }, model: EditorialModel, options: Options = {}) {
  const { job, work } = await db.organizationTransaction(identity, organizationId, 'project:write', async (client, context) => {
    await requireProject(client, projectId, editable);
    // La reserva va primero: el reintento de algo ya hecho responde reused aunque la versión haya avanzado. Un 409 posterior revierte la reserva.
    const job = await reserveJob(client, context, 'SECTION_REGENERATION', request.idempotency_key, sha256({ sectionKey, ...request }), projectId);
    if (!job.claimed) return { job, work: null };
    const script = await currentVersion(client, projectId);
    if (!script) throw new AppError('NOT_FOUND', 404);
    if (script.version !== request.base_version) throw new AppError('CONFLICT', 409);
    const content = (await loadVersion(client, script.id, script.version)).content as ScriptContent;
    const section = content.sections.find(s => s.key === sectionKey);
    if (!section) throw new AppError('NOT_FOUND', 404);
    return { job, work: { content, section, dossier: await approvedDossier(client, projectId) } };
  });
  if (!work) {
    if (job.status !== 'SUCCEEDED') throw new AppError('CONFLICT', 409);
    return { job_id: job.id, reused: true };
  }
  const raw = await runModel(db, identity, organizationId, job.id, model, regenerationPrompt(work.section, work.dossier.content, request.instruction));
  const { result, rejected } = acceptRegeneration(raw, work.section);
  if (!result) {
    await failModel(db, identity, organizationId, job.id, 'MODEL_OUTPUT_REJECTED', rejected);
    return { job_id: job.id, reused: false, rejected };
  }
  const updated = scriptContentSchema.parse({ ...work.content, sections: work.content.sections.map(s => s.key === sectionKey ? { ...s, ...result } : s) });
  return saveGenerated(db, identity, organizationId, projectId, job.id, request.base_version, updated, model.origin, options);
}
