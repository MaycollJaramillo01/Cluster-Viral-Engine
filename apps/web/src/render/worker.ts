import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { AppError } from '@cluster/contracts';
import { bytesHash, objectKey, type ObjectStore } from '../media/objects';
import { mediaState } from '../media/store';
import { sha256 } from '../phase00/contract';
import { requireProject } from '../research/store';
import { emit } from '../server/audit';
import { assertRuntimeRole } from '../server/database';
import { buildManifest, renderManifestSchema, type RenderManifest } from './manifest';
import { artifactNames, buildPlan, type RenderPlan } from './plan';
import type { RenderProvider, StepMetric } from './provider';
import { evaluateOutput, type ProbeReport } from './qa';
import { leaveRendering } from './store';

type Claim = { job_id: string; organization_id: string; project_id: string; render_id: string; attempt: number; max_attempts: number };
export type WorkerDeps = { pool: Pool; store: ObjectStore; provider: RenderProvider; workerId: string; workRoot: string; threads?: number; leaseSeconds?: number; heartbeatMs?: number; pollMs?: number; log?: (event: Record<string, unknown>) => void };
export type Outcome = 'SUCCEEDED' | 'CANCELLED' | 'FAILED' | 'RETRY' | 'LEASE_LOST';
// Lo que no cambia al repetir no se reintenta: material alterado o una salida con defectos.
class RenderFailure extends Error {
  constructor(readonly code: string, readonly retryable: boolean, readonly detail: unknown = null) { super(code); }
}
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// El worker no es una persona: no hay membresía que comprobar. RLS sigue aplicando porque fija la organización y usa el rol de runtime.
async function tenant<T>(pool: Pool, organizationId: string, operation: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    await assertRuntimeRole(client);
    await client.query("SELECT set_config('app.organization_id',$1,true)", [organizationId]);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => { broken = true; });
    throw error;
  } finally { client.release(broken); }
}
const serviceAudit = (client: PoolClient, claim: Claim, action: string, afterHash: string | null = null, reason: string | null = null) => client.query(
  `INSERT INTO audit_events(organization_id,actor_service,action,entity_type,entity_id,after_hash,reason) VALUES($1,'render-worker',$2,'render',$3,$4,$5)`, [claim.organization_id, action, claim.render_id, afterHash, reason]);
const event = (client: PoolClient, claim: Claim, type: string, data: Record<string, unknown> = {}) => emit(client, { organizationId: claim.organization_id }, 'render', claim.render_id, type, { project_id: claim.project_id, ...data });
// Cada escritura exige seguir siendo dueño del intento: un worker que perdió el lease no puede pisar al que lo relevó.
const fenced = (client: PoolClient, claim: Claim, worker: string, set: string, values: unknown[] = []) => client.query(
  `UPDATE jobs SET ${set},updated_at=now() WHERE id=$1 AND locked_by=$2 AND attempt=$3 AND status='RUNNING' RETURNING id`, [claim.job_id, worker, claim.attempt, ...values]);

