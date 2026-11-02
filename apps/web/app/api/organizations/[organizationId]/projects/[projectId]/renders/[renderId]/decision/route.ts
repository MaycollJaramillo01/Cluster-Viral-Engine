import { routeContext } from '../../../../../../../../../src/server/route-helpers';
import { decide } from '../../../../../../../../../src/server/render-api';
export const runtime = 'nodejs';
export const POST = routeContext(decide);
