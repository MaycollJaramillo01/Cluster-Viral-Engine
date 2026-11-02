import type { PoolClient } from 'pg';
import { AppError, type OrganizationContext, type VerifiedIdentity } from '@cluster/contracts';
import { sha256 } from '../phase00/contract';
import { audit, emit } from '../server/audit';
import type { TenantDatabase } from '../server/database';
import type { ClaimInput, ClaimPatch, DecisionInput, DossierClaim, DossierSource, ReferenceInput, SourceInput, StoryInput } from './contract';
import { researchPlanSchema } from './contract';
import { acceptClaims, acceptProposals, extractionPrompt, proposalPrompt, type EditorialModel, type ExtractedClaim, type Proposal } from './model';
import { assembleDossier, assessClaim, buildResearchPlan, evaluateGate, normalizeReference, normalizeUrl, scoreStory, SCORE_VERSION } from './policy';

type Client = PoolClient;
type Context = OrganizationContext;
type Options = { requestId?: string };
const uniqueViolation = (error: unknown) => (error as { code?: string }).code === '23505';

export async function createStory(client: Client, context: Context, input: StoryInput, options: Options = {}) {
  const scored = input.factors ? scoreStory(input.factors) : null;
  const row = await client.query(`INSERT INTO stories(organization_id,proposed_title,summary,hook,category,interest_reason,source_availability,visual_potential,risk_notes,editorial_risk,viral_score,score_factors,scoring_version,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [context.organizationId, input.proposed_title, input.summary, input.hook, input.category, input.interest_reason, input.source_availability, input.visual_potential, input.risk_notes,
      input.editorial_risk, scored?.score ?? null, JSON.stringify(scored ?? {}), SCORE_VERSION, context.actorId]);
  await audit(client, context, 'STORY_CREATED', 'story', row.rows[0].id, options);
  return row.rows[0];
}
// Alto riesgo sin pruebas no compite por score: se lista solo si se pide de forma explícita.
export async function listStories(client: Client, filters: { status?: string; category?: string; min_score?: number; include_high_risk: string; limit: number }) {
  const rows = await client.query(`SELECT * FROM stories WHERE ($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR category=$2) AND ($3::numeric IS NULL OR viral_score>=$3)
    AND ($4 OR editorial_risk<>'HIGH') ORDER BY viral_score DESC NULLS LAST,created_at DESC LIMIT $5`,
    [filters.status ?? null, filters.category ?? null, filters.min_score ?? null, filters.include_high_risk === 'true', filters.limit]);
  return rows.rows;
}
export async function selectStory(client: Client, context: Context, storyId: string, options: Options = {}) {
  const story = await client.query('SELECT id,project_id,proposed_title,status FROM stories WHERE id=$1 FOR UPDATE', [storyId]);
  if (!story.rowCount) throw new AppError('NOT_FOUND', 404);
  if (story.rows[0].project_id) return { project_id: story.rows[0].project_id as string, created: false };
  if (story.rows[0].status !== 'CANDIDATE') throw new AppError('CONFLICT', 409);
  const project = await client.query(`INSERT INTO projects(organization_id,title,status,created_by) VALUES($1,$2,'RESEARCHING',$3) RETURNING id`, [context.organizationId, story.rows[0].proposed_title, context.actorId]);
  await client.query(`UPDATE stories SET project_id=$1,status='SELECTED' WHERE id=$2`, [project.rows[0].id, storyId]);
  await audit(client, context, 'STORY_SELECTED', 'story', storyId, options);
  await audit(client, context, 'PROJECT_CREATED', 'project', project.rows[0].id, options);
  return { project_id: project.rows[0].id as string, created: true };
}

export async function createReference(client: Client, context: Context, input: ReferenceInput, options: Options = {}) {
  const { url, platform } = normalizeReference(input.url);
  if (input.story_id && !(await client.query('SELECT 1 FROM stories WHERE id=$1', [input.story_id])).rowCount) throw new AppError('NOT_FOUND', 404);
  const row = await client.query(`INSERT INTO editorial_references(organization_id,story_id,platform,url,metrics,permissions_note,access_mode,source_version,analysis,created_by)
    VALUES($1,$2,$3,$4,$5,$6,'MANUAL',$7,$8,$9) ON CONFLICT(organization_id,url) DO NOTHING RETURNING *`,
    [context.organizationId, input.story_id, platform, url, JSON.stringify(input.metrics), input.permissions_note, input.source_version, JSON.stringify(input.analysis), context.actorId]);
  if (!row.rowCount) return { reference: (await client.query('SELECT * FROM editorial_references WHERE url=$1', [url])).rows[0], created: false };
  await audit(client, context, 'REFERENCE_CREATED', 'editorial_reference', row.rows[0].id, options);
  return { reference: row.rows[0], created: true };
}
export const listReferences = async (client: Client) => (await client.query('SELECT * FROM editorial_references ORDER BY captured_at DESC LIMIT 100')).rows;

// Serializa las escrituras de un proyecto; las revisiones y transiciones dependen de este lock.
export async function requireProject(client: Client, projectId: string, statuses?: readonly string[]) {
  const project = await client.query('SELECT id,title,status FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
  if (!project.rowCount) throw new AppError('NOT_FOUND', 404);
  if (statuses && !statuses.includes(project.rows[0].status)) throw new AppError('CONFLICT', 409);
  return project.rows[0] as { id: string; title: string; status: string };
}
const researchOpen = ['RESEARCHING', 'RESEARCH_REVIEW'] as const;

export async function createResearchPlan(client: Client, context: Context, projectId: string, options: Options = {}) {
  await requireProject(client, projectId, researchOpen);
  const story = await client.query('SELECT proposed_title,summary,risk_notes,editorial_risk FROM stories WHERE project_id=$1 LIMIT 1', [projectId]);
  if (!story.rowCount) throw new AppError('NOT_FOUND', 404);
  const plan = researchPlanSchema.parse(buildResearchPlan(story.rows[0]));
  const row = await client.query(`INSERT INTO research_plans(organization_id,project_id,revision,plan,created_by)
    SELECT $1,$2,COALESCE(max(revision),0)+1,$3,$4 FROM research_plans WHERE project_id=$2 RETURNING id,revision,plan`, [context.organizationId, projectId, JSON.stringify(plan), context.actorId]);
  await audit(client, context, 'RESEARCH_PLAN_CREATED', 'research_plan', row.rows[0].id, { ...options, afterHash: sha256(plan) });
  return row.rows[0];
}

export async function addSource(client: Client, context: Context, projectId: string, input: SourceInput, options: Options = {}) {
  await requireProject(client, projectId, researchOpen);
  const url = normalizeUrl(input.url).toString();
  try {
    const row = await client.query(`INSERT INTO sources(organization_id,project_id,url,title,publisher,author,publication_date,retrieved_at,source_type,evidence_excerpt,source_sha256,license_note,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,independence_key`,
      [context.organizationId, projectId, url, input.title, input.publisher, input.author, input.publication_date, input.retrieved_at, input.source_type, input.evidence_excerpt, sha256(input.evidence_excerpt), input.license_note, context.actorId]);
    await audit(client, context, 'SOURCE_ADDED', 'source', row.rows[0].id, options);
    return row.rows[0];
  } catch (error) { if (uniqueViolation(error)) throw new AppError('CONFLICT', 409); throw error; }
}

async function insertClaim(client: Client, context: Context, projectId: string, input: Omit<ClaimInput, 'evidence'>, evidence: ClaimInput['evidence'], origin: string, options: Options) {
  const known = await client.query('SELECT id FROM sources WHERE project_id=$1 AND id=ANY($2::uuid[])', [projectId, evidence.map(e => e.source_id)]);
  if (known.rowCount !== new Set(evidence.map(e => e.source_id)).size) throw new AppError('INVALID_INPUT', 400);
  const assessed = assessClaim(input);
  const row = await client.query(`INSERT INTO claims(organization_id,project_id,statement,classification,sensitivity,subject,event_date,legal_status,risk_categories,origin,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,classification,sensitivity,risk_categories`,
    [context.organizationId, projectId, input.statement, input.classification, assessed.sensitivity, input.subject, input.event_date, input.legal_status, assessed.risk_categories, origin, context.actorId]);
  for (const item of evidence) await client.query(`INSERT INTO claim_evidence(organization_id,claim_id,source_id,relation,excerpt) VALUES($1,$2,$3,$4,$5)`,
    [context.organizationId, row.rows[0].id, item.source_id, item.relation, item.excerpt]);
  await audit(client, context, 'CLAIM_ADDED', 'claim', row.rows[0].id, options);
  return row.rows[0];
}
export async function addClaim(client: Client, context: Context, projectId: string, input: ClaimInput, options: Options = {}) {
  await requireProject(client, projectId, researchOpen);
  const { evidence, ...fields } = input;
  try { return await insertClaim(client, context, projectId, fields, evidence, 'HUMAN', options); }
  catch (error) { if (uniqueViolation(error)) throw new AppError('INVALID_INPUT', 400); throw error; }
}
// Editar quita la verificación: lo que una persona revisó ya no es este texto.
export async function updateClaim(client: Client, context: Context, projectId: string, claimId: string, input: ClaimPatch, options: Options = {}) {
  await requireProject(client, projectId, researchOpen);
  const assessed = assessClaim(input);
  const row = await client.query(`UPDATE claims SET statement=$1,classification=$2,sensitivity=$3,subject=$4,event_date=$5,legal_status=$6,risk_categories=$7,verified_by=NULL,verified_at=NULL
    WHERE id=$8 AND project_id=$9 RETURNING id,classification,sensitivity,risk_categories`,
    [input.statement, input.classification, assessed.sensitivity, input.subject, input.event_date, input.legal_status, assessed.risk_categories, claimId, projectId]);
  if (!row.rowCount) throw new AppError('NOT_FOUND', 404);
  await audit(client, context, 'CLAIM_UPDATED', 'claim', claimId, options);
  return row.rows[0];
}
export async function verifyClaim(client: Client, context: Context, projectId: string, claimId: string, options: Options = {}) {
  await requireProject(client, projectId, researchOpen);
  const row = await client.query(`UPDATE claims SET verified_by=$1,verified_at=now() WHERE id=$2 AND project_id=$3 RETURNING id,verified_at`, [context.actorId, claimId, projectId]);
  if (!row.rowCount) throw new AppError('NOT_FOUND', 404);
  await audit(client, context, 'CLAIM_VERIFIED', 'claim', claimId, options);
  return row.rows[0];
}

export async function loadDossier(client: Client, project: { id: string; title: string }) {
  const sources = await client.query(`SELECT id,url,title,publisher,author,publication_date::text AS publication_date,retrieved_at,source_type,evidence_excerpt,license_note,independence_key FROM sources WHERE project_id=$1 ORDER BY id`, [project.id]);
  const claims = await client.query(`SELECT c.id,c.statement,c.classification,c.sensitivity,c.subject,c.event_date::text AS event_date,c.legal_status,c.risk_categories,c.origin,c.verified_by,
    COALESCE((SELECT json_agg(json_build_object('source_id',e.source_id,'relation',e.relation,'excerpt',e.excerpt) ORDER BY e.source_id) FROM claim_evidence e WHERE e.claim_id=c.id),'[]'::json) AS evidence
    FROM claims c WHERE c.project_id=$1 ORDER BY c.id`, [project.id]);
  const verified = new Set<string>(claims.rows.filter(c => c.verified_by).map(c => c.id));
  const content = assembleDossier(project,
    sources.rows.map(s => ({ ...s, retrieved_at: new Date(s.retrieved_at).toISOString() })) as DossierSource[],
    claims.rows.map(claim => { const copy = { ...claim }; delete copy.verified_by; return copy; }) as DossierClaim[]);
  return { content, verified, sha256: sha256(content) };
}
export async function freezeDossier(client: Client, context: Context, projectId: string, options: Options = {}) {
  const project = await requireProject(client, projectId, researchOpen);
  const { content, verified, sha256: hash } = await loadDossier(client, project);
  await client.query(`UPDATE dossier_revisions SET status='SUPERSEDED' WHERE project_id=$1 AND status='REVIEW'`, [projectId]);
  const row = await client.query(`INSERT INTO dossier_revisions(organization_id,project_id,revision,content,content_sha256,created_by)
    SELECT $1,$2,COALESCE(max(revision),0)+1,$3,$4,$5 FROM dossier_revisions WHERE project_id=$2 RETURNING id,revision,status,content_sha256`, [context.organizationId, projectId, JSON.stringify(content), hash, context.actorId]);
  await client.query(`UPDATE projects SET status='RESEARCH_REVIEW',updated_at=now(),revision=revision+1 WHERE id=$1`, [projectId]);
  await audit(client, context, 'DOSSIER_FROZEN', 'dossier', row.rows[0].id, { ...options, afterHash: hash });
  await emit(client, context, 'dossier', row.rows[0].id, 'DOSSIER_READY_FOR_REVIEW', { project_id: projectId, revision: row.rows[0].revision });
  return { ...row.rows[0], gate: evaluateGate(content, verified) };
}
export async function readDossier(client: Client, projectId: string, revision: number) {
  const row = await client.query('SELECT id,project_id,revision,status,content,content_sha256,created_by,created_at FROM dossier_revisions WHERE project_id=$1 AND revision=$2', [projectId, revision]);
  if (!row.rowCount) throw new AppError('NOT_FOUND', 404);
  const project = (await client.query('SELECT id,title FROM projects WHERE id=$1', [projectId])).rows[0];
  const live = await loadDossier(client, project);
  return { ...row.rows[0], is_current: live.sha256 === row.rows[0].content_sha256, gate: evaluateGate(row.rows[0].content, live.verified) };
}
// Decide sobre el hash exacto y reevalúa contra el estado vivo dentro de esta transacción; nunca confía en un approved=true del cliente.
export async function decideDossier(client: Client, context: Context, projectId: string, revision: number, input: DecisionInput, options: Options = {}) {
  const project = await requireProject(client, projectId, ['RESEARCH_REVIEW']);
  const row = await client.query('SELECT id,status,content_sha256 FROM dossier_revisions WHERE project_id=$1 AND revision=$2 FOR UPDATE', [projectId, revision]);
  if (!row.rowCount) throw new AppError('NOT_FOUND', 404);
  if (row.rows[0].status !== 'REVIEW' || row.rows[0].content_sha256 !== input.target_sha256) throw new AppError('CONFLICT', 409);
  const live = await loadDossier(client, project);
  if (live.sha256 !== input.target_sha256) throw new AppError('CONFLICT', 409);
  if (input.decision === 'APPROVED' && evaluateGate(live.content, live.verified).blockers.length) throw new AppError('BLOCKED_BY_POLICY', 409);
  await client.query(`INSERT INTO approvals(organization_id,project_id,target_sha256,approval_type,decision,decided_by,note) VALUES($1,$2,$3,'RESEARCH',$4,$5,$6)`,
    [context.organizationId, projectId, input.target_sha256, input.decision, context.actorId, input.note || null]);
  await client.query('UPDATE dossier_revisions SET status=$1 WHERE id=$2', [input.decision, row.rows[0].id]);
  await client.query(`UPDATE projects SET status=$1,updated_at=now(),revision=revision+1 WHERE id=$2`, [input.decision === 'APPROVED' ? 'SCRIPTING' : 'RESEARCHING', projectId]);
  await audit(client, context, `DOSSIER_${input.decision}`, 'dossier', row.rows[0].id, { ...options, afterHash: input.target_sha256, reason: input.note || undefined });
  await emit(client, context, 'dossier', row.rows[0].id, `DOSSIER_${input.decision}`, { project_id: projectId, revision });
  return { revision, status: input.decision, project_status: input.decision === 'APPROVED' ? 'SCRIPTING' : 'RESEARCHING' };
}

export type Reservation = { id: string; claimed: boolean; status: string; payload: { input_sha256?: string; rejected?: { index: number; reason: string }[] } };
// Una llamada de modelo cuesta dinero: la clave se reserva antes y un reintento nunca repite la llamada.
export async function reserveJob(client: Client, context: Context, jobType: string, key: string, inputHash: string, projectId: string | null = null): Promise<Reservation> {
  const row = await client.query(`INSERT INTO jobs(organization_id,project_id,job_type,idempotency_key,payload,status,attempt) VALUES($1,$2,$3,$4,$5,'RUNNING',1)
    ON CONFLICT(organization_id,job_type,idempotency_key) DO NOTHING RETURNING id,status,payload`, [context.organizationId, projectId, jobType, key, JSON.stringify({ input_sha256: inputHash })]);
  if (row.rowCount) return { ...row.rows[0], claimed: true };
  const old = await client.query('SELECT id,status,payload FROM jobs WHERE job_type=$1 AND idempotency_key=$2', [jobType, key]);
  if (old.rows[0].payload.input_sha256 !== inputHash) throw new AppError('CONFLICT', 409);
  return { ...old.rows[0], claimed: false };
}
export async function finishJob(client: Client, jobId: string, status: 'SUCCEEDED' | 'DEAD', errorCode: string | null, rejected: unknown[] = []) {
  await client.query(`UPDATE jobs SET status=$1,last_error_code=$2,payload=payload||$3::jsonb,updated_at=now() WHERE id=$4 AND status='RUNNING'`, [status, errorCode, JSON.stringify({ rejected }), jobId]);
}

async function callModel(db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, jobId: string, permission: 'project:write', call: () => Promise<string>) {
  try { return await call(); }
  catch {
    await db.organizationTransaction(identity, organizationId, permission, client => finishJob(client, jobId, 'DEAD', 'MODEL_ERROR'));
    throw new AppError('BLOCKED_EXTERNAL', 503);
  }
}
export async function proposeStories(db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, request: { idempotency_key: string; topic: string; category: string | null }, model: EditorialModel, options: Options = {}) {
  const input = { topic: request.topic, category: request.category };
  const reserved = await db.organizationTransaction(identity, organizationId, 'project:write', async (client, context) => {
    const job = await reserveJob(client, context, 'STORY_PROPOSALS', request.idempotency_key, sha256(input));
    const references = job.claimed ? (await client.query('SELECT id,url,analysis FROM editorial_references ORDER BY captured_at DESC LIMIT 20')).rows : [];
    const stories = job.claimed ? [] : (await client.query(`SELECT * FROM stories WHERE proposal_key LIKE $1 ORDER BY proposal_key`, [`${job.id}:%`])).rows;
    return { job, references, stories };
  });
  if (!reserved.job.claimed) {
    if (reserved.job.status !== 'SUCCEEDED') throw new AppError('CONFLICT', 409);
    return { job_id: reserved.job.id, reused: true, stories: reserved.stories, rejected: reserved.job.payload.rejected ?? [], origin: reserved.stories[0]?.origin };
  }
  const raw = await callModel(db, identity, organizationId, reserved.job.id, 'project:write', () => model.complete(proposalPrompt({ ...input, references: reserved.references })));
  const { accepted, rejected } = acceptProposals(raw, new Set(reserved.references.map(r => r.id)));
  return db.organizationTransaction(identity, organizationId, 'project:write', async (client, context) => {
    const stories = [];
    for (const [index, proposal] of accepted.entries()) stories.push(await insertProposal(client, context, proposal, model.origin, `${reserved.job.id}:${index}`, options));
    await finishJob(client, reserved.job.id, accepted.length ? 'SUCCEEDED' : 'DEAD', accepted.length ? null : 'MODEL_OUTPUT_REJECTED', rejected);
    return { job_id: reserved.job.id, reused: false, stories, rejected, origin: model.origin };
  });
}
async function insertProposal(client: Client, context: Context, proposal: Proposal, origin: string, key: string, options: Options) {
  const row = await client.query(`INSERT INTO stories(organization_id,proposed_title,summary,hook,category,interest_reason,source_availability,visual_potential,risk_notes,origin,proposal_key,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [context.organizationId, proposal.proposed_title, proposal.summary, proposal.hook, proposal.category, proposal.interest_reason, proposal.source_availability, proposal.visual_potential, proposal.risk_notes, origin, key, context.actorId]);
  for (const referenceId of proposal.reference_ids) await client.query('UPDATE editorial_references SET story_id=$1 WHERE id=$2 AND story_id IS NULL', [row.rows[0].id, referenceId]);
  await audit(client, context, 'STORY_PROPOSED', 'story', row.rows[0].id, options);
  return row.rows[0];
}
export async function extractClaims(db: TenantDatabase, identity: VerifiedIdentity, organizationId: string, projectId: string, request: { idempotency_key: string }, model: EditorialModel, options: Options = {}) {
  const reserved = await db.organizationTransaction(identity, organizationId, 'project:write', async (client, context) => {
    await requireProject(client, projectId, researchOpen);
    const sources = (await client.query('SELECT id,publisher,evidence_excerpt FROM sources WHERE project_id=$1 ORDER BY id', [projectId])).rows;
    const job = await reserveJob(client, context, 'CLAIM_EXTRACTION', request.idempotency_key, sha256({ projectId, sources }), projectId);
    return { job, sources };
  });
  if (!reserved.job.claimed) {
    if (reserved.job.status !== 'SUCCEEDED') throw new AppError('CONFLICT', 409);
    return { job_id: reserved.job.id, reused: true, rejected: reserved.job.payload.rejected ?? [] };
  }
  const raw = await callModel(db, identity, organizationId, reserved.job.id, 'project:write',
    () => model.complete(extractionPrompt({ sources: reserved.sources.map(s => ({ id: s.id, publisher: s.publisher, excerpt: s.evidence_excerpt })) })));
  const { accepted, rejected } = acceptClaims(raw, reserved.sources);
  return db.organizationTransaction(identity, organizationId, 'project:write', async (client, context) => {
    await requireProject(client, projectId, researchOpen);
    const claims = [];
    for (const claim of accepted) claims.push(await insertExtracted(client, context, projectId, claim, model.origin, options));
    await finishJob(client, reserved.job.id, accepted.length ? 'SUCCEEDED' : 'DEAD', accepted.length ? null : 'MODEL_OUTPUT_REJECTED', rejected);
    return { job_id: reserved.job.id, reused: false, claims, rejected, origin: model.origin };
  });
}
const insertExtracted = (client: Client, context: Context, projectId: string, claim: ExtractedClaim, origin: string, options: Options) =>
  insertClaim(client, context, projectId, claim, claim.evidence.map(e => ({ source_id: e.source_id, relation: 'SUPPORTS' as const, excerpt: e.excerpt })), origin, options);
