import { routeContext } from '../../../../../../../../src/server/route-helpers';
import { estimate } from '../../../../../../../../src/server/media-api';
export const runtime = 'nodejs';
export const POST = routeContext(estimate);
