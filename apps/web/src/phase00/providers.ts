import { sha256, validateManifest, type Manifest } from './contract';

export type Blocked = { status: 'BLOCKED_EXTERNAL'; provider: string; reason: string; remote_id: null; actual_cost_usd: null };
export interface TtsProvider {
  synthesize(organizationId: string, text: string, voice: string): Promise<Blocked>;
}
export class MockTtsProvider implements TtsProvider {
  async synthesize(organizationId: string, text: string, voice: string): Promise<Blocked> {
    if (!organizationId || !text.trim() || !voice.trim()) throw new Error('INVALID_TTS_REQUEST');
    return { status: 'BLOCKED_EXTERNAL', provider: 'mock-elevenlabs', reason: 'Credenciales, voz LATAM y facturación real pendientes', remote_id: null, actual_cost_usd: null };
  }
}
export const ttsCacheKey = (org: string, text: string, voice: string, model: string, settings: unknown) => sha256({ org, text, voice, model, settings, locale: 'es-419' });
export type PublicationKind = 'PAGE_VIDEO' | 'REEL';
export class MockMetaProvider {
  async dryRun(input: unknown, org: string, expectedHash: string, kind: PublicationKind): Promise<Blocked & { kind: PublicationKind; manifest_sha256: string; editorial_ready: boolean }> {
    const manifest = validateManifest(input, org);
    if (!['PAGE_VIDEO', 'REEL'].includes(kind)) throw new Error('UNSUPPORTED_PUBLICATION_KIND');
    if (sha256(manifest) !== expectedHash) throw new Error('STALE_RENDER_HASH');
    return { status: 'BLOCKED_EXTERNAL', provider: 'mock-meta', reason: 'OAuth, App Review, Page, versión Graph, formato y aprobación humana transaccional sin verificar',
      remote_id: null, actual_cost_usd: null, kind, manifest_sha256: expectedHash,
      editorial_ready: manifest.claims.every(c => c.review === 'APPROVED') && manifest.assets.every(a => a.review === 'APPROVED') };
  }
}
export function editorialBlockers(m: Manifest): string[] {
  return [
    ...m.claims.filter(c => c.review !== 'APPROVED').map(c => `claim:${c.id}:${c.review}`),
    ...m.assets.filter(a => a.review !== 'APPROVED').map(a => `license:${a.id}:${a.review}`),
    ...m.assets.filter(a => a.is_reconstruction).map(a => `reconstruction_label_review:${a.id}`),
    'HUMAN_RENDER_APPROVAL_REQUIRED', 'META_ACCOUNT_AND_FORMAT_UNVERIFIED',
  ];
}
