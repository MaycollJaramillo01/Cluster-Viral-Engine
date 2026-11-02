import { z } from 'zod';
import { AppError } from '@cluster/contracts';
import { toAss, toSrt } from '../media/captions';
import type { mediaState } from '../media/store';
import { motions } from '../scripts/contract';

type MediaState = Awaited<ReturnType<typeof mediaState>>;
const hash = z.string().regex(/^[0-9a-f]{64}$/);
// Llega a un archivo ASS: sin llaves ni barras no puede inyectar etiquetas de formato.
const safeText = z.string().trim().min(1).max(200).refine(text => !/[{}\\\r\n]/.test(text));
const objectKey = z.string().regex(/^org\/[0-9a-f-]{36}\/project\/[0-9a-f-]{36}\/[a-z]+\/[0-9a-f]{64}\.(png|jpg|mp4|mp3|wav)$/);
const stored = { object_key: objectKey, content_sha256: hash };
export const renderManifestSchema = z.strictObject({
  schema_version: z.literal(1),
  organization_id: z.uuid(),
  project_id: z.uuid(),
  script_version: z.int().positive(),
  script_sha256: hash,
  format: z.strictObject({ width: z.literal(1080), height: z.literal(1920), fps: z.literal(30) }),
  title: safeText.nullable(),
  total_ms: z.int().min(120000).max(240000),
  scenes: z.array(z.strictObject({
    key: z.string().min(1),
    start_ms: z.int().min(0),
    audio_ms: z.int().positive(),
    pause_ms: z.int().min(0),
    claim_ids: z.array(z.uuid()),
    motion: z.enum(motions),
    transition: z.enum(['cut', 'fade']),
    overlay: safeText.nullable(),
    visual: z.strictObject({ ...stored, asset_id: z.uuid(), kind: z.enum(['IMAGE', 'VIDEO']), is_ai_generated: z.boolean() }),
    voice: z.strictObject({ ...stored, generation_id: z.uuid(), timing_source: z.enum(['PROVIDER', 'SYNTHETIC']) }),
  })).min(1).max(120),
  music: z.strictObject({ ...stored, asset_id: z.uuid(), duration_ms: z.int().positive() }).nullable(),
  captions: z.strictObject({ srt: z.string().min(1), ass: z.string().min(1) }),
  credits: z.array(z.string().min(1)),
}).superRefine((manifest, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  let clock = 0;
  for (const scene of manifest.scenes) {
    if (scene.start_ms !== clock) issue('TIMING_NOT_CONTIGUOUS');
    clock += scene.audio_ms + scene.pause_ms;
    if (scene.visual.is_ai_generated && !scene.overlay) issue('AI_NOT_LABELLED');
    if (!/\.(png|jpg)$/.test(scene.visual.object_key) && scene.visual.kind === 'IMAGE') issue('VISUAL_KIND_MISMATCH');
    if (!/\.mp4$/.test(scene.visual.object_key) && scene.visual.kind === 'VIDEO') issue('VISUAL_KIND_MISMATCH');
    if (!/\.(mp3|wav)$/.test(scene.voice.object_key)) issue('VOICE_NOT_AUDIO');
  }
  if (clock !== manifest.total_ms) issue('TOTAL_MISMATCH');
  if (manifest.scenes.at(-1)?.pause_ms) issue('TRAILING_PAUSE');
  if (new Set(manifest.scenes.map(scene => scene.key)).size !== manifest.scenes.length) issue('DUPLICATE_SCENE');
  if (manifest.music && !/\.(mp3|wav)$/.test(manifest.music.object_key)) issue('MUSIC_NOT_AUDIO');
  // La voz puede vivir en otro proyecto de la organización por la caché; nunca en otra organización.
  const keys = [...manifest.scenes.flatMap(scene => [scene.visual.object_key, scene.voice.object_key]), ...(manifest.music ? [manifest.music.object_key] : [])];
  if (keys.some(key => !key.startsWith(`org/${manifest.organization_id}/`))) issue('FOREIGN_OBJECT');
});
export type RenderManifest = z.infer<typeof renderManifestSchema>;
export const manifestJsonSchema = () => z.toJSONSchema(renderManifestSchema, { unrepresentable: 'throw' });

const TITLE_MS = 3500;
// Parte solo de un estado de medios sin bloqueos: los derechos y el guion ya se comprobaron en la misma transacción.
export function buildManifest(organizationId: string, projectId: string, media: MediaState, title: string | null): RenderManifest {
  const { state, assets, voices, timed } = media;
  if (state.blockers.length) throw new AppError('BLOCKED_BY_POLICY', 409);
  const asset = (id: string | null) => assets.get(id!)!, usedAssets = [...state.timeline.map(t => asset(t.visual_asset_id)), ...(state.music_asset_id ? [asset(state.music_asset_id)] : [])];
  const music = state.music_asset_id ? asset(state.music_asset_id) : null;
  const parsed = renderManifestSchema.safeParse({
    schema_version: 1, organization_id: organizationId, project_id: projectId,
    script_version: state.script_version, script_sha256: state.script_sha256,
    format: { width: 1080, height: 1920, fps: 30 }, title, total_ms: state.total_ms,
    scenes: state.timeline.map(t => {
      const visual = asset(t.visual_asset_id), voice = voices.get(t.voice_generation_id!)!;
      return { key: t.scene_key, start_ms: t.start_ms, audio_ms: t.audio_ms, pause_ms: t.pause_ms, claim_ids: t.claim_ids, motion: t.motion, transition: t.transition, overlay: t.overlay,
        visual: { asset_id: visual.id, object_key: visual.object_key, content_sha256: visual.content_sha256, kind: visual.kind, is_ai_generated: visual.is_ai_generated },
        voice: { generation_id: voice.id, object_key: voice.object_key, content_sha256: voice.content_sha256, timing_source: voice.timing_source } };
    }),
    music: music ? { asset_id: music.id, object_key: music.object_key, content_sha256: music.content_sha256, duration_ms: music.duration_ms } : null,
    captions: { srt: toSrt(timed.cues), ass: toAss(timed.cues, timed.overlays, title ? [{ start_ms: 0, end_ms: Math.min(TITLE_MS, state.total_ms), text: title }] : []) },
    credits: [...new Set(usedAssets.flatMap(a => a.licenses.at(-1)?.attribution_required ? a.licenses.at(-1)!.attribution_text ?? [] : []))].sort(),
  });
  if (!parsed.success) throw new AppError('BLOCKED_BY_POLICY', 409);
  return parsed.data;
}
