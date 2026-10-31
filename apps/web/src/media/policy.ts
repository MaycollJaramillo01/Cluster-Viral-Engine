import type { Cue } from '../phase00/contract';
import { sha256 } from '../phase00/contract';
import { alignmentToCues } from '../phase00/subtitles';
import type { ScenePlan } from '../scripts/contract';
import { captionLayout, toAss, toSrt } from './captions';

export type MediaIssue = { code: string; ref?: string };
export type LicenseRow = { commercial_use_allowed: boolean; attribution_required: boolean; attribution_text: string | null; license_url: string | null; proof_object_key: string | null; expires_at: string | Date | null };
export type AssetRow = { id: string; object_key: string; content_sha256: string; purpose: string; kind: string; approval_status: string; is_ai_generated: boolean; ai_label: string | null; alt_text: string | null; width: number | null; height: number | null; duration_ms: number | null };
export type VoiceRow = { id: string; object_key: string; content_sha256: string; text_sha256: string; duration_ms: number; timing_source: 'PROVIDER' | 'SYNTHETIC'; alignment: { characters: string[]; starts: number[]; ends: number[] } };

// La licencia vigente es la última registrada; se reevalúa en cada lectura porque puede vencer después de aprobada.
export function assetIssues(asset: Pick<AssetRow, 'id' | 'purpose' | 'is_ai_generated' | 'ai_label'>, licenses: LicenseRow[], now = new Date()): MediaIssue[] {
  if (asset.purpose === 'PROOF') return [];
  const issues: MediaIssue[] = [], ref = asset.id, current = licenses.at(-1);
  if (asset.is_ai_generated && !asset.ai_label) issues.push({ code: 'AI_NOT_LABELLED', ref });
  if (!current) return [...issues, { code: 'NO_LICENSE', ref }];
  if (current.expires_at && new Date(current.expires_at) <= now) issues.push({ code: 'LICENSE_EXPIRED', ref });
  if (!current.commercial_use_allowed) issues.push({ code: 'COMMERCIAL_USE_NOT_ALLOWED', ref });
  if (current.attribution_required && !current.attribution_text) issues.push({ code: 'ATTRIBUTION_MISSING', ref });
  if (!current.license_url && !current.proof_object_key) issues.push({ code: 'LICENSE_WITHOUT_PROOF', ref });
  return issues;
}

// Pausas entre clips: la duración final es audio más pausas, no una estimación por palabras (docs/08).
export const SCENE_PAUSE_MS = 150, SECTION_PAUSE_MS = 400;
const MIN_DISTINCT_VISUALS = 8, MIN_SHORT_SIDE = 720, MIN_CONTRAST = 4.5, MAX_CUE_CHARS = 84;
// ponytail: márgenes de partida sin verificar contra Meta (10 % arriba, 15 % abajo, 6 % a los lados); ajustarlos al validar formato en F06.
const safeArea = { top: 192, bottom: 288, side: 65 };
const luminance = (rgb: number) => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(rgb >> 16 & 255) + 0.7152 * channel(rgb >> 8 & 255) + 0.0722 * channel(rgb & 255);
};
export function contrastRatio(a: number, b: number) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

