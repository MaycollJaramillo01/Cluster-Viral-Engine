import { z } from 'zod';
import { generateInput, regenerateInput, saveScriptInput, scriptDecisionInput, updateSectionInput } from '../scripts/contract';
import * as scripts from '../scripts/store';
import { modelFromEnv } from '../research/model';
import { database, externalRoute, readRoute, revisionParam, uuidParam, writeRoute } from './route-helpers';

const empty = z.strictObject({});
export const readCurrent = readRoute('script.read', 'organization:read', ({ client, params }) => scripts.readScript(client, uuidParam(params, 'projectId')));
export const readVersion = readRoute('script.version', 'organization:read', ({ client, params }) => scripts.readScript(client, uuidParam(params, 'projectId'), revisionParam(params)));
export const save = writeRoute('script.save', 'project:write', saveScriptInput, ({ client, context, params, requestId }, body) => scripts.saveVersion(client, context, uuidParam(params, 'projectId'), body.base_version, body.content, 'HUMAN', { requestId }));
export const updateSection = writeRoute('script.section', 'project:write', updateSectionInput, ({ client, context, params, requestId }, body) => scripts.updateSection(client, context, uuidParam(params, 'projectId'), uuidParam(params, 'sectionKey'), body, { requestId }), 200);
export const submit = writeRoute('script.submit', 'project:write', empty, ({ client, context, params, requestId }) => scripts.submitVersion(client, context, uuidParam(params, 'projectId'), revisionParam(params), { requestId }), 200);
export const decide = writeRoute('script.decide', 'editorial:review', scriptDecisionInput, ({ client, context, params, requestId }, body) => scripts.decideVersion(client, context, uuidParam(params, 'projectId'), revisionParam(params), body, { requestId }), 200);
export const generate = externalRoute('script.generate', generateInput, (identity, params, body, requestId) => {
  const model = modelFromEnv(process.env);
  return scripts.generateScript(database(), identity, params.organizationId, uuidParam(params, 'projectId'), body, model, { requestId });
});
export const regenerate = externalRoute('script.regenerate', regenerateInput, (identity, params, body, requestId) => {
  const model = modelFromEnv(process.env);
  return scripts.regenerateSection(database(), identity, params.organizationId, uuidParam(params, 'projectId'), uuidParam(params, 'sectionKey'), body, model, { requestId });
});
