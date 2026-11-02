import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, type OrganizationContext } from '@cluster/contracts';
import { signedObjectUrl } from '../media/objects';
import { mediaState, spendSummary } from '../media/store';
import { sha256 } from '../phase00/contract';
import { requireProject } from '../research/store';
import type { ScriptContent, ScriptDecision } from '../scripts/contract';
import { evaluateScript } from '../scripts/policy';
import { approvedDossier } from '../scripts/store';
import { audit, emit } from '../server/audit';
import { buildManifest, type RenderManifest } from './manifest';
import type { evaluateOutput } from './qa';

type Client = PoolClient;
type Context = OrganizationContext;
type Options = { requestId?: string };
type ReviewedRender = { manifest: RenderManifest; manifest_sha256: string; artifact_sha256: string | null; provider: string | null; qa: ReturnType<typeof evaluateOutput> | null };
export const renderInput = z.strictObject({ title_index: z.int().min(0).max(9).nullable().default(null) });
const reviewStages: readonly string[] = ['VIDEO_REVIEW', 'APPROVED'];

// Otro render puede seguir activo si se pidió uno nuevo con otro material: entonces el proyecto sigue en RENDERING.
export const leaveRendering = (client: Client, projectId: string, renderId: string) => client.query(`UPDATE projects SET status='ASSETING',updated_at=now(),revision=revision+1 WHERE id=$1 AND status='RENDERING'
  AND NOT EXISTS (SELECT 1 FROM renders WHERE project_id=$1 AND id<>$2 AND status IN ('QUEUED','RUNNING'))`, [projectId, renderId]);
const setProjectStatus = (client: Client, projectId: string, status: string) => client.query('UPDATE projects SET status=$1,updated_at=now(),revision=revision+1 WHERE id=$2 AND status<>$1', [status, projectId]);

