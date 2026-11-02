import { AppError } from '@cluster/contracts';
import { factorKeys, type Classification, type DossierClaim, type DossierConflict, type DossierContent, type DossierSource, type GateIssue, type ResearchPlan, type RiskCategory, type ScoreFactors } from './contract';

export const SCORE_VERSION = 'v1';
export const scoreWeights: Record<typeof factorKeys[number], number> = { hook: 20, curiosity: 15, conflict: 15, relevance: 10, shareability: 10, visual: 10, source_quality: 10, similar: 10 };
// Orientativo según fuente §4.C: mide potencial editorial, no promete audiencia.
export function scoreStory(factors: ScoreFactors) {
  const weighted = factorKeys.reduce((sum, key) => sum + scoreWeights[key] * factors[key].value, 0);
  return { version: SCORE_VERSION, weights: scoreWeights, factors, score: Math.round(weighted / 100),
    explanation: factorKeys.map(key => `${key}: ${factors[key].value}/100 × ${scoreWeights[key]}% (${factors[key].reason})`) };
}

const hosts: [string, RegExp][] = [['facebook', /(^|\.)(facebook\.com|fb\.watch)$/], ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/], ['tiktok', /(^|\.)tiktok\.com$/], ['instagram', /(^|\.)instagram\.com$/]];
const tracking = /^(utm_.+|fbclid|gclid|igshid|igsh|si|mibextid|ref|ref_src)$/i;
// Solo se normaliza texto: el servidor nunca descarga estas URLs (sin scraping ni SSRF).
export function normalizeUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppError('INVALID_INPUT', 400); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new AppError('INVALID_INPUT', 400);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (tracking.test(key)) url.searchParams.delete(key);
  return url;
}
export function normalizeReference(raw: string) {
  const url = normalizeUrl(raw);
  return { url: url.toString(), platform: hosts.find(([, pattern]) => pattern.test(url.hostname))?.[0] ?? 'web' };
}

export function discoveryCapabilities() {
  // ponytail: sin credenciales no hay adaptador real; añadir uno por plataforma cuando exista acceso autorizado.
  return hosts.map(([platform]) => ({ platform, status: 'BLOCKED_EXTERNAL', automated_discovery: false, fallback: 'MANUAL_REFERENCE', quota: null,
    limitation: 'Sin credenciales ni permisos verificados. Registrar la referencia manualmente; no se descarga ni se hace scraping.' }));
}

export function buildResearchPlan(story: { proposed_title: string; summary: string; risk_notes: string; editorial_risk: string }): ResearchPlan {
  const t = story.proposed_title;
  return {
    story_title: t, context: story.summary, risks: [story.risk_notes, `Riesgo editorial declarado: ${story.editorial_risk}`].filter(Boolean),
    queries: [
      { query: `${t} expediente sentencia documento oficial`, kind: 'PRIMARY', window: 'ANY', rationale: 'Priorizar registros judiciales y gubernamentales.' },
      { query: `${t} archivo histórico hemeroteca`, kind: 'PRIMARY', window: 'EVENT_PERIOD', rationale: 'Documentos contemporáneos al hecho.' },
      { query: `${t} cronología fechas`, kind: 'SECONDARY', window: 'ANY', rationale: 'Fijar fechas y separar evento de noticia.' },
      { query: `${t} reportaje investigación medio reconocido`, kind: 'SECONDARY', window: 'EVENT_PERIOD', rationale: 'Cobertura editorial independiente.' },
      { query: `${t} últimas novedades proceso judicial`, kind: 'SECONDARY', window: 'LATEST_24_MONTHS', rationale: 'Estado actual: investigado, acusado, condenado o absuelto.' },
      { query: `${t} desmentido absuelto versión contraria`, kind: 'CONTRAST', window: 'ANY', rationale: 'Buscar activamente lo que contradice la historia.' },
      { query: `${t} errores mito verificación de hechos`, kind: 'CONTRAST', window: 'LATEST_24_MONTHS', rationale: 'Detectar afirmaciones repetidas sin soporte.' },
    ],
  };
}

const riskPatterns: [RiskCategory, RegExp][] = [
  ['CRIME', /asesin|homicid|narco|secuestr|violaci|fraude|corrup|sobórn|soborn|crimen|delito|mató|acusad|condenad|imputad/i],
  ['VICTIM', /víctima|victima|familiares de/i],
  ['MINOR', /\bmenor(es)? de edad\b|\bniñ[oa]s?\b|adolescente/i],
];
// ponytail: heurística por palabras clave, solo añade riesgo y nunca lo reduce; la revisión humana cubre lo que no detecte.
export function assessClaim(claim: { statement: string; risk_categories: readonly string[]; classification: Classification; legal_status: string }) {
  const found = new Set<string>(claim.risk_categories);
  for (const [category, pattern] of riskPatterns) if (pattern.test(claim.statement)) found.add(category);
  if (claim.classification === 'RECONSTRUCTION') found.add('RECONSTRUCTION');
  if (claim.legal_status !== 'NONE') found.add('CRIME');
  const risk_categories = [...found].sort();
  return { risk_categories, sensitivity: risk_categories.length ? 'HIGH' : 'NORMAL' };
}

