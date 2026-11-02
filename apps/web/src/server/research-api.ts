import { z } from 'zod';
import { AppError } from '@cluster/contracts';
import { claimInput, claimPatch, decisionInput, extractionRequest, proposalRequest, referenceInput, sourceInput, storyFilters, storyInput } from '../research/contract';
import { modelFromEnv } from '../research/model';
import { discoveryCapabilities } from '../research/policy';
import * as research from '../research/store';
import { database, readRoute, revisionParam, uuidParam, writeRoute, externalRoute } from './route-helpers';

const empty = z.strictObject({});

export const listStories = readRoute('stories.list', 'organization:read', async ({ client }, query) => {
  const filters = storyFilters.safeParse(Object.fromEntries(query));
  if (!filters.success) throw new AppError('INVALID_INPUT', 400);
  return { stories: await research.listStories(client, filters.data) };
});
export const createStory = writeRoute('stories.create', 'project:write', storyInput, ({ client, context, requestId }, body) => research.createStory(client, context, body, { requestId }));
export const selectStory = writeRoute('stories.select', 'project:write', empty, ({ client, context, params, requestId }) => research.selectStory(client, context, uuidParam(params, 'storyId'), { requestId }));
export const proposeStories = externalRoute('stories.propose', proposalRequest, (identity, params, body, requestId) => {
  const model = modelFromEnv(process.env);
  return research.proposeStories(database(), identity, params.organizationId, body, model, { requestId });
});
export const listReferences = readRoute('references.list', 'organization:read', async ({ client }) => ({ references: await research.listReferences(client) }));
export const createReference = writeRoute('references.create', 'project:write', referenceInput, ({ client, context, requestId }, body) => research.createReference(client, context, body, { requestId }));
export const discovery = readRoute('discovery.capabilities', 'organization:read', async () => ({ platforms: discoveryCapabilities() }));

export const createPlan = writeRoute('research.plan', 'project:write', empty, ({ client, context, params, requestId }) => research.createResearchPlan(client, context, uuidParam(params, 'projectId'), { requestId }));
export const addSource = writeRoute('research.source', 'project:write', sourceInput, ({ client, context, params, requestId }, body) => research.addSource(client, context, uuidParam(params, 'projectId'), body, { requestId }));
export const addClaim = writeRoute('research.claim', 'project:write', claimInput, ({ client, context, params, requestId }, body) => research.addClaim(client, context, uuidParam(params, 'projectId'), body, { requestId }));
export const updateClaim = writeRoute('research.claim.update', 'project:write', claimPatch, ({ client, context, params, requestId }, body) => research.updateClaim(client, context, uuidParam(params, 'projectId'), uuidParam(params, 'claimId'), body, { requestId }), 200);
export const verifyClaim = writeRoute('research.claim.verify', 'editorial:review', empty, ({ client, context, params, requestId }) => research.verifyClaim(client, context, uuidParam(params, 'projectId'), uuidParam(params, 'claimId'), { requestId }), 200);
export const extractClaims = externalRoute('research.claim.extract', extractionRequest, (identity, params, body, requestId) => {
  const model = modelFromEnv(process.env);
  return research.extractClaims(database(), identity, params.organizationId, uuidParam(params, 'projectId'), body, model, { requestId });
});
export const freezeDossier = writeRoute('dossier.freeze', 'project:write', empty, ({ client, context, params, requestId }) => research.freezeDossier(client, context, uuidParam(params, 'projectId'), { requestId }));
export const readDossier = readRoute('dossier.read', 'organization:read', ({ client, params }) => research.readDossier(client, uuidParam(params, 'projectId'), revisionParam(params)));
export const decideDossier = writeRoute('dossier.decide', 'editorial:review', decisionInput, ({ client, context, params, requestId }, body) => research.decideDossier(client, context, uuidParam(params, 'projectId'), revisionParam(params), body, { requestId }), 200);