export async function requestRender(client: Client, context: Context, projectId: string, input: z.infer<typeof renderInput>, options: Options = {}) {
  // El candado del proyecto serializa peticiones: dos iguales a la vez no crean dos renders.
  await requireProject(client, projectId, ['ASSETING', 'RENDERING', 'VIDEO_REVIEW']);
  if ((await spendSummary(client, context.organizationId)).hard_limit_reached) throw new AppError('BLOCKED_BY_POLICY', 409);
  const media = await mediaState(client, projectId);
  const version = (await client.query(`SELECT v.id,v.title_options FROM script_versions v JOIN scripts s ON s.id=v.script_id WHERE s.project_id=$1 AND v.status='APPROVED'`, [projectId])).rows[0] as { id: string; title_options: string[] };
  const title = input.title_index === null ? null : version.title_options[input.title_index] ?? null;
  if (input.title_index !== null && !title) throw new AppError('INVALID_INPUT', 400);
  const manifest = buildManifest(context.organizationId, projectId, media, title), hash = sha256(manifest);
  const found = await client.query('SELECT id,status,job_id FROM renders WHERE project_id=$1 AND manifest_sha256=$2 FOR UPDATE', [projectId, hash]);
  const existing = found.rows[0] as { id: string; status: string; job_id: string } | undefined;
  if (existing?.status === 'SUCCEEDED') {
    await setProjectStatus(client, projectId, 'VIDEO_REVIEW');
    return { id: existing.id, status: existing.status, manifest_sha256: hash, created: false };
  }
  let renderId = existing?.id ?? randomUUID(), created = false;
  if (!existing) {
    const job = await client.query(`INSERT INTO jobs(organization_id,project_id,job_type,idempotency_key,payload,status,attempt) VALUES($1,$2,'RENDER',$3,$4,'QUEUED',0) RETURNING id`,
      [context.organizationId, projectId, hash, JSON.stringify({ input_sha256: hash, render_id: renderId })]);
    await client.query('INSERT INTO renders(id,organization_id,project_id,script_version_id,manifest_sha256,manifest,job_id,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [renderId, context.organizationId, projectId, version.id, hash, JSON.stringify(manifest), job.rows[0].id, context.actorId]);
    created = true;
  } else if (existing.status === 'FAILED' || existing.status === 'CANCELLED') {
    await client.query(`UPDATE jobs SET status='QUEUED',attempt=0,scheduled_at=now(),last_error_code=NULL,locked_by=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1`, [existing.job_id]);
    await client.query(`UPDATE renders SET status='QUEUED',error_code=NULL,cancel_requested_at=NULL,finished_at=NULL WHERE id=$1`, [renderId]);
    created = true;
  } else {
    // Se vuelve a querer este material: anula una cancelación que el worker aún no vio.
    await client.query('UPDATE renders SET cancel_requested_at=NULL WHERE id=$1 AND cancel_requested_at IS NOT NULL', [renderId]);
  }
  renderId = existing?.id ?? renderId;
  // Lo que siga en cola con material anterior ya no sirve: el worker lo cancela al verlo.
  await client.query(`UPDATE renders SET cancel_requested_at=now() WHERE project_id=$1 AND id<>$2 AND status IN ('QUEUED','RUNNING') AND cancel_requested_at IS NULL`, [projectId, renderId]);
  await setProjectStatus(client, projectId, 'RENDERING');
  if (created) {
    await audit(client, context, 'RENDER_REQUESTED', 'render', renderId, { ...options, afterHash: hash });
    await emit(client, context, 'render', renderId, 'RENDER_REQUESTED', { project_id: projectId, manifest_sha256: hash });
  }
  return { id: renderId, status: created ? 'QUEUED' : existing!.status, manifest_sha256: hash, created };
}
const listed = `r.id,r.manifest_sha256,r.artifact_sha256,r.status,r.provider,r.duration_ms,r.error_code,r.qa,r.metrics,r.cancel_requested_at,r.created_at,r.finished_at,j.status AS job_status,j.attempt,j.max_attempts,j.scheduled_at`;
export async function listRenders(client: Client, projectId: string, limit: number) {
  return { renders: (await client.query(`SELECT ${listed} FROM renders r JOIN jobs j ON j.id=r.job_id WHERE r.project_id=$1 ORDER BY r.created_at DESC LIMIT $2`, [projectId, limit])).rows };
}
export async function readRender(client: Client, projectId: string, renderId: string) {
  const row = await client.query(`SELECT ${listed},r.manifest FROM renders r JOIN jobs j ON j.id=r.job_id WHERE r.id=$1 AND r.project_id=$2`, [renderId, projectId]);
  if (!row.rowCount) throw new AppError('NOT_FOUND', 404);
  return row.rows[0];
}
// Quien pueda leer la organización obtiene URL que caducan en minutos; un render sin terminar no tiene nada que descargar.
export async function renderUrls(client: Client, projectId: string, renderId: string, secret: string) {
  const row = await client.query('SELECT status,output_object_key,preview_object_key,poster_object_key,captions_object_key FROM renders WHERE id=$1 AND project_id=$2', [renderId, projectId]);
  if (!row.rowCount) throw new AppError('NOT_FOUND', 404);
  const render = row.rows[0];
  if (render.status !== 'SUCCEEDED') throw new AppError('CONFLICT', 409);
  return { master: signedObjectUrl(secret, render.output_object_key), preview: signedObjectUrl(secret, render.preview_object_key), poster: signedObjectUrl(secret, render.poster_object_key), captions: signedObjectUrl(secret, render.captions_object_key) };
}
export async function cancelRender(client: Client, context: Context, projectId: string, renderId: string, options: Options = {}) {
  await requireProject(client, projectId);
  const row = await client.query('SELECT r.status,r.job_id,j.status AS job_status FROM renders r JOIN jobs j ON j.id=r.job_id WHERE r.id=$1 AND r.project_id=$2 FOR UPDATE OF r,j', [renderId, projectId]);
  if (!row.rowCount) throw new AppError('NOT_FOUND', 404);
  const render = row.rows[0] as { status: string; job_id: string; job_status: string };
  if (render.status !== 'QUEUED' && render.status !== 'RUNNING') throw new AppError('CONFLICT', 409);
  let status = 'CANCELLED';
  if (render.job_status === 'RUNNING') {
    // Hay un worker con el lease: lo ve en su latido, detiene el proceso y limpia.
    await client.query('UPDATE renders SET cancel_requested_at=now() WHERE id=$1', [renderId]);
    status = 'CANCELLING';
  } else {
    await client.query(`UPDATE jobs SET status='CANCELLED',updated_at=now() WHERE id=$1`, [render.job_id]);
    await client.query(`UPDATE renders SET status='CANCELLED',finished_at=now() WHERE id=$1`, [renderId]);
    await leaveRendering(client, projectId, renderId);
    await emit(client, context, 'render', renderId, 'RENDER_CANCELLED', { project_id: projectId });
  }
  await audit(client, context, 'RENDER_CANCEL_REQUESTED', 'render', renderId, options);
  return { id: renderId, status };
}

// Todo lo que debe ser cierto para aprobar, releído en esta transacción. Publicar tendrá que repetirlo y rehashear los bytes: una licencia puede vencer después.
async function renderGate(client: Client, context: Context, projectId: string, render: ReviewedRender) {
  const media = await mediaState(client, projectId), dossier = await approvedDossier(client, projectId);
  const script = (await client.query(`SELECT v.content,v.dossier_sha256 FROM script_versions v JOIN scripts s ON s.id=v.script_id WHERE s.project_id=$1 AND v.status='APPROVED'`, [projectId])).rows[0] as { content: ScriptContent; dossier_sha256: string };
  const blockers: { code: string }[] = [...media.state.blockers, ...evaluateScript(script.content, dossier.content).blockers];
  if (script.dossier_sha256 !== dossier.sha256) blockers.push({ code: 'DOSSIER_CHANGED' });
  // El doble de pruebas produce bytes sin valor editorial: nunca se aprueba.
  if (render.provider === 'fake') blockers.push({ code: 'RENDER_PROVIDER_FAKE' });
  if (!render.qa?.passed) blockers.push({ code: 'RENDER_QA_FAILED' });
  // Sin bloqueos de material, el manifest se reconstruye: otro hash significa que este render ya no es el del material vigente.
  if (!media.state.blockers.length && sha256(buildManifest(context.organizationId, projectId, media, render.manifest.title)) !== render.manifest_sha256) blockers.push({ code: 'RENDER_STALE' });
  return { blockers, media, dossier };
}
const latestDecision = async (client: Client, projectId: string) => (await client.query(`SELECT render_id FROM approvals WHERE project_id=$1 AND approval_type='RENDER' ORDER BY decided_at DESC,id DESC LIMIT 1`, [projectId])).rows[0] as { render_id: string } | undefined;
// Decide sobre los bytes exactos y reevalúa dentro de esta transacción; nunca confía en un approved=true del cliente. Aprobar no publica nada.
export async function decideRender(client: Client, context: Context, projectId: string, renderId: string, input: ScriptDecision, options: Options = {}) {
  const project = await requireProject(client, projectId, reviewStages);
  const render = (await client.query('SELECT manifest,manifest_sha256,artifact_sha256,provider,qa FROM renders WHERE id=$1 AND project_id=$2 FOR UPDATE', [renderId, projectId])).rows[0] as ReviewedRender | undefined;
  if (!render) throw new AppError('NOT_FOUND', 404);
  if (render.artifact_sha256 !== input.target_sha256) throw new AppError('CONFLICT', 409);
  // Se puede retirar la aprobación vigente, no repetirla.
  if (project.status === 'APPROVED' && (input.decision === 'APPROVED' || (await latestDecision(client, projectId))?.render_id !== renderId)) throw new AppError('CONFLICT', 409);
  if (input.decision === 'APPROVED' && (await renderGate(client, context, projectId, render)).blockers.length) throw new AppError('BLOCKED_BY_POLICY', 409);
  // clock_timestamp bajo el candado del proyecto: el orden de las filas es el orden real de las decisiones.
  const row = await client.query(`INSERT INTO approvals(organization_id,project_id,render_id,target_sha256,approval_type,decision,decided_by,note,decided_at) VALUES($1,$2,$3,$4,'RENDER',$5,$6,$7,clock_timestamp()) RETURNING decided_at`,
    [context.organizationId, projectId, renderId, input.target_sha256, input.decision, context.actorId, input.note || null]);
  const projectStatus = input.decision === 'APPROVED' ? 'APPROVED' : 'ASSETING';
  await setProjectStatus(client, projectId, projectStatus);
  await audit(client, context, `RENDER_${input.decision}`, 'render', renderId, { ...options, afterHash: input.target_sha256, reason: input.note || undefined });
  await emit(client, context, 'render', renderId, `RENDER_${input.decision}`, { project_id: projectId, artifact_sha256: input.target_sha256 });
  return { id: renderId, decision: input.decision, target_sha256: input.target_sha256, decided_by: context.actorId, decided_at: row.rows[0].decided_at as Date, project_status: projectStatus };
}
// Lo que el revisor debe tener delante antes de decidir: video, fuentes y claims citados, derechos, coste y por qué no se podría aprobar.
export async function reviewRender(client: Client, context: Context, projectId: string, renderId: string, secret: string) {
  const project = (await client.query('SELECT status FROM projects WHERE id=$1', [projectId])).rows[0] as { status: string } | undefined;
  if (!project) throw new AppError('NOT_FOUND', 404);
  if (!reviewStages.includes(project.status)) throw new AppError('CONFLICT', 409);
  const render = await readRender(client, projectId, renderId), urls = await renderUrls(client, projectId, renderId, secret);
  const { blockers, media, dossier } = await renderGate(client, context, projectId, render);
  const cited = new Set((render.manifest as RenderManifest).scenes.flatMap(scene => scene.claim_ids)), claims = dossier.content.claims.filter(claim => cited.has(claim.id));
  const sourceIds = new Set(claims.flatMap(claim => claim.evidence.map(item => item.source_id)));
  const usage = await client.query(`SELECT provider,operation,unit_name,sum(input_units)::float8 AS units,sum(COALESCE(actual_cost_usd,estimated_cost_usd))::float8 AS cost_usd FROM provider_usage WHERE project_id=$1 GROUP BY provider,operation,unit_name ORDER BY provider,operation,unit_name`, [projectId]);
  const decisions = await client.query('SELECT decision,target_sha256,decided_by,decided_at,note FROM approvals WHERE render_id=$1 ORDER BY decided_at DESC,id DESC', [renderId]);
  return { render, urls, project_status: project.status, approved: project.status === 'APPROVED' && (await latestDecision(client, projectId))?.render_id === renderId,
    blockers, warnings: media.state.warnings, needs_human: render.qa?.needs_human ?? [], claims, sources: dossier.content.sources.filter(source => sourceIds.has(source.id)), rights: [...media.assets.values()], usage: usage.rows, decisions: decisions.rows };
}
