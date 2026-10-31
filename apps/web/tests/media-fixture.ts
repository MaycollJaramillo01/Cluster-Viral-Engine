import { randomUUID } from 'node:crypto';
import { AppError } from '@cluster/contracts';
import { assetMetadataInput, licenseInput, voiceInput } from '../src/media/contract';
import type { ObjectStore } from '../src/media/objects';
import * as media from '../src/media/store';
import { mockTts, type TtsProvider } from '../src/media/tts';
import * as research from '../src/research/store';
import { scriptContentSchema } from '../src/scripts/contract';
import * as scripts from '../src/scripts/store';
import type { createTenantFixture } from './support';

export const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;
// Texto distinto por escena y prueba: la caché de voz es por organización y reutilizaría cualquier frase repetida.
export const tag = () => randomUUID().replace(/[^a-f]/g, '').padEnd(8, 'x').slice(0, 8);
export const longText = () => Array.from({ length: 10 }, () => `El fragmento ficticio ${tag()} describe el puente de prueba con calma y sin añadir datos nuevos para el relato.`).join(' ');
export const png = (seed: number, width = 1080, height = 1920) => {
  const b = Buffer.alloc(40); b.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); b.writeUInt32BE(seed, 33);
  return new Uint8Array(b);
};
export const visual = (name = 'Foto del puente', over = {}) => assetMetadataInput.parse({ name, purpose: 'VISUAL', source_name: 'Archivo Muestra', alt_text: 'Puente ficticio', original_source_url: 'https://a.example/foto', ...over });
export const openLicense = (over = {}) => licenseInput.parse({ author: 'Autora', license_name: 'CC BY 4.0', license_url: 'https://a.example/licencia', allowed_use: 'Video documental comercial', commercial_use_allowed: true, attribution_required: true, attribution_text: 'Foto: Autora, CC BY', ...over });
export const target = { voice_id: 'voz_1', model_id: 'modelo_1' };
export const counted = (base: TtsProvider = mockTts()) => { const calls: string[] = []; return { calls, provider: { ...base, synthesize: request => { calls.push(request.text); return base.synthesize(request); } } as TtsProvider }; };
export const limits = { maxUsdPerVideo: 3 };

// De la investigación aprobada al guion aprobado, con los tres papeles que intervienen. Lo usan las pruebas de medios y las de render.
export async function mediaActors(f: Awaited<ReturnType<typeof createTenantFixture>>, store: ObjectStore) {
  const editor = await f.member(f.orgA, 'editor', 'editor'), reviewer = await f.member(f.orgA, 'reviewer', 'reviewer'), outsider = await f.member(f.orgB, 'editor', 'outsider');
  const asEditor = <R>(op: Parameters<typeof f.db.organizationTransaction<R>>[3]) => f.db.organizationTransaction(editor.identity, f.orgA, 'project:write', op);
  const asReviewer = <R>(op: Parameters<typeof f.db.organizationTransaction<R>>[3]) => f.db.organizationTransaction(reviewer.identity, f.orgA, 'editorial:review', op);
  const reader = <R>(op: Parameters<typeof f.db.organizationTransaction<R>>[3]) => f.db.organizationTransaction(editor.identity, f.orgA, 'organization:read', op);
  const synthesize = (project: string, provider: TtsProvider, over = {}, spend = limits) => media.synthesizeVoice(f.db, editor.identity, f.orgA, project, voiceInput.parse({ ...target, ...over }), provider, store, spend);
  const upload = (project: string, metadata: ReturnType<typeof visual>, bytes: Uint8Array) => media.uploadAsset(f.db, editor.identity, f.orgA, project, metadata, bytes, store, limits);
  const research_ = async () => {
    const project = await asEditor(async (c, x) => (await research.selectStory(c, x, (await research.createStory(c, x, { proposed_title: 'Caso ficticio', summary: '', hook: '', category: null, interest_reason: '', source_availability: '', visual_potential: '', risk_notes: '', editorial_risk: 'LOW' })).id)).project_id) as string;
    const source = await asEditor((c, x) => research.addSource(c, x, project, { url: `https://a.example/${randomUUID()}`, title: '', publisher: 'Archivo', author: null, publication_date: null, retrieved_at: '2026-10-31T00:00:00.000Z', source_type: 'PRIMARY', evidence_excerpt: 'Extracto.', license_note: '' }));
    const claim = await asEditor((c, x) => research.addClaim(c, x, project, { statement: 'El puente ficticio se inauguró.', classification: 'CONFIRMED', subject: '', event_date: null, legal_status: 'NONE', risk_categories: [], evidence: [{ source_id: source.id, relation: 'SUPPORTS', excerpt: null }] }));
    const frozen = await asEditor((c, x) => research.freezeDossier(c, x, project));
    await asReviewer((c, x) => research.decideDossier(c, x, project, frozen.revision, { decision: 'APPROVED', target_sha256: frozen.content_sha256, note: '' }));
    return { project, claim: claim.id as string };
  };
  const content = (claim: string, texts = [longText(), longText()]) => scriptContentSchema.parse({ tone: 'Sobrio', target_seconds: 150, title_options: ['Título uno', 'Título dos', 'Título tres'], hooks: ['Gancho uno', 'Gancho dos', 'Gancho tres'], selected_hook: 0,
    sections: [{ key: randomUUID(), beat: 'HOOK', text: texts[0], claim_ids: [claim] }, { key: randomUUID(), beat: 'OUTCOME', text: texts[1], claim_ids: [claim] }] });
  const approveVersion = async (project: string, version: number, hash: string) => {
    await asEditor((c, x) => scripts.submitVersion(c, x, project, version));
    await asReviewer((c, x) => scripts.decideVersion(c, x, project, version, { decision: 'APPROVED', target_sha256: hash, note: '' }));
  };
  const approved = async (texts?: string[]) => {
    const { project, claim } = await research_(), body = content(claim, texts);
    const saved = await asEditor((c, x) => scripts.saveVersion(c, x, project, 0, body, 'HUMAN'));
    await approveVersion(project, 1, saved.content_sha256);
    const scenes = (await reader(c => media.approvedScenes(c, project))).scenes;
    return { project, claim, body, scenes };
  };
  const blockers = async (project: string) => (await reader(c => media.readMedia(c, project))).blockers.map(b => b.code);
  const freshAsset = async (project: string, seed: number, bytes: Uint8Array = png(seed)) => {
    const asset = await upload(project, visual(`Foto ${seed}`), bytes);
    await asEditor((c, x) => media.addLicense(c, x, project, asset.id, openLicense()));
    await asReviewer((c, x) => media.decideAsset(c, x, project, asset.id, { decision: 'APPROVED', target_sha256: asset.content_sha256, note: '' }));
    return asset;
  };
  return { editor, reviewer, outsider, asEditor, asReviewer, reader, synthesize, upload, research_, content, approveVersion, approved, blockers, freshAsset };
}
