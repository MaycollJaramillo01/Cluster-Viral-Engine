import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, type OrganizationContext } from '@cluster/contracts';
import { signedObjectUrl } from '../media/objects';
import { mediaState, spendSummary } from '../media/store';
import { sha256 } from '../phase00/contract';
import { requireProject } from '../research/store';
import { audit, emit } from '../server/audit';
import { buildManifest } from './manifest';

type Client = PoolClient;
type Context = OrganizationContext;
type Options = { requestId?: string };
export const renderInput = z.strictObject({ title_index: z.int().min(0).max(9).nullable().default(null) });

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