export function findConflicts(claims: DossierClaim[]): DossierConflict[] {
  const conflicts: DossierConflict[] = [];
  for (const claim of claims) if (claim.evidence.some(e => e.relation === 'CONTRADICTS'))
    conflicts.push({ type: 'SOURCE_CONTRADICTION', subject: claim.subject, claim_ids: [claim.id] });
  const bySubject = new Map<string, DossierClaim[]>();
  for (const claim of claims) if (claim.subject) bySubject.set(claim.subject, [...(bySubject.get(claim.subject) ?? []), claim]);
  for (const [subject, group] of bySubject) {
    const legal = group.filter(c => c.legal_status !== 'NONE'), dated = group.filter(c => c.event_date);
    if (new Set(legal.map(c => c.legal_status)).size > 1) conflicts.push({ type: 'LEGAL_STATUS', subject, claim_ids: legal.map(c => c.id) });
    if (new Set(dated.map(c => c.event_date)).size > 1) conflicts.push({ type: 'DATE', subject, claim_ids: dated.map(c => c.id) });
  }
  return conflicts;
}

export function assembleDossier(project: { id: string; title: string }, sources: DossierSource[], claims: DossierClaim[]): DossierContent {
  const timeline = claims.filter(c => c.event_date).map(c => ({ date: c.event_date!, claim_id: c.id, statement: c.statement, classification: c.classification }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.claim_id.localeCompare(b.claim_id));
  return { project_id: project.id, story_title: project.title, sources, claims, timeline, conflicts: findConflicts(claims) };
}

// La verificación humana es estado vivo, fuera del hash: el revisor actúa sin invalidar la revisión congelada.
export function evaluateGate(content: DossierContent, verifiedClaimIds: ReadonlySet<string>) {
  const blockers: GateIssue[] = [], warnings: GateIssue[] = [];
  const sourceById = new Map(content.sources.map(s => [s.id, s]));
  if (!content.sources.length) blockers.push({ code: 'NO_SOURCES' });
  if (!content.claims.length) blockers.push({ code: 'NO_CLAIMS' });
  if (new Set(content.sources.map(s => s.independence_key)).size < 2) warnings.push({ code: 'FEWER_THAN_TWO_INDEPENDENT_SOURCES' });
  for (const claim of content.claims) {
    const add = (code: string) => blockers.push({ code, claim_id: claim.id });
    const supporting = claim.evidence.filter(e => e.relation === 'SUPPORTS').map(e => sourceById.get(e.source_id));
    if (!claim.evidence.length) add('CLAIM_WITHOUT_EVIDENCE');
    if (claim.classification === 'CONFIRMED' && !supporting.length) add('CONFIRMED_WITHOUT_SUPPORT');
    if (claim.sensitivity === 'HIGH') {
      const independent = new Set(supporting.map(s => s?.independence_key)).size;
      if (independent < 2 && !supporting.some(s => s?.source_type === 'PRIMARY')) add('HIGH_RISK_NOT_CORROBORATED');
      if (!verifiedClaimIds.has(claim.id)) add('HIGH_RISK_NOT_VERIFIED');
      if (claim.risk_categories.includes('CRIME') && claim.legal_status === 'NONE') add('LEGAL_STATUS_REQUIRED');
    }
    if (claim.origin !== 'HUMAN' && !verifiedClaimIds.has(claim.id)) add('MODEL_CLAIM_NOT_VERIFIED');
  }
  const byId = new Map(content.claims.map(c => [c.id, c]));
  for (const conflict of content.conflicts) {
    // Reclasificar como DISPUTED es decir que el conflicto sigue abierto; CONFIRMED no puede convivir con él.
    if (conflict.claim_ids.some(id => byId.get(id)?.classification === 'CONFIRMED')) blockers.push({ code: `UNRESOLVED_CONFLICT_${conflict.type}`, claim_id: conflict.claim_ids[0] });
    else warnings.push({ code: `DISCLOSED_CONFLICT_${conflict.type}`, claim_id: conflict.claim_ids[0] });
  }
  return { blockers, warnings, needs_human_review: blockers.length > 0 || content.claims.some(c => c.sensitivity === 'HIGH') };
}
