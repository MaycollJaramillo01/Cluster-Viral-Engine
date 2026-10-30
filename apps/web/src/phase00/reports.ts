import { z } from 'zod';

const sampleSchema = z.strictObject({ provider: z.enum(['local', 'vercel']), duration_seconds: z.union([z.literal(120), z.literal(240)]),
  wall_ms: z.number().positive(), cpu_ms_sampled: z.number().nonnegative(), peak_rss_bytes_sampled: z.number().nonnegative(),
  artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/), actual_cost_usd: z.number().nonnegative().nullable() });
export type Sample = z.infer<typeof sampleSchema>;
const percentile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * q) - 1)];
export function benchmarkReport(input: unknown) {
  const samples = z.array(sampleSchema).parse(input);
  return ['local', 'vercel'].flatMap(provider => [120, 240].map(duration => {
    const group = samples.filter(s => s.provider === provider && s.duration_seconds === duration);
    return { provider, duration_seconds: duration, n: group.length, status: group.length >= 10 ? 'MEASURED' : provider === 'vercel' && !group.length ? 'BLOCKED_EXTERNAL' : 'INSUFFICIENT_SAMPLES',
      p50_ms: group.length ? percentile(group.map(s => s.wall_ms), 0.5) : null,
      p95_ms: group.length ? percentile(group.map(s => s.wall_ms), 0.95) : null,
      cpu_ms_sampled: group.length ? group.reduce((n, s) => n + s.cpu_ms_sampled, 0) / group.length : null,
      peak_rss_bytes_sampled: group.length ? Math.max(...group.map(s => s.peak_rss_bytes_sampled)) : null,
      mean_cost_usd: group.length && group.every(s => s.actual_cost_usd !== null) ? group.reduce((n, s) => n + s.actual_cost_usd!, 0) / group.length : null };
  }));
}

export const costCategories = ['tts', 'llm', 'render', 'images', 'storage', 'human'] as const;
const costSchema = z.strictObject({ category: z.enum(costCategories), actual_usd: z.number().nonnegative().nullable(),
  estimated_usd: z.number().nonnegative().nullable(), units: z.number().nonnegative().nullable(),
  unit: z.string().min(1), attempts: z.int().positive(), evidence: z.string().min(1) });
export function costReport(input: unknown, fixedMonthly: number | null) {
  const rows = z.array(costSchema).length(costCategories.length).parse(input);
  if (new Set(rows.map(r => r.category)).size !== costCategories.length) throw new Error('DUPLICATE_COST_CATEGORY');
  if (fixedMonthly !== null && (!Number.isFinite(fixedMonthly) || fixedMonthly < 0)) throw new Error('INVALID_FIXED_COST');
  const known = rows.reduce((n, r) => n + (r.actual_usd ?? 0), 0);
  const missing = rows.filter(r => r.actual_usd === null).map(r => r.category);
  return { currency: 'USD', observed_partial_usd: known, observed_per_video_usd: missing.length ? null : known,
    missing, projection_30_usd: missing.length || fixedMonthly === null ? null : known * 30 + fixedMonthly,
    projection_60_usd: missing.length || fixedMonthly === null ? null : known * 60 + fixedMonthly,
    budget_verified: !missing.length && fixedMonthly !== null, fixed_monthly_usd: fixedMonthly, rows };
}

export const ticketIds = Array.from({ length: 12 }, (_, i) => `F00-${String(i + 1).padStart(2, '0')}`);
const evidenceSchema = z.strictObject({ ticket: z.enum(ticketIds as [string, ...string[]]),
  status: z.enum(['PENDING_REVIEW', 'BLOCKED_EXTERNAL', 'VERIFIED']),
  evidence: z.array(z.strictObject({ path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
  accepted_by: z.uuid().nullable(), accepted_at: z.iso.datetime().nullable(), notes: z.string().min(1) });
export function phaseGate(input: unknown, signatures: { editorial: string | null; technical: string | null; client: string | null }) {
  const rows = z.array(evidenceSchema).length(12).parse(input);
  if (new Set(rows.map(r => r.ticket)).size !== 12) throw new Error('DUPLICATE_TICKET');
  const blockers = rows.filter(r => r.status !== 'VERIFIED' || !r.evidence.length || !r.accepted_by || !r.accepted_at).map(r => r.ticket);
  const signed = Object.values(signatures).every(v => typeof v === 'string' && v.trim().length > 0);
  return { decision: blockers.length || !signed ? 'NO_GO' : 'GO', blockers, signed, publication_enabled: false,
    notes: 'Acta local; firmas deben verificarse por comité. Este informe jamás autoriza publicación.' };
}
