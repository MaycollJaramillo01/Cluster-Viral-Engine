import { z } from 'zod';

export const categories = ['CRIME_HISTORY', 'ORGANIZED_CRIME', 'UNSOLVED', 'MYSTERY', 'HISTORY', 'CONTROVERSIAL_FIGURES', 'MONEY_POWER', 'SOCIAL'] as const;
export const classifications = ['CONFIRMED', 'DISPUTED', 'ALLEGATION', 'UNVERIFIED', 'OPINION', 'RECONSTRUCTION'] as const;
export const legalStatuses = ['NONE', 'INVESTIGATED', 'ACCUSED', 'CONVICTED', 'ACQUITTED', 'OPEN_PROCEEDING'] as const;
export const riskCategories = ['CRIME', 'VICTIM', 'MINOR', 'UNSTABLE_SOURCE', 'RECONSTRUCTION', 'LIVING_PERSON'] as const;
export type RiskCategory = typeof riskCategories[number];
export type Classification = typeof classifications[number];

const shortText = z.string().trim().max(500);
const date = z.iso.date();

export const factorKeys = ['hook', 'curiosity', 'conflict', 'relevance', 'shareability', 'visual', 'source_quality', 'similar'] as const;
export const factorsSchema = z.strictObject(Object.fromEntries(factorKeys.map(key => [key,
  z.strictObject({ value: z.number().min(0).max(100), reason: z.string().trim().min(3).max(300) })])) as
  Record<typeof factorKeys[number], z.ZodObject<{ value: z.ZodNumber; reason: z.ZodString }>>);
export type ScoreFactors = z.infer<typeof factorsSchema>;

export const storyInput = z.strictObject({
  proposed_title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(2000).default(''),
  hook: shortText.default(''),
  category: z.enum(categories).nullable().default(null),
  interest_reason: shortText.default(''),
  source_availability: shortText.default(''),
  visual_potential: shortText.default(''),
  risk_notes: shortText.default(''),
  editorial_risk: z.enum(['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH']).default('UNKNOWN'),
  factors: factorsSchema.optional(),
});
export type StoryInput = z.infer<typeof storyInput>;

export const storyFilters = z.strictObject({
  status: z.enum(['CANDIDATE', 'SELECTED', 'REJECTED', 'ARCHIVED']).optional(),
  category: z.enum(categories).optional(),
  min_score: z.coerce.number().min(0).max(100).optional(),
  include_high_risk: z.enum(['true', 'false']).default('false'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const count = z.number().int().min(0).nullable().default(null);
export const referenceInput = z.strictObject({
  url: z.string().trim().max(2000),
  story_id: z.uuid().nullable().default(null),
  source_version: z.string().trim().min(1).max(80).default('manual-v1'),
  permissions_note: z.string().trim().min(3).max(300).default('MANUAL'),
  metrics: z.strictObject({ views: count, interactions: count, observed_on: date.nullable().default(null) }).nullable().default(null),
  analysis: z.strictObject({
    title: shortText.optional(), topic: shortText.optional(), hook: shortText.optional(),
    duration_seconds: z.number().int().positive().max(86400).optional(), published_on: date.optional(),
    structure: shortText.optional(), pacing: shortText.optional(), visual_resources: shortText.optional(), success_patterns: shortText.optional(),
  }).default({}),
});
export type ReferenceInput = z.infer<typeof referenceInput>;

export const sourceInput = z.strictObject({
  url: z.string().trim().max(2000),
  title: shortText.default(''),
  publisher: z.string().trim().min(1).max(200),
  author: z.string().trim().max(200).nullable().default(null),
  publication_date: date.nullable().default(null),
  retrieved_at: z.iso.datetime(),
  source_type: z.enum(['PRIMARY', 'SECONDARY', 'OTHER']),
  evidence_excerpt: z.string().trim().min(1).max(600),
  license_note: shortText.default(''),
});
export type SourceInput = z.infer<typeof sourceInput>;

export const evidenceInput = z.strictObject({
  source_id: z.uuid(),
  relation: z.enum(['SUPPORTS', 'CONTRADICTS', 'CONTEXT']),
  excerpt: z.string().trim().max(600).nullable().default(null),
});
const claimFields = {
  statement: z.string().trim().min(3).max(1000),
  classification: z.enum(classifications),
  subject: z.string().trim().max(200).default(''),
  event_date: date.nullable().default(null),
  legal_status: z.enum(legalStatuses).default('NONE'),
  risk_categories: z.array(z.enum(riskCategories)).max(riskCategories.length).default([]),
};
export const claimInput = z.strictObject({ ...claimFields, evidence: z.array(evidenceInput).min(1).max(20) });
export type ClaimInput = z.infer<typeof claimInput>;
export const claimPatch = z.strictObject(claimFields);
export type ClaimPatch = z.infer<typeof claimPatch>;

export const decisionInput = z.strictObject({
  decision: z.enum(['APPROVED', 'REJECTED']),
  target_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  note: z.string().trim().max(1000).default(''),
}).refine(value => value.decision === 'APPROVED' || value.note.length >= 3, { path: ['note'] });
export type DecisionInput = z.infer<typeof decisionInput>;

export const proposalRequest = z.strictObject({
  idempotency_key: z.string().trim().min(8).max(120),
  topic: z.string().trim().min(3).max(200),
  category: z.enum(categories).nullable().default(null),
});
export const extractionRequest = z.strictObject({ idempotency_key: z.string().trim().min(8).max(120) });

export const researchPlanSchema = z.strictObject({
  story_title: z.string(),
  context: z.string(),
  risks: z.array(z.string()),
  queries: z.array(z.strictObject({
    query: z.string().min(3),
    kind: z.enum(['PRIMARY', 'SECONDARY', 'CONTRAST']),
    window: z.enum(['EVENT_PERIOD', 'LATEST_24_MONTHS', 'ANY']),
    rationale: z.string().min(3),
  })).min(5).max(10),
}).refine(plan => ['PRIMARY', 'SECONDARY', 'CONTRAST'].every(kind => plan.queries.some(q => q.kind === kind)), { path: ['queries'] });
export type ResearchPlan = z.infer<typeof researchPlanSchema>;

export type DossierSource = { id: string; url: string; title: string; publisher: string | null; author: string | null; publication_date: string | null;
  retrieved_at: string; source_type: string; evidence_excerpt: string | null; license_note: string; independence_key: string | null };
export type DossierEvidence = { source_id: string; relation: string; excerpt: string | null };
export type DossierClaim = { id: string; statement: string; classification: Classification; sensitivity: string; subject: string; event_date: string | null;
  legal_status: string; risk_categories: string[]; origin: string; evidence: DossierEvidence[] };
export type DossierConflict = { type: 'SOURCE_CONTRADICTION' | 'LEGAL_STATUS' | 'DATE'; subject: string; claim_ids: string[] };
export type DossierContent = { project_id: string; story_title: string; sources: DossierSource[]; claims: DossierClaim[];
  timeline: { date: string; claim_id: string; statement: string; classification: string }[]; conflicts: DossierConflict[] };
export type GateIssue = { code: string; claim_id?: string };
