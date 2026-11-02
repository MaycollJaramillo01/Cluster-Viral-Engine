import { z } from 'zod';

export const beats = ['HOOK', 'CONTEXT', 'DEVELOPMENT', 'REVELATION', 'OUTCOME'] as const;
const line = z.string().trim().min(3).max(200);
export const sectionSchema = z.strictObject({
  key: z.uuid(),
  beat: z.enum(beats),
  text: z.string().trim().min(3).max(4000),
  claim_ids: z.array(z.uuid()).max(30),
  // Solo para transiciones sin afirmaciones de hecho; el revisor las ve señaladas.
  non_factual: z.boolean().default(false),
});
export type Section = z.infer<typeof sectionSchema>;
export const scriptFields = z.strictObject({
  locale: z.literal('es-419').default('es-419'),
  tone: z.string().trim().min(3).max(120),
  target_seconds: z.int().min(120).max(240),
  voice_wpm: z.int().min(90).max(220).default(150),
  title_options: z.array(line).min(3).max(10),
  hooks: z.array(line).length(3),
  selected_hook: z.int().min(0).max(2),
  sections: z.array(sectionSchema).min(1).max(40),
  disclaimers: z.array(line).max(10).default([]),
});
export const scriptContentSchema = scriptFields.refine(content => new Set(content.sections.map(s => s.key)).size === content.sections.length, { path: ['sections'] });
export type ScriptContent = z.infer<typeof scriptContentSchema>;

export const saveScriptInput = z.strictObject({ base_version: z.int().min(0), content: scriptContentSchema });
export const updateSectionInput = z.strictObject({ base_version: z.int().positive(), text: sectionSchema.shape.text, claim_ids: sectionSchema.shape.claim_ids, non_factual: z.boolean().default(false) });
export const generateInput = z.strictObject({ idempotency_key: z.string().trim().min(8).max(120), tone: z.string().trim().min(3).max(120), target_seconds: z.int().min(120).max(240) });
export const regenerateInput = z.strictObject({ idempotency_key: z.string().trim().min(8).max(120), base_version: z.int().positive(), instruction: z.string().trim().max(300).default('') });
export const scriptDecisionInput = z.strictObject({
  decision: z.enum(['APPROVED', 'REJECTED']),
  target_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  note: z.string().trim().max(1000).default(''),
}).refine(value => value.decision === 'APPROVED' || value.note.length >= 3, { path: ['note'] });
export type ScriptDecision = z.infer<typeof scriptDecisionInput>;

export const motions = ['zoom_in', 'pan_left', 'zoom_out', 'pan_right'] as const;
export const scenePlanSchema = z.strictObject({
  key: z.string().min(1),
  section_key: z.uuid(),
  beat: z.enum(beats),
  narration: z.string().min(1),
  claim_ids: z.array(z.uuid()),
  duration_ms: z.int().positive(),
  timing: z.literal('ESTIMATED'),
  asset_hint: z.string(),
  motion: z.enum(motions),
  transition: z.enum(['cut', 'fade']),
  on_screen_text: z.string().max(80),
  audio_object_key: z.null(),
  visual_asset_id: z.null(),
});
export type ScenePlan = z.infer<typeof scenePlanSchema>;
