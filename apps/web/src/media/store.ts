import type { PoolClient } from 'pg';
import { AppError, type OrganizationContext, type VerifiedIdentity } from '@cluster/contracts';
import { sha256 } from '../phase00/contract';
import { ttsCacheKey } from '../phase00/providers';
import { finishJob, requireProject, reserveJob } from '../research/store';
import type { ScenePlan, ScriptDecision } from '../scripts/contract';
import { audit, emit } from '../server/audit';
import type { TenantDatabase } from '../server/database';
import type { AssetMetadata, LicenseInput, VoiceInput, VoiceTarget } from './contract';
import { assertPurpose, bytesHash, contentTypeOf, inspectFile, objectKey, signedObjectUrl, type ObjectStore } from './objects';
import { assetIssues, evaluateMedia, type AssetRow, type LicenseRow, type VoiceRow } from './policy';
import { TtsError, type SpendLimits, type TtsErrorCode, type TtsProvider, type TtsResult } from './tts';

type Client = PoolClient;
type Context = OrganizationContext;
type Options = { requestId?: string };
// El material se reúne desde la investigación; escenas y voz exigen guion aprobado para no gastar sobre texto sin revisar.
const assetStages = ['RESEARCHING', 'RESEARCH_REVIEW', 'SCRIPTING', 'SCRIPT_REVIEW', 'ASSETING', 'VOICING', 'RENDERING', 'VIDEO_REVIEW'] as const;
const mediaStages = ['ASSETING', 'VOICING', 'RENDERING', 'VIDEO_REVIEW'] as const;
const usdFor = (characters: number, provider: Pick<TtsProvider, 'usdPer1kChars'>) => characters / 1000 * provider.usdPer1kChars;
const settingsHash = (target: VoiceTarget) => sha256({ settings: target.settings, locale: 'es-419' });

// ponytail: VOICING no se usa; voz y material se trabajan a la vez en ASSETING. Un render o revisión en curso deja de valer al cambiar el material.
const backToAssets = (client: Client, projectId: string) => client.query(`UPDATE projects SET status='ASSETING',updated_at=now(),revision=revision+1 WHERE id=$1 AND status IN ('RENDERING','VIDEO_REVIEW')`, [projectId]);
async function assetChanged(client: Client, projectId: string, assetId: string) {
  const used = await client.query('SELECT 1 FROM scene_media WHERE project_id=$1 AND visual_asset_id=$2 UNION ALL SELECT 1 FROM project_music WHERE project_id=$1 AND asset_id=$2 LIMIT 1', [projectId, assetId]);
  if (used.rowCount) await backToAssets(client, projectId);
}

