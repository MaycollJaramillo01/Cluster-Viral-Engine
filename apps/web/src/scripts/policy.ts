import { sha256 } from '../phase00/contract';
import type { DossierClaim, DossierContent, GateIssue } from '../research/contract';
import { motions, scenePlanSchema, type ScenePlan, type ScriptContent } from './contract';

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
// Estimación por palabras, marcada como tal. La duración real sale del audio generado (BLOCKED_EXTERNAL sin TTS).
export const estimateSeconds = (text: string, wpm: number) => Math.round(words(text) / wpm * 600) / 10;
export const narrationOf = (content: ScriptContent) => content.sections.map(s => s.text).join('\n\n');

const sentences = (text: string) => text.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);
const MAX_SCENE_WORDS = 28;
function chunks(text: string) {
  const result: string[] = [];
  for (const sentence of sentences(text)) {
    const last = result.at(-1);
    if (last && words(last) + words(sentence) <= MAX_SCENE_WORDS) result[result.length - 1] = `${last} ${sentence}`;
    else result.push(sentence);
  }
  return result;
}
// Determinista y por sección: el índice es local, así que editar una sección no altera las escenas de otra.
export function planScenes(content: ScriptContent): ScenePlan[] {
  return content.sections.flatMap(section => chunks(section.text).map((narration, index) => scenePlanSchema.parse({
    key: `${section.key}:${index}`, section_key: section.key, beat: section.beat, narration, claim_ids: section.claim_ids,
    duration_ms: Math.max(1500, Math.round(words(narration) / content.voice_wpm * 60000)), timing: 'ESTIMATED',
    asset_hint: narration.slice(0, 120), motion: motions[index % motions.length], transition: index === 0 ? 'fade' : 'cut',
    on_screen_text: '', audio_object_key: null, visual_asset_id: null,
  })));
}
export const sceneHash = (scene: ScenePlan) => sha256(scene);

const guiltTerms = /\b(culpable|asesin[oa]|criminal|narcotraficante|ladr[oó]n|estafador|violador|condenad[oa])\b/i;
const hedgeTerms = /\b(presunt[oa]|acusad[oa]|investigad[oa]|imputad[oa]|supuest[oa]|según|alega|alegó|denunci|versi[oó]n|disput|sin sentencia|proceso|absuelt[oa]|no se ha)/i;
const absoluteTerms = /\b(garantizad[oa]|sin duda|la verdad que nadie|definitivamente|nadie sabe|prueba irrefutable)\b|100\s?%/i;
const numbers = /\d[\d.,]*\d|\d/g;
// ponytail: heurística para nombres propios tras "según"; no ve atribuciones en minúscula ni parafraseadas, por eso revisa una persona.
const attribution = /\b(?:[Ss]egún|[Dd]e acuerdo con)\s+(?:(?:el|la|los|las)\s+)?(\p{Lu}[\p{L}\d-]*(?:\s+\p{Lu}[\p{L}\d-]*)*)/gu;

