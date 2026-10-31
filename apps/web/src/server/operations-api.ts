import { operationsReport, windowDays } from '../operations/store';
import { readRoute } from './route-helpers';

export const report = readRoute('operations.read', 'organization:read', ({ client, context }, query) => operationsReport(client, context.organizationId, windowDays(query)));
