import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ }).max(2000);
export const assetPurposes = ['VISUAL', 'MUSIC', 'SFX', 'PROOF'] as const;
export const assetMetadataInput = z.strictObject({
  name: z.string().trim().min(3).max(200),
  purpose: z.enum(assetPurposes),
  source_name: z.string().trim().min(2).max(200),
  original_source_url: httpUrl.nullable().default(null),
  alt_text: z.string().trim().min(3).max(500).nullable().default(null),
  duration_ms: z.int().positive().max(1800000).nullable().default(null),
  is_ai_generated: z.boolean().default(false),
  // El rótulo se dibuja sobre el video: mismas restricciones que un overlay de ASS.
  ai_label: z.string().trim().min(3).max(80).regex(/^[^{}\\\r\n]+$/).nullable().default(null),
  ai_prompt: z.string().trim().min(3).max(2000).nullable().default(null),
  ai_provider: z.string().trim().min(2).max(80).nullable().default(null),
  ai_cost_usd: z.number().min(0).max(1000).default(0),
}).refine(v => !v.is_ai_generated || Boolean(v.ai_label && v.ai_prompt && v.ai_provider), { path: ['ai_label'] })
  .refine(v => !['MUSIC', 'SFX'].includes(v.purpose) || v.duration_ms !== null, { path: ['duration_ms'] });
export type AssetMetadata = z.infer<typeof assetMetadataInput>;

export const licenseInput = z.strictObject({
  author: z.string().trim().min(2).max(200),
  license_name: z.string().trim().min(2).max(120),
  license_url: httpUrl.nullable().default(null),
  proof_asset_id: z.uuid().nullable().default(null),
  allowed_use: z.string().trim().min(3).max(500),
  commercial_use_allowed: z.boolean(),
  attribution_required: z.boolean(),
  attribution_text: z.string().trim().min(2).max(300).nullable().default(null),
  expires_at: z.iso.datetime({ offset: true }).nullable().default(null),
}).refine(v => Boolean(v.license_url || v.proof_asset_id), { path: ['license_url'] })
  .refine(v => !v.attribution_required || Boolean(v.attribution_text), { path: ['attribution_text'] });
export type LicenseInput = z.infer<typeof licenseInput>;

export const assignVisualInput = z.strictObject({ asset_id: z.uuid() });
export const assignMusicInput = z.strictObject({ asset_id: z.uuid().nullable() });

export const voiceSettings = z.strictObject({
  stability: z.number().min(0).max(1).default(0.5),
  similarity_boost: z.number().min(0).max(1).default(0.75),
  style: z.number().min(0).max(1).default(0),
  speed: z.number().min(0.7).max(1.2).default(1),
  use_speaker_boost: z.boolean().default(true),
});
export type VoiceSettings = z.infer<typeof voiceSettings>;
export const voiceTarget = z.strictObject({
  // voice_id entra en la ruta del proveedor: nunca texto libre.
  voice_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  model_id: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
  settings: voiceSettings.prefault({}),
});
export const voiceInput = voiceTarget.extend({
  scene_keys: z.array(z.string().min(1).max(100)).min(1).max(100).nullable().default(null),
  // Un TTS sin respuesta pudo cobrarse. Repetirlo es una decisión explícita, no un reintento automático.
  confirm_retry: z.boolean().default(false),
});
export type VoiceTarget = z.infer<typeof voiceTarget>;
export type VoiceInput = z.infer<typeof voiceInput>;