type Licensed = AssetRow & { licenses: LicenseRow[] };
export function evaluateMedia(input: { scenes: ScenePlan[]; visuals: Map<string, Licensed>; voices: Map<string, VoiceRow>; music: Licensed | null; now?: Date }) {
  const now = input.now ?? new Date(), blockers: MediaIssue[] = [], warnings: MediaIssue[] = [], cues: Cue[] = [], overlays: Cue[] = [];
  const rights = (asset: Licensed) => {
    if (asset.approval_status !== 'APPROVED') blockers.push({ code: 'ASSET_NOT_APPROVED', ref: asset.id });
    blockers.push(...assetIssues(asset, asset.licenses, now));
  };
  let clock = 0;
  const timeline = input.scenes.map((scene, index) => {
    const visual = input.visuals.get(scene.key) ?? null, candidate = input.voices.get(scene.key) ?? null;
    if (visual) rights(visual); else blockers.push({ code: 'VISUAL_MISSING', ref: scene.key });
    const voice = candidate?.text_sha256 === sha256(scene.narration) ? candidate : null;
    if (!candidate) blockers.push({ code: 'VOICE_MISSING', ref: scene.key });
    else if (!voice) blockers.push({ code: 'VOICE_STALE', ref: scene.key });
    const next = input.scenes[index + 1], audio_ms = voice?.duration_ms ?? scene.duration_ms;
    const pause_ms = !next ? 0 : next.section_key === scene.section_key ? SCENE_PAUSE_MS : SECTION_PAUSE_MS;
    const start_ms = clock;
    clock += audio_ms + pause_ms;
    if (voice) {
      try {
        for (const cue of alignmentToCues(voice.alignment.characters, voice.alignment.starts, voice.alignment.ends)) cues.push({ ...cue, start_ms: cue.start_ms + start_ms, end_ms: cue.end_ms + start_ms });
      } catch { blockers.push({ code: 'CUES_INVALID', ref: scene.key }); }
      if (voice.timing_source !== 'PROVIDER') warnings.push({ code: 'SYNTHETIC_TIMING', ref: scene.key });
    }
    const overlay = visual?.is_ai_generated ? visual.ai_label : null;
    if (overlay) overlays.push({ start_ms, end_ms: start_ms + audio_ms, text: overlay });
    return { scene_key: scene.key, section_key: scene.section_key, narration: scene.narration, claim_ids: scene.claim_ids, motion: scene.motion, transition: scene.transition, overlay, start_ms, audio_ms, pause_ms,
      timing: voice ? voice.timing_source : 'ESTIMATED', visual_asset_id: visual?.id ?? null, voice_generation_id: voice?.id ?? null };
  });
  if (input.music) {
    rights(input.music);
    if (!input.music.duration_ms) blockers.push({ code: 'MUSIC_WITHOUT_DURATION', ref: input.music.id });
  }
  if (clock < 120000 || clock > 240000) blockers.push({ code: 'DURATION_OUT_OF_RANGE' });

  const distinct = new Set(timeline.flatMap(t => t.visual_asset_id ?? [])).size, wanted = Math.min(MIN_DISTINCT_VISUALS, timeline.length);
  const repeated = timeline.filter((t, i) => t.visual_asset_id && t.visual_asset_id === timeline[i - 1]?.visual_asset_id).map(t => t.scene_key);
  const visuals = [...input.visuals.values()], lowRes = visuals.filter(v => v.width !== null && v.height !== null && Math.min(v.width, v.height) < MIN_SHORT_SIDE).map(v => v.id);
  const { margin_top, margin_bottom, margin_side, text_rgb, outline_rgb } = captionLayout, contrast = contrastRatio(text_rgb, outline_rgb);
  const row = (check: string, passed: boolean, detail: unknown) => ({ check, status: passed ? 'PASS' : 'FAIL', detail });
  const qa = [
    row('alt_text', visuals.every(v => v.alt_text), visuals.filter(v => !v.alt_text).map(v => v.id)),
    row('contrast_subtitle_outline', contrast >= MIN_CONTRAST, Math.round(contrast * 10) / 10),
    row('safe_area', margin_top >= safeArea.top && margin_bottom >= safeArea.bottom && margin_side >= safeArea.side, { layout: { margin_top, margin_bottom, margin_side }, required: safeArea }),
    row('line_breaks', cues.every(c => c.text.length <= MAX_CUE_CHARS), cues.filter(c => c.text.length > MAX_CUE_CHARS).length),
    row('broll_variety', distinct >= wanted && !repeated.length, { distinct, wanted, repeated }),
    row('resolution', !lowRes.length, lowRes),
    row('ai_labels', visuals.every(v => !v.is_ai_generated || v.ai_label), visuals.filter(v => v.is_ai_generated && !v.ai_label).map(v => v.id)),
    { check: 'human_visual_review', status: 'NEEDS_HUMAN', detail: 'Contraste sobre la imagen real, legibilidad y movimiento: requieren revisión de una persona.' },
  ];
  for (const failed of qa) if (failed.status === 'FAIL') warnings.push({ code: `QA_${failed.check.toUpperCase()}` });
  return { blockers, warnings, qa, timeline, total_ms: clock, duration_is_estimate: timeline.some(t => t.timing === 'ESTIMATED'), captions: { srt: toSrt(cues), ass: toAss(cues, overlays) }, cue_count: cues.length };
}
