import { routeContext } from '../../../../../src/server/route-helpers';
import { discovery } from '../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const GET = routeContext(discovery);
