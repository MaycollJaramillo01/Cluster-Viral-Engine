import { z } from 'zod';
import { AppError } from '@cluster/contracts';
import * as renders from '../render/store';
import { parseConfig } from './config';
import { readRoute, uuidParam, writeRoute } from './route-helpers';

const listFilters = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
export const request = writeRoute('render.request', 'project:write', renders.renderInput, ({ client, context, params, requestId }, body) => renders.requestRender(client, context, uuidParam(params, 'projectId'), body, { requestId }), 202);
export const list = readRoute('render.list', 'organization:read', ({ client, params }, query) => {
  const parsed = listFilters.safeParse(Object.fromEntries(query));
  if (!parsed.success) throw new AppError('INVALID_INPUT', 400);
  return renders.listRenders(client, uuidParam(params, 'projectId'), parsed.data.limit);
});
export const read = readRoute('render.read', 'organization:read', ({ client, params }) => renders.readRender(client, uuidParam(params, 'projectId'), uuidParam(params, 'renderId')));
export const urls = readRoute('render.urls', 'organization:read', ({ client, params }) => renders.renderUrls(client, uuidParam(params, 'projectId'), uuidParam(params, 'renderId'), parseConfig(process.env).BETTER_AUTH_SECRET));
export const cancel = writeRoute('render.cancel', 'project:write', z.strictObject({}), ({ client, context, params, requestId }) => renders.cancelRender(client, context, uuidParam(params, 'projectId'), uuidParam(params, 'renderId'), { requestId }), 202);