async function settleCancelled(client: PoolClient, claim: Claim, worker: string) {
  if (!(await fenced(client, claim, worker, `status='CANCELLED',lease_expires_at=NULL`)).rowCount) return 'LEASE_LOST' as const;
  await client.query(`UPDATE renders SET status='CANCELLED',finished_at=now() WHERE id=$1`, [claim.render_id]);
  await leaveRendering(client, claim.project_id, claim.render_id);
  await serviceAudit(client, claim, 'RENDER_CANCELLED');
  await event(client, claim, 'RENDER_CANCELLED');
  return 'CANCELLED' as const;
}
async function settleDead(client: PoolClient, claim: Claim, worker: string, code: string) {
  if (!(await fenced(client, claim, worker, `status='DEAD',last_error_code=$4,lease_expires_at=NULL`, [code])).rowCount) return 'LEASE_LOST' as const;
  await client.query(`UPDATE renders SET status='FAILED',error_code=$2,finished_at=now() WHERE id=$1`, [claim.render_id, code]);
  await leaveRendering(client, claim.project_id, claim.render_id);
  await serviceAudit(client, claim, 'RENDER_FAILED', null, code);
  await event(client, claim, 'RENDER_FAILED', { error_code: code });
  return 'FAILED' as const;
}
async function settleFailure(deps: WorkerDeps, claim: Claim, failure: RenderFailure): Promise<Outcome> {
  return tenant(deps.pool, claim.organization_id, async client => {
    await requireProject(client, claim.project_id);
    if (!failure.retryable || claim.attempt >= claim.max_attempts) return settleDead(client, claim, deps.workerId, failure.code);
    const wait = 2 ** claim.attempt * 15 + Math.random() * 10;
    if (!(await fenced(client, claim, deps.workerId, `status='RETRY_WAIT',last_error_code=$4,scheduled_at=now()+($5*interval '1 second'),lease_expires_at=NULL`, [failure.code, wait])).rowCount) return 'LEASE_LOST';
    await client.query(`UPDATE renders SET status='QUEUED',error_code=$2 WHERE id=$1`, [claim.render_id, failure.code]);
    return 'RETRY';
  });
}
async function materialize(plan: RenderPlan, store: ObjectStore, workdir: string) {
  await mkdir(path.join(workdir, 'inputs'), { recursive: true });
  for (const item of plan.inputs) {
    const bytes = await store.get(item.object_key);
    if (!bytes) throw new RenderFailure('INPUT_MISSING', false);
    if (bytesHash(bytes) !== item.content_sha256) throw new RenderFailure('INPUT_HASH_MISMATCH', false);
    await writeFile(path.join(workdir, item.name), bytes);
  }
  for (const [name, text] of Object.entries(plan.files)) await writeFile(path.join(workdir, name), text);
  await writeFile(path.join(workdir, 'plan.json'), JSON.stringify(plan));
}
// Renueva el lease mientras el proceso corre y ve desde aquí una cancelación pedida por la API. Detiene el proceso antes de devolver: Windows no borra archivos abiertos.
async function watch(deps: WorkerDeps, claim: Claim, leaseMs: number) {
  const { provider } = deps, heartbeatMs = deps.heartbeatMs ?? leaseMs / 3, pollMs = deps.pollMs ?? 500;
  let lastBeat = Date.now(), nextBeat = lastBeat + heartbeatMs, ending = null as 'LEASE_LOST' | 'CANCELLED' | null;
  const stop = async (reason: 'LEASE_LOST' | 'CANCELLED') => { ending = reason; await provider.cancel(claim.render_id); };
  for (;;) {
    const status = await provider.status(claim.render_id);
    if (status.state !== 'RUNNING') return ending ?? status;
    if (!ending && Date.now() >= nextBeat) {
      nextBeat = Date.now() + heartbeatMs;
      try {
        const beat = await tenant(deps.pool, claim.organization_id, async client => {
          const owned = await fenced(client, claim, deps.workerId, `lease_expires_at=now()+make_interval(secs => $4::double precision)`, [leaseMs / 1000]);
          return { owned: owned.rowCount === 1, cancel: (await client.query('SELECT cancel_requested_at FROM renders WHERE id=$1', [claim.render_id])).rows[0]?.cancel_requested_at };
        });
        lastBeat = Date.now();
        if (!beat.owned) await stop('LEASE_LOST');
        else if (beat.cancel) await stop('CANCELLED');
      } catch (error) {
        // Un corte breve de base no detiene el trabajo; sin lease vigente otro worker ya podría estar haciéndolo.
        if (Date.now() - lastBeat > leaseMs) await stop('LEASE_LOST');
        deps.log?.({ event: 'render.heartbeat_failed', render_id: claim.render_id, error: (error as Error).name });
      }
    }
    await delay(pollMs);
  }
}
async function isCurrent(client: PoolClient, claim: Claim, manifest: RenderManifest, hash: string) {
  try { return sha256(buildManifest(claim.organization_id, claim.project_id, await mediaState(client, claim.project_id), manifest.title)) === hash; }
  catch (error) { if (error instanceof AppError) return false; throw error; }
}
const discard = (deps: WorkerDeps, claim: Claim, keys: string[]) => Promise.all(keys.map(key => deps.store.remove(key))).catch(error => deps.log?.({ event: 'render.cleanup_failed', render_id: claim.render_id, error: (error as Error).name }));
async function collect(deps: WorkerDeps, claim: Claim, leaseMs: number, result: { manifest: RenderManifest; steps: StepMetric[]; wallMs: number; hash: string }, uploaded: string[]): Promise<Outcome> {
  const { manifest, steps, wallMs, hash } = result;
  const { provider, store } = deps, read = async (name: Parameters<RenderProvider['fetchArtifact']>[1]) => {
    const bytes = await provider.fetchArtifact(claim.render_id, name);
    if (!bytes) throw new RenderFailure('ARTIFACT_MISSING', true);
    return bytes;
  };
  // ponytail: artefactos en memoria (un master de 4 min ronda cientos de MB). Pasar a streams con Blob real.
  const master = await read(artifactNames.master);
  const qa = evaluateOutput({ probe: JSON.parse((await read(artifactNames.probe)).toString('utf8')) as ProbeReport, loudness: (await read(artifactNames.loudness)).toString('utf8'), master, expectedMs: manifest.total_ms });
  if (!qa.passed) throw new RenderFailure('QA_FAILED', false, qa.checks.filter(c => c.status === 'FAIL').map(c => c.check));
  // Claves propias de este intento: un worker que perdió el lease solo puede borrar lo suyo, aunque el relevo produzca los mismos bytes.
  const artifact = bytesHash(master), token = bytesHash(Buffer.from(`${claim.render_id}:${claim.attempt}:${artifact}`));
  const key = (suffix: string, extension: 'mp4' | 'jpg' | 'srt') => objectKey(claim.organization_id, claim.project_id, 'renders', `${token}-${suffix}`, extension);
  const keys = { master: key('master', 'mp4'), preview: key('preview', 'mp4'), poster: key('poster', 'jpg'), captions: key('captions', 'srt') };
  // Se anotan antes de subir: si este proceso cae a mitad, el siguiente intento sabe qué borrar. También renueva el lease para la subida.
  const noted = await tenant(deps.pool, claim.organization_id, async client => {
    await requireProject(client, claim.project_id);
    const owned = await fenced(client, claim, deps.workerId, `lease_expires_at=now()+make_interval(secs => $4::double precision)`, [leaseMs / 1000]);
    if (owned.rowCount) await client.query('UPDATE renders SET metrics=$2 WHERE id=$1', [claim.render_id, JSON.stringify({ pending_object_keys: Object.values(keys) })]);
    return owned.rowCount === 1;
  });
  if (!noted) return 'LEASE_LOST';
  uploaded.push(...Object.values(keys));
  await store.put(keys.master, master);
  await store.put(keys.preview, await read(artifactNames.preview));
  await store.put(keys.poster, await read(artifactNames.poster));
  await store.put(keys.captions, await read(artifactNames.captions));
  const usage = { steps, wall_ms: wallMs, cpu_ms: steps.reduce((sum, step) => sum + (step.cpu_ms ?? 0), 0), max_rss_kib: Math.max(0, ...steps.map(step => step.max_rss_kib ?? 0)), output_bytes: master.length, attempt: claim.attempt };
  const outcome = await tenant(deps.pool, claim.organization_id, async client => {
    const project = await requireProject(client, claim.project_id);
    const render = (await client.query('SELECT cancel_requested_at FROM renders WHERE id=$1 FOR UPDATE', [claim.render_id])).rows[0];
    if (render.cancel_requested_at) return settleCancelled(client, claim, deps.workerId);
    if (!(await fenced(client, claim, deps.workerId, `status='SUCCEEDED',last_error_code=NULL,lease_expires_at=NULL`)).rowCount) return 'LEASE_LOST' as const;
    // Si cambió el material mientras corría, el resultado queda guardado pero no entra en revisión.
    const current = await isCurrent(client, claim, manifest, hash);
    await client.query(`UPDATE renders SET status='SUCCEEDED',artifact_sha256=$2,output_object_key=$3,preview_object_key=$4,poster_object_key=$5,captions_object_key=$6,duration_ms=$7,provider=$8,qa=$9,metrics=$10,error_code=NULL,finished_at=now() WHERE id=$1`,
      [claim.render_id, artifact, keys.master, keys.preview, keys.poster, keys.captions, manifest.total_ms, provider.name, JSON.stringify(qa), JSON.stringify({ ...usage, stale: !current })]);
    if (current && project.status === 'RENDERING') await client.query(`UPDATE projects SET status='VIDEO_REVIEW',updated_at=now(),revision=revision+1 WHERE id=$1`, [claim.project_id]);
    else await leaveRendering(client, claim.project_id, claim.render_id);
    // ponytail: unidades sin precio; el coste de cómputo se asigna cuando exista un worker facturado.
    await client.query(`INSERT INTO provider_usage(organization_id,project_id,job_id,provider,operation,input_units,unit_name,estimated_cost_usd) VALUES($1,$2,$3,$4,'render',$5,'cpu_seconds',0)`, [claim.organization_id, claim.project_id, claim.job_id, provider.name, usage.cpu_ms / 1000]);
    await serviceAudit(client, claim, 'RENDER_SUCCEEDED', artifact);
    await event(client, claim, 'RENDER_SUCCEEDED', { artifact_sha256: artifact, stale: !current });
    return 'SUCCEEDED' as const;
  });
  // Sin este commit, nadie referencia lo subido en este intento.
  if (outcome !== 'SUCCEEDED') await discard(deps, claim, uploaded);
  return outcome;
}
async function run(deps: WorkerDeps, claim: Claim, leaseMs: number): Promise<Outcome> {
  const { provider, workerId } = deps;
  const opening = await tenant(deps.pool, claim.organization_id, async client => {
    const project = await client.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [claim.project_id]);
    const render = (await client.query('SELECT manifest,manifest_sha256,cancel_requested_at,metrics FROM renders WHERE id=$1 FOR UPDATE', [claim.render_id])).rows[0];
    // Bajo RLS un trabajo manipulado que apunte a otra organización no encuentra nada: muere aquí, sin reintentarse para siempre.
    if (!project.rowCount || !render) return { pending: [], settled: await settleDead(client, claim, workerId, 'RENDER_NOT_FOUND') };
    const pending = (render.metrics?.pending_object_keys ?? []) as string[];
    if (render.cancel_requested_at) return { pending, settled: await settleCancelled(client, claim, workerId) };
    // Solo llega aquí un intento de más si los anteriores murieron sin liquidar: es la cola de muertos.
    if (claim.attempt > claim.max_attempts) return { pending, settled: await settleDead(client, claim, workerId, 'LEASE_EXPIRED') };
    await client.query(`UPDATE renders SET status='RUNNING',provider=$2 WHERE id=$1`, [claim.render_id, provider.name]);
    await serviceAudit(client, claim, 'RENDER_STARTED', render.manifest_sha256);
    return { pending, render: render as { manifest: unknown; manifest_sha256: string } };
  });
  // Lo que dejó a medias un intento anterior que cayó.
  await discard(deps, claim, opening.pending);
  if (opening.settled) return opening.settled;
  const workdir = path.join(deps.workRoot, claim.render_id), started = Date.now(), uploaded: string[] = [];
  let submitted = false;
  try {
    const parsed = renderManifestSchema.safeParse(opening.render!.manifest);
    if (!parsed.success) throw new RenderFailure('MANIFEST_INVALID', false);
    const plan = buildPlan(parsed.data, { threads: deps.threads ?? 4 });
    await rm(workdir, { recursive: true, force: true });
    await materialize(plan, deps.store, workdir);
    await provider.submit({ id: claim.render_id, workdir, plan });
    submitted = true;
    const final = await watch(deps, claim, leaseMs);
    if (final === 'LEASE_LOST') return 'LEASE_LOST';
    if (final === 'CANCELLED' || final.state === 'CANCELLED') {
      return await tenant(deps.pool, claim.organization_id, async client => { await requireProject(client, claim.project_id); return settleCancelled(client, claim, workerId); });
    }
    if (final.state === 'FAILED') throw new RenderFailure(final.error_code, true, final.detail);
    return await collect(deps, claim, leaseMs, { manifest: parsed.data, steps: final.steps, wallMs: Date.now() - started, hash: opening.render!.manifest_sha256 }, uploaded);
  } catch (error) {
    const failure = error instanceof RenderFailure ? error : new RenderFailure('WORKER_ERROR', true, (error as Error).name);
    deps.log?.({ event: 'render.failed', render_id: claim.render_id, attempt: claim.attempt, code: failure.code, detail: failure.detail });
    if (submitted) await provider.cancel(claim.render_id).catch(() => undefined);
    // Si tampoco se puede liquidar, el lease vence y otro intento lo recoge: el trabajo no se pierde y borra lo anotado.
    const settled = await settleFailure(deps, claim, failure).catch(() => 'LEASE_LOST' as const);
    if (settled === 'RETRY' || settled === 'FAILED') await discard(deps, claim, uploaded);
    return settled;
  } finally { await rm(workdir, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined); }
}
export async function processNext(deps: WorkerDeps): Promise<{ render_id: string; outcome: Outcome } | null> {
  const leaseSeconds = deps.leaseSeconds ?? 120;
  const claim = (await deps.pool.query('SELECT * FROM claim_render_job($1,$2)', [deps.workerId, leaseSeconds])).rows[0] as Claim | undefined;
  if (!claim) return null;
  const outcome = await run(deps, claim, leaseSeconds * 1000);
  deps.log?.({ event: 'render.processed', render_id: claim.render_id, job_id: claim.job_id, attempt: claim.attempt, outcome });
  return { render_id: claim.render_id, outcome };
}
export async function runWorker(deps: WorkerDeps, signal: AbortSignal, options: { idleMs?: number; once?: boolean } = {}) {
  while (!signal.aborted) {
    const done = await processNext(deps).catch(error => { deps.log?.({ event: 'render.claim_failed', error: (error as Error).name }); return null; });
    if (!done && options.once) return;
    if (!done) await delay(options.idleMs ?? 2000);
  }
}