export function evaluateScript(content: ScriptContent, dossier: DossierContent) {
  const blockers: GateIssue[] = [], warnings: GateIssue[] = [];
  const byId = new Map(dossier.claims.map(c => [c.id, c]));
  const convicted = dossier.claims.some(c => c.legal_status === 'CONVICTED' && c.classification === 'CONFIRMED');
  for (const line of [...content.title_options, ...content.hooks]) {
    // Título y gancho no citan claims: sin condena confirmada en el dossier no pueden afirmar culpabilidad.
    if (guiltTerms.test(line) && !convicted && !hedgeTerms.test(line)) blockers.push({ code: 'HEADLINE_ASSERTS_GUILT' });
    if (absoluteTerms.test(line)) warnings.push({ code: 'HEADLINE_ABSOLUTE_LANGUAGE' });
  }
  const seenClaims = new Set<string>();
  const trace = content.sections.map(section => {
    const cited = section.claim_ids.map(id => byId.get(id));
    const issues: string[] = [];
    if (cited.some(c => !c)) issues.push('UNKNOWN_CLAIM');
    const known = cited.filter((c): c is DossierClaim => Boolean(c));
    known.forEach(c => seenClaims.add(c.id));
    if (!section.non_factual && !section.claim_ids.length) issues.push('FACTUAL_SECTION_WITHOUT_CLAIM');
    if (section.non_factual && section.text.search(numbers) >= 0) issues.push('NON_FACTUAL_SECTION_WITH_FIGURES');
    if (known.some(c => c.classification === 'UNVERIFIED')) issues.push('CITES_UNVERIFIED_CLAIM');
    if (known.some(c => ['ALLEGATION', 'DISPUTED'].includes(c.classification)) && !hedgeTerms.test(section.text)) issues.push('ALLEGATION_WITHOUT_HEDGE');
    if (guiltTerms.test(section.text) && !hedgeTerms.test(section.text) && !known.some(c => c.legal_status === 'CONVICTED')) issues.push('ASSERTS_GUILT_WITHOUT_CONVICTION');
    if (known.some(c => c.classification === 'RECONSTRUCTION') && !/recreaci[oó]n|reconstrucci[oó]n/i.test(section.text)) issues.push('RECONSTRUCTION_NOT_LABELLED');
    const support = known.flatMap(c => [c.statement, ...c.evidence.map(e => e.excerpt ?? ''), c.event_date ?? '']).join(' ');
    for (const figure of section.text.match(numbers) ?? []) if (!section.non_factual && !support.includes(figure)) issues.push(`UNSUPPORTED_FIGURE:${figure}`);
    // Se puede atribuir a una fuente del dossier o a quien aparece en un claim citado.
    const attributable = [...dossier.sources.map(s => `${s.publisher ?? ''} ${s.title}`), ...known.map(c => `${c.subject} ${c.statement}`)].join(' ').toLowerCase();
    for (const match of section.text.matchAll(attribution)) if (!attributable.includes(match[1].toLowerCase())) issues.push(`UNKNOWN_ATTRIBUTION:${match[1]}`);
    issues.forEach(code => blockers.push({ code, claim_id: section.key }));
    return { section_key: section.key, beat: section.beat, claim_ids: section.claim_ids, issues };
  });
  // non_factual no puede vaciar la trazabilidad: marcar todo como transición no evita citar el dossier.
  if (!seenClaims.size) blockers.push({ code: 'NO_CLAIMS_CITED' });
  for (const section of content.sections) if (section.non_factual) warnings.push({ code: 'NON_FACTUAL_SECTION', claim_id: section.key });
  const estimated_seconds = estimateSeconds(narrationOf(content), content.voice_wpm);
  if (estimated_seconds < 120 || estimated_seconds > 240) blockers.push({ code: 'DURATION_OUT_OF_RANGE' });
  if (Math.abs(estimated_seconds - content.target_seconds) > 20) warnings.push({ code: 'DURATION_FAR_FROM_TARGET' });
  const unused = dossier.claims.filter(c => !seenClaims.has(c.id)).map(c => c.id);
  return { blockers, warnings, estimated_seconds, duration_is_estimate: true, trace, uncited_claim_ids: unused };
}

// Rúbrica de docs/08: la puntúa una persona. Aprobar exige 4/5 en precisión y ética, sin errores críticos.
const rubricKeys = ['factual', 'hook', 'structure', 'latam_language', 'temporal', 'visual_variety', 'ethics_rights'] as const;
export type RubricScores = Record<typeof rubricKeys[number], number>;
export function rubricResult(scores: RubricScores, criticalErrors: number) {
  if (rubricKeys.some(key => !Number.isInteger(scores[key]) || scores[key] < 0 || scores[key] > 5)) throw new Error('INVALID_RUBRIC');
  return { total: rubricKeys.reduce((sum, key) => sum + scores[key], 0), max: rubricKeys.length * 5, passed: scores.factual >= 4 && scores.ethics_rights >= 4 && criticalErrors === 0 };
}
