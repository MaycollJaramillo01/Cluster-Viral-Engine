import { routeContext } from '../../../../../../../src/server/route-helpers';
import { list, request } from '../../../../../../../src/server/render-api';
export const runtime = 'nodejs';
export const GET = routeContext(list);
export const POST = routeContext(request);