export async function spendSummary(client: Client, organizationId: string) {
  const row = (await client.query(`SELECT o.monthly_budget_usd::float8 AS budget_usd,
    (SELECT COALESCE(sum(COALESCE(actual_cost_usd,estimated_cost_usd)),0) FROM provider_usage WHERE created_at>=date_trunc('month',now()))::float8 AS spent_usd
    FROM organizations o WHERE o.id=$1`, [organizationId])).rows[0] as { budget_usd: number; spent_usd: number };
  return { ...row, remaining_usd: row.budget_usd - row.spent_usd, soft_limit_reached: row.spent_usd >= row.budget_usd * 0.8, hard_limit_reached: row.spent_usd >= row.budget_usd };
}
export async function usageReport(client: Client, organizationId: string) {
  const rows = await client.query(`SELECT id,project_id,job_id,provider,operation,input_units::float8,output_units::float8,unit_name,estimated_cost_usd::float8,actual_cost_usd::float8,provider_request_id,created_at FROM provider_usage ORDER BY created_at DESC LIMIT 100`);
  return { ...await spendSummary(client, organizationId), rows: rows.rows };
}
// El candado por organización serializa la comprobación: dos peticiones simultáneas no pueden sumar más que el tope.
// Lo sin liquidar cuenta por su estimación, así que un fallo ambiguo sigue consumiendo presupuesto hasta conciliarlo.
async function reserveSpend(client: Client, context: Context, input: { projectId: string; jobId: string | null; provider: string; operation: string; units: number; unitName: string; estimatedUsd: number; actualUsd?: number }, limits: SpendLimits) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`spend:${context.organizationId}`]);
  const month = await spendSummary(client, context.organizationId);
  const project = (await client.query(`SELECT COALESCE(sum(COALESCE(actual_cost_usd,estimated_cost_usd)),0)::float8 AS spent FROM provider_usage WHERE project_id=$1`, [input.projectId])).rows[0].spent as number;
  if (input.estimatedUsd > 0 && (month.spent_usd + input.estimatedUsd > month.budget_usd || project + input.estimatedUsd > limits.maxUsdPerVideo)) throw new AppError('BLOCKED_BY_POLICY', 409);
  const row = await client.query(`INSERT INTO provider_usage(organization_id,project_id,job_id,provider,operation,input_units,unit_name,estimated_cost_usd,actual_cost_usd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [context.organizationId, input.projectId, input.jobId, input.provider, input.operation, input.units, input.unitName, input.estimatedUsd, input.actualUsd ?? null]);
  const soft = month.budget_usd * 0.8;
  if (month.spent_usd < soft && month.spent_usd + input.estimatedUsd >= soft) await emit(client, context, 'organization', context.organizationId, 'BUDGET_SOFT_LIMIT_REACHED', { budget_usd: month.budget_usd });
  return row.rows[0].id as string;
}

export async function uploadAsset(db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, projectId: string, metadata: AssetMetadata, bytes: Uint8Array, store: ObjectStore, limits: SpendLimits, options: Options = {}) {
  // Se autoriza antes de escribir bytes y otra vez al registrar: el objeto es direccionable por contenido y un huérfano no se publica.
  await db.organizationTransaction(identity, organizationId, 'project:write', client => requireProject(client, projectId, assetStages));
  const file = inspectFile(bytes);
  assertPurpose(metadata.purpose, file.kind);
  const hash = bytesHash(bytes), key = objectKey(organizationId, projectId, 'assets', hash, file.extension);
  await store.put(key, bytes);
  return db.organizationTransaction(identity, organizationId, 'project:write', async (client, context) => {
    await requireProject(client, projectId, assetStages);
    const created = await client.query(`INSERT INTO assets(organization_id,project_id,kind,object_key,original_source_url,content_sha256,size_bytes,mime_type,is_ai_generated,name,purpose,source_name,alt_text,width,height,duration_ms,ai_label,ai_prompt,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT (organization_id,project_id,content_sha256) DO NOTHING RETURNING *`,
      [organizationId, projectId, file.kind, key, metadata.original_source_url, hash, bytes.length, contentTypeOf(key), metadata.is_ai_generated, metadata.name, metadata.purpose, metadata.source_name, metadata.alt_text,
        file.width, file.height, metadata.duration_ms, metadata.ai_label, metadata.ai_prompt, context.actorId]);
    if (!created.rowCount) return { ...(await client.query('SELECT * FROM assets WHERE project_id=$1 AND content_sha256=$2', [projectId, hash])).rows[0], created: false };
    if (metadata.is_ai_generated && metadata.ai_cost_usd > 0) await reserveSpend(client, context, { projectId, jobId: null, provider: metadata.ai_provider!, operation: 'image.generate', units: 1, unitName: 'images', estimatedUsd: metadata.ai_cost_usd, actualUsd: metadata.ai_cost_usd }, limits);
    await audit(client, context, 'ASSET_UPLOADED', 'asset', created.rows[0].id, { ...options, afterHash: hash });
    return { ...created.rows[0], created: true };
  });
}
const loadLicenses = async (client: Client, assetIds: string[]) => (await client.query('SELECT * FROM asset_licenses WHERE asset_id=ANY($1::uuid[]) ORDER BY created_at,id', [assetIds])).rows as (LicenseRow & { asset_id: string })[];
async function requireAsset(client: Client, projectId: string, assetId: string, lock = false) {
  const row = await client.query(`SELECT * FROM assets WHERE id=$1 AND project_id=$2${lock ? ' FOR UPDATE' : ''}`, [assetId, projectId]);
  if (!row.rowCount) throw new AppError('NOT_FOUND', 404);
  return row.rows[0];
}
export async function listAssets(client: Client, projectId: string, filters: { purpose?: string; approval_status?: string; limit: number }) {
  const rows = await client.query(`SELECT a.*,EXISTS(SELECT 1 FROM asset_licenses l WHERE l.asset_id=a.id) AS has_license,ARRAY(SELECT m.scene_key FROM scene_media m WHERE m.visual_asset_id=a.id) AS scene_keys FROM assets a WHERE a.project_id=$1 AND ($2::text IS NULL OR a.purpose=$2) AND ($3::text IS NULL OR a.approval_status=$3) ORDER BY a.created_at DESC LIMIT $4`,
    [projectId, filters.purpose ?? null, filters.approval_status ?? null, filters.limit]);
  return { assets: rows.rows };
}
export async function readAsset(client: Client, projectId: string, assetId: string) {
  const asset = await requireAsset(client, projectId, assetId), licenses = await loadLicenses(client, [assetId]);
  return { ...asset, licenses, issues: assetIssues(asset, licenses) };
}
export async function assetUrl(client: Client, projectId: string, assetId: string, secret: string) {
  return signedObjectUrl(secret, (await requireAsset(client, projectId, assetId)).object_key);
}
// Una licencia nueva cambia los derechos: la aprobación anterior deja de valer.
export async function addLicense(client: Client, context: Context, projectId: string, assetId: string, input: LicenseInput, options: Options = {}) {
  await requireProject(client, projectId, assetStages);
  await requireAsset(client, projectId, assetId, true);
  let proofKey: string | null = null;
  if (input.proof_asset_id) {
    const proof = await client.query(`SELECT object_key FROM assets WHERE id=$1 AND project_id=$2 AND purpose='PROOF'`, [input.proof_asset_id, projectId]);
    if (!proof.rowCount) throw new AppError('INVALID_INPUT', 400);
    proofKey = proof.rows[0].object_key;
  }
  const row = await client.query(`INSERT INTO asset_licenses(organization_id,asset_id,license_name,license_url,attribution_required,attribution_text,commercial_use_allowed,proof_object_key,expires_at,author,allowed_use,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [context.organizationId, assetId, input.license_name, input.license_url, input.attribution_required, input.attribution_text, input.commercial_use_allowed, proofKey, input.expires_at, input.author, input.allowed_use, context.actorId]);
  await client.query(`UPDATE assets SET approval_status='PENDING',reviewed_by=NULL,reviewed_at=NULL,review_note=NULL WHERE id=$1`, [assetId]);
  await audit(client, context, 'ASSET_LICENSE_ADDED', 'asset', assetId, options);
  await assetChanged(client, projectId, assetId);
  return row.rows[0];
}
export async function decideAsset(client: Client, context: Context, projectId: string, assetId: string, input: ScriptDecision, options: Options = {}) {
  await requireProject(client, projectId);
  const asset = await requireAsset(client, projectId, assetId, true);
  // Se puede retirar una aprobación, no repetirla. Un rechazo se reabre registrando otra licencia.
  if (asset.content_sha256 !== input.target_sha256 || asset.approval_status === 'REJECTED' || asset.approval_status === input.decision) throw new AppError('CONFLICT', 409);
  if (input.decision === 'APPROVED' && assetIssues(asset, await loadLicenses(client, [assetId])).length) throw new AppError('BLOCKED_BY_POLICY', 409);
  await client.query('UPDATE assets SET approval_status=$1,reviewed_by=$2,reviewed_at=now(),review_note=$3 WHERE id=$4', [input.decision, context.actorId, input.note || null, assetId]);
  if (input.decision === 'APPROVED') await client.query('UPDATE asset_licenses SET reviewed_by=$1,reviewed_at=now() WHERE asset_id=$2 AND reviewed_at IS NULL', [context.actorId, assetId]);
  else await assetChanged(client, projectId, assetId);
  await audit(client, context, `ASSET_${input.decision}`, 'asset', assetId, { ...options, afterHash: input.target_sha256, reason: input.note || undefined });
  await emit(client, context, 'asset', assetId, `ASSET_${input.decision}`, { project_id: projectId });
  return { id: assetId, approval_status: input.decision };
}

export async function approvedScenes(client: Client, projectId: string) {
  const version = await client.query(`SELECT v.id,v.version,v.content_sha256 FROM script_versions v JOIN scripts s ON s.id=v.script_id WHERE s.project_id=$1 AND v.status='APPROVED'`, [projectId]);
  if (!version.rowCount) throw new AppError('CONFLICT', 409);
  const scenes = await client.query('SELECT manifest FROM scenes WHERE script_version_id=$1 ORDER BY ordinal', [version.rows[0].id]);
  return { script_version_id: version.rows[0].id as string, script_version: version.rows[0].version as number, script_sha256: version.rows[0].content_sha256 as string, scenes: scenes.rows.map(r => r.manifest as ScenePlan) };
}
export async function assignVisual(client: Client, context: Context, projectId: string, sceneKey: string, assetId: string, options: Options = {}) {
  await requireProject(client, projectId, mediaStages);
  if (!(await approvedScenes(client, projectId)).scenes.some(s => s.key === sceneKey)) throw new AppError('NOT_FOUND', 404);
  if ((await requireAsset(client, projectId, assetId)).purpose !== 'VISUAL') throw new AppError('INVALID_INPUT', 400);
  const row = await client.query(`INSERT INTO scene_media(organization_id,project_id,scene_key,visual_asset_id) VALUES($1,$2,$3,$4)
    ON CONFLICT (organization_id,project_id,scene_key) DO UPDATE SET visual_asset_id=EXCLUDED.visual_asset_id,updated_at=now() RETURNING id,scene_key,visual_asset_id,voice_generation_id`, [context.organizationId, projectId, sceneKey, assetId]);
  await audit(client, context, 'SCENE_VISUAL_ASSIGNED', 'scene_media', row.rows[0].id, options);
  await backToAssets(client, projectId);
  return row.rows[0];
}
export async function assignMusic(client: Client, context: Context, projectId: string, assetId: string | null, options: Options = {}) {
  await requireProject(client, projectId, mediaStages);
  if (assetId) {
    if ((await requireAsset(client, projectId, assetId)).purpose !== 'MUSIC') throw new AppError('INVALID_INPUT', 400);
    await client.query(`INSERT INTO project_music(organization_id,project_id,asset_id) VALUES($1,$2,$3) ON CONFLICT (organization_id,project_id) DO UPDATE SET asset_id=EXCLUDED.asset_id`, [context.organizationId, projectId, assetId]);
  } else await client.query('DELETE FROM project_music WHERE project_id=$1', [projectId]);
  await audit(client, context, assetId ? 'PROJECT_MUSIC_ASSIGNED' : 'PROJECT_MUSIC_REMOVED', 'project', projectId, options);
  await backToAssets(client, projectId);
  return { project_id: projectId, asset_id: assetId };
}
export async function mediaState(client: Client, projectId: string, now = new Date()) {
  const version = await approvedScenes(client, projectId);
  const linked = (await client.query('SELECT scene_key,visual_asset_id,voice_generation_id FROM scene_media WHERE project_id=$1', [projectId])).rows as { scene_key: string; visual_asset_id: string | null; voice_generation_id: string | null }[];
  const music = (await client.query('SELECT asset_id FROM project_music WHERE project_id=$1', [projectId])).rows[0]?.asset_id as string | undefined;
  const assetIds = [...linked.flatMap(l => l.visual_asset_id ?? []), ...(music ? [music] : [])];
  const assets = (await client.query('SELECT * FROM assets WHERE id=ANY($1::uuid[])', [assetIds])).rows as AssetRow[];
  const licenses = await loadLicenses(client, assetIds);
  const licensed = new Map(assets.map(a => [a.id, { ...a, licenses: licenses.filter(l => l.asset_id === a.id) }]));
  const voices = new Map(((await client.query('SELECT id,object_key,content_sha256,text_sha256,duration_ms,timing_source,alignment FROM voice_generations WHERE id=ANY($1::uuid[])', [linked.flatMap(l => l.voice_generation_id ?? [])])).rows as VoiceRow[]).map(v => [v.id, v]));
  const visualByScene = new Map(linked.flatMap(l => l.visual_asset_id ? [[l.scene_key, licensed.get(l.visual_asset_id)!] as const] : []));
  const voiceByScene = new Map(linked.flatMap(l => l.voice_generation_id ? [[l.scene_key, voices.get(l.voice_generation_id)!] as const] : []));
  const { cues, overlays, ...result } = evaluateMedia({ scenes: version.scenes, visuals: visualByScene, voices: voiceByScene, music: music ? licensed.get(music)! : null, now });
  return { state: { script_version: version.script_version, script_sha256: version.script_sha256, music_asset_id: music ?? null, ...result }, assets: licensed, voices, timed: { cues, overlays } };
}
export const readMedia = async (client: Client, projectId: string) => (await mediaState(client, projectId)).state;

export async function estimateVoice(client: Client, organizationId: string, projectId: string, target: VoiceTarget, provider: TtsProvider, limits: SpendLimits) {
  await requireProject(client, projectId, mediaStages);
  const { scenes } = await approvedScenes(client, projectId);
  const cached = new Set((await client.query('SELECT text_sha256 FROM voice_generations WHERE provider=$1 AND voice_id=$2 AND model_id=$3 AND settings_sha256=$4', [provider.name, target.voice_id, target.model_id, settingsHash(target)])).rows.map(r => r.text_sha256 as string));
  const pending = scenes.filter(s => !cached.has(sha256(s.narration))), characters = pending.reduce((sum, s) => sum + s.narration.length, 0), estimated_usd = usdFor(characters, provider);
  const month = await spendSummary(client, organizationId);
  const project = (await client.query('SELECT COALESCE(sum(COALESCE(actual_cost_usd,estimated_cost_usd)),0)::float8 AS spent FROM provider_usage WHERE project_id=$1', [projectId])).rows[0].spent as number;
  return { is_estimate: true, provider: provider.name, scenes: scenes.length, cached: scenes.length - pending.length, to_generate: pending.length, characters, estimated_usd, month, project_spent_usd: project, max_usd_per_video: limits.maxUsdPerVideo,
    blocked: estimated_usd > 0 && (month.spent_usd + estimated_usd > month.budget_usd || project + estimated_usd > limits.maxUsdPerVideo) };
}

const linkVoice = async (client: Client, context: Context, projectId: string, sceneKey: string, generationId: string) => {
  await client.query(`INSERT INTO scene_media(organization_id,project_id,scene_key,voice_generation_id) VALUES($1,$2,$3,$4)
    ON CONFLICT (organization_id,project_id,scene_key) DO UPDATE SET voice_generation_id=EXCLUDED.voice_generation_id,updated_at=now()`, [context.organizationId, projectId, sceneKey, generationId]);
  await backToAssets(client, projectId);
};
const LEASE = `now()+interval '3 minutes'`;
// El lease supera el timeout del proveedor. RUNNING sin vencer significa que otra petición ya paga esta generación.
async function claimJob(client: Client, context: Context, fingerprint: string, projectId: string, confirmRetry: boolean) {
  const job = await reserveJob(client, context, 'TTS', fingerprint, fingerprint, projectId);
  if (job.claimed) {
    await client.query(`UPDATE jobs SET lease_expires_at=${LEASE} WHERE id=$1`, [job.id]);
    return { id: job.id, attempt: 1 };
  }
  const row = await client.query(`UPDATE jobs SET status='RUNNING',attempt=attempt+1,last_error_code=NULL,updated_at=now(),lease_expires_at=${LEASE}
    WHERE id=$1 AND ((status='RETRY_WAIT' AND scheduled_at<=now()) OR ($2 AND (status='DEAD' OR (status='RUNNING' AND lease_expires_at<now())))) RETURNING id,attempt`, [job.id, confirmRetry]);
  if (!row.rowCount) throw new AppError('CONFLICT', 409);
  return { id: row.rows[0].id as string, attempt: row.rows[0].attempt as number };
}
const free: TtsErrorCode[] = ['RATE_LIMITED', 'UPSTREAM', 'REJECTED', 'AUTH'];
async function settleFailure(client: Client, job: { id: string; attempt: number }, usageId: string, code: string, retryAfterSeconds: number | null) {
  const wait = retryAfterSeconds ?? 2 ** job.attempt * 5 + Math.random() * 2;
  const retry = code === 'RATE_LIMITED' || code === 'UPSTREAM';
  await client.query(`UPDATE jobs SET status=CASE WHEN $2 AND attempt<max_attempts THEN 'RETRY_WAIT' ELSE 'DEAD' END,last_error_code=$3,scheduled_at=now()+($4*interval '1 second'),updated_at=now() WHERE id=$1 AND status='RUNNING'`, [job.id, retry, code, wait]);
  // Sin cobro confirmado se libera el presupuesto; si pudo cobrarse, la estimación queda hasta conciliar con la factura.
  if (free.includes(code as TtsErrorCode)) await client.query('UPDATE provider_usage SET actual_cost_usd=0 WHERE id=$1', [usageId]);
}
async function voiceForScene(db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, projectId: string, scene: ScenePlan, input: VoiceInput, provider: TtsProvider, store: ObjectStore, limits: SpendLimits, options: Options) {
  const textHash = sha256(scene.narration), hashOfSettings = settingsHash(input), fingerprint = ttsCacheKey(organizationId, scene.narration, input.voice_id, input.model_id, input.settings);
  const tx = <R>(operation: (client: Client, context: Context) => Promise<R>) => db.organizationTransaction(identity, organizationId, 'project:write', operation);
  const claim = await tx(async (client, context) => {
    await requireProject(client, projectId, mediaStages);
    const cached = await client.query('SELECT id,content_sha256,duration_ms FROM voice_generations WHERE provider=$1 AND voice_id=$2 AND model_id=$3 AND text_sha256=$4 AND settings_sha256=$5', [provider.name, input.voice_id, input.model_id, textHash, hashOfSettings]);
    if (cached.rowCount) { await linkVoice(client, context, projectId, scene.key, cached.rows[0].id); return { cached: cached.rows[0] as { id: string; content_sha256: string; duration_ms: number } }; }
    const job = await claimJob(client, context, fingerprint, projectId, input.confirm_retry);
    const usageId = await reserveSpend(client, context, { projectId, jobId: job.id, provider: provider.name, operation: 'tts.synthesize', units: scene.narration.length, unitName: 'characters', estimatedUsd: usdFor(scene.narration.length, provider) }, limits);
    return { job, usageId };
  });
  if (claim.cached) return { status: 'CACHED', voice_generation_id: claim.cached.id, content_sha256: claim.cached.content_sha256, duration_ms: claim.cached.duration_ms };
  const { job, usageId } = claim;
  let audio: TtsResult;
  try { audio = await provider.synthesize({ voice_id: input.voice_id, model_id: input.model_id, settings: input.settings, text: scene.narration }); }
  catch (error) {
    const known = error instanceof TtsError ? error : new TtsError('NO_RESPONSE');
    await tx(client => settleFailure(client, job, usageId, known.code, known.retryAfterSeconds));
    throw known;
  }
  const hash = bytesHash(audio.audio), key = objectKey(organizationId, projectId, 'voice', hash, audio.extension);
  try {
    await store.put(key, audio.audio);
    return await tx(async (client, context) => {
      const row = await client.query(`INSERT INTO voice_generations(organization_id,project_id,provider,voice_id,model_id,text_sha256,settings_sha256,object_key,chars_billed,cost_usd,content_sha256,mime_type,duration_ms,alignment,timing_source,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [organizationId, projectId, provider.name, input.voice_id, input.model_id, textHash, hashOfSettings, key, audio.billed_chars, usdFor(audio.billed_chars, provider), hash, audio.mime_type, audio.duration_ms, JSON.stringify(audio.alignment), audio.timing_source, context.actorId]);
      await client.query('UPDATE provider_usage SET actual_cost_usd=$1,output_units=$2,provider_request_id=$3 WHERE id=$4', [usdFor(audio.billed_chars, provider), audio.billed_chars, audio.request_id, usageId]);
      await finishJob(client, job.id, 'SUCCEEDED', null);
      await linkVoice(client, context, projectId, scene.key, row.rows[0].id);
      await audit(client, context, 'VOICE_GENERATED', 'voice_generation', row.rows[0].id, { ...options, afterHash: hash });
      return { status: 'GENERATED', voice_generation_id: row.rows[0].id as string, content_sha256: hash, duration_ms: audio.duration_ms, timing_source: audio.timing_source };
    });
  } catch (error) {
    // El proveedor ya respondió y cobró: no se libera el coste ni se reintenta sin confirmación.
    await tx(client => settleFailure(client, job, usageId, 'SAVE_FAILED', null));
    throw error;
  }
}
// Cada escena se confirma por separado: un fallo parcial conserva lo pagado y el reintento solo genera lo que falta.
export async function synthesizeVoice(db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, projectId: string, input: VoiceInput, provider: TtsProvider, store: ObjectStore, limits: SpendLimits, options: Options = {}) {
  const { scenes } = await db.organizationTransaction(identity, organizationId, 'project:write', async client => {
    await requireProject(client, projectId, mediaStages);
    return approvedScenes(client, projectId);
  });
  const selected = input.scene_keys ? scenes.filter(s => input.scene_keys!.includes(s.key)) : scenes;
  if (input.scene_keys && selected.length !== new Set(input.scene_keys).size) throw new AppError('NOT_FOUND', 404);
  const results: Record<string, unknown>[] = [];
  let stopped = false;
  for (const scene of selected) {
    if (stopped) { results.push({ scene_key: scene.key, status: 'SKIPPED' }); continue; }
    try { results.push({ scene_key: scene.key, ...await voiceForScene(db, identity, organizationId, projectId, scene, input, provider, store, limits, options) }); }
    catch (error) {
      if (!(error instanceof TtsError || error instanceof AppError)) throw error;
      results.push({ scene_key: scene.key, status: 'FAILED', code: error.code });
      // Otra escena puede funcionar si esta fue rechazada o ya está en curso; ante cuota, tope o caída se deja de llamar.
      stopped = error.code !== 'REJECTED' && error.code !== 'CONFLICT';
    }
  }
  return { provider: provider.name, complete: results.every(r => r.status === 'GENERATED' || r.status === 'CACHED'), results };
}
