import { createHash } from 'node:crypto';
import { z } from 'zod';

const uuid = z.uuid();
const key = z.string().regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*$/)
  .refine(v => !v.split('/').some(p => p === '.' || p === '..'), 'Unsafe path');
const cue = z.strictObject({ start_ms: z.int().nonnegative(), end_ms: z.int().positive(), text: z.string().min(1).max(84) });
export const manifestSchema = z.strictObject({
  version: z.literal('phase00-1'), purpose: z.literal('TECHNICAL_POC'),
  organization_id: uuid, project_id: uuid, revision: z.int().positive(),
  title: z.string().min(1).max(120), width: z.literal(1080), height: z.literal(1920),
  fps: z.literal(30), locale: z.literal('es-419'),
  sources: z.array(z.strictObject({ id: uuid, publisher: z.string().min(1), url: z.url(), retrieved_on: z.iso.date() })).min(2),
  claims: z.array(z.strictObject({ id: uuid, statement: z.string().min(1), source_ids: z.array(uuid).min(1),
    review: z.enum(['PENDING', 'REJECTED', 'APPROVED']) })).min(1),
  assets: z.array(z.strictObject({ id: uuid, object_key: key, source: z.string().min(1),
    license: z.enum(['ORIGINAL', 'LICENSED', 'UNKNOWN']), proof: z.string().min(1),
    review: z.enum(['PENDING', 'REJECTED', 'APPROVED']), is_reconstruction: z.boolean() })).min(8).max(12),
  scenes: z.array(z.strictObject({ id: uuid, start_ms: z.int().nonnegative(), duration_ms: z.int().min(1000).max(60000),
    narration: z.string().min(1), visual_asset_id: uuid, claim_ids: z.array(uuid).min(1),
    motion: z.enum(['zoom_in', 'zoom_out', 'pan_left', 'pan_right']),
    transition: z.enum(['cut', 'fade']), overlay: z.string().min(1).max(80).regex(/^[^{}\\\r\n]+$/),
    subtitle_segments: z.array(cue).min(1) })).min(8).max(24),
});
export type Manifest = z.infer<typeof manifestSchema>;
export type Cue = z.infer<typeof cue>;

export function validateManifest(input: unknown, organizationId: string): Manifest {
  const m = manifestSchema.parse(input);
  if (m.organization_id !== organizationId) throw new Error('FORBIDDEN_ORGANIZATION');
  const unique = (items: { id: string }[]) => new Set(items.map(i => i.id)).size === items.length;
  if (![m.sources, m.claims, m.assets, m.scenes].every(unique)) throw new Error('DUPLICATE_ID');
  const sources = new Set(m.sources.map(s => s.id));
  const claims = new Set(m.claims.map(s => s.id));
  const assets = new Set(m.assets.map(s => s.id));
  if (new Set(m.sources.map(s => new URL(s.url).hostname)).size < 2) throw new Error('INDEPENDENT_SOURCES_REQUIRED');
  for (const c of m.claims) if (c.source_ids.some(id => !sources.has(id))) throw new Error('UNKNOWN_SOURCE');
  let time = 0;
  for (const s of m.scenes) {
    if (s.start_ms !== time) throw new Error('TIMELINE_GAP_OR_OVERLAP');
    if (!assets.has(s.visual_asset_id) || s.claim_ids.some(id => !claims.has(id))) throw new Error('UNKNOWN_REFERENCE');
    let previous = 0;
    for (const c of s.subtitle_segments) {
      if (c.start_ms < previous || c.end_ms <= c.start_ms || c.end_ms > s.duration_ms) throw new Error('INVALID_CUE');
      if (/[{}\\\r\n]/.test(c.text)) throw new Error('UNSAFE_SUBTITLE_MARKUP');
      previous = c.end_ms;
    }
    time += s.duration_ms;
  }
  if (new Set(m.scenes.map(s => s.visual_asset_id)).size < 8) throw new Error('EIGHT_ASSETS_REQUIRED');
  if (time < 120000 || time > 240000) throw new Error('DURATION_OUT_OF_RANGE');
  if (m.assets.some(a => a.license === 'UNKNOWN' || a.review === 'REJECTED')) throw new Error('ASSET_RIGHTS_BLOCKED');
  return m;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const sha256 = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export const manifestJsonSchema = () => z.toJSONSchema(manifestSchema, { unrepresentable: 'throw' });
