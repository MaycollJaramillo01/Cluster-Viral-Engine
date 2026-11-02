import { routeContext } from '../../../../../src/server/route-helpers';
import { report } from '../../../../../src/server/operations-api';
export const runtime = 'nodejs';
export const GET = routeContext(report);
